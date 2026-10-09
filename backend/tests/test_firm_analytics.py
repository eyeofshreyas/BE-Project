"""Tests for the Firm Analytics tab's aggregation: role gate, org scoping, active-case
counts, and same-day multi-case hearing conflicts."""
import inspect
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.admin import get_firm_analytics
from app.controllers.cases import MAX_CASES


def _role_gate(fn):
    """The dependency FastAPI resolves for `fn`'s profile parameter -- calling the
    controller directly skips it, so a role gate has to be exercised through this."""
    return inspect.signature(fn).parameters["profile"].default.dependency


def _fake_supabase(case_rows, hearing_rows):
    # Cached per table name (not a fresh MagicMock on every call) -- two tests below assert
    # on call history (e.g. `.select.assert_not_called()`), which only means anything if
    # `fake.table("hearings")` in the assertion returns the *same* mock the code under test
    # touched, not a brand-new untouched one. Same pattern as test_admin.py's
    # `_fake_supabase_for_invite`.
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "cases":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = case_rows
        elif name == "hearings":
            m.select.return_value.eq.return_value.gte.return_value.in_.return_value.execute.return_value.data = hearing_rows
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def _case_row(case_id, status, claim_value, lawyer_ids):
    return {
        "case_id": case_id,
        "case_title": f"Matter {case_id}",
        "status": status,
        "claim_value": claim_value,
        "client_id": 900 + case_id,
        "clients": {"users": {"full_name": f"Client {case_id}"}},
        "case_types": {"case_type_name": "Civil"},
        "case_lawyers": [
            {"lawyer_id": lid, "is_active": True, "lawyers": {"users": {"full_name": f"Lawyer {lid}"}}}
            for lid in lawyer_ids
        ],
    }


def test_firm_analytics_rejects_every_role_except_admin():
    """Verifies LAWYER, CLIENT, and SUPER_ADMIN are all rejected -- this endpoint has no
    SUPER_ADMIN exception, unlike every other admin-console endpoint. Exercises:
    `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    gate = _role_gate(get_firm_analytics)
    for role_id in (auth.LAWYER, auth.CLIENT, auth.SUPER_ADMIN):
        try:
            gate({"role_id": role_id, "user_id": 1})
            assert False, f"expected HTTPException for role_id={role_id}"
        except HTTPException as e:
            assert e.status_code == 403


def test_firm_analytics_scopes_cases_query_to_callers_org():
    """Verifies the cases query is filtered to the caller's own org_id, and an org with no
    cases short-circuits without querying hearings at all. Exercises:
    `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    fake = _fake_supabase(case_rows=[], hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        result = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert result == {"cases": [], "workload": []}
    fake.table("cases").select.return_value.eq.assert_called_once_with("org_id", 7)
    fake.table("hearings").select.assert_not_called()


def test_firm_analytics_passes_through_claim_value_including_null():
    """Verifies claim_value is passed straight through unchanged, including null --
    the exposure sum itself is computed client-side over this array, not here.
    Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [_case_row(1, "Open", 500000, [5]), _case_row(2, "Open", None, [5])]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        result = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    by_id = {c["case_id"]: c["claim_value"] for c in result["cases"]}
    assert by_id == {1: 500000, 2: None}


def test_firm_analytics_active_cases_excludes_closed():
    """Verifies a lawyer on 2 non-Closed cases and 1 Closed case shows active_cases: 2.
    Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [
        _case_row(1, "Open", None, [5]),
        _case_row(2, "In Progress", None, [5]),
        _case_row(3, "Closed", None, [5]),
    ]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        result = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert len(result["workload"]) == 1
    assert result["workload"][0]["active_cases"] == 2


def test_firm_analytics_flags_conflict_only_across_distinct_cases_same_date():
    """Verifies two Scheduled hearings for the same lawyer on the same date flag a
    conflict only when they belong to two different cases -- the same case re-listed
    twice on one day (see HearingCreate.allow_duplicate) is not a conflict.
    Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [_case_row(1, "Open", None, [5]), _case_row(2, "Open", None, [5])]

    same_case_twice = [
        {"case_id": 1, "hearing_date": "2026-10-01"},
        {"case_id": 1, "hearing_date": "2026-10-01"},
    ]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=same_case_twice)
    with patch("app.controllers.admin.supabase", fake):
        result = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert result["workload"][0]["conflict_dates"] == []
    assert result["workload"][0]["upcoming_hearings"] == 2

    two_different_cases = [
        {"case_id": 1, "hearing_date": "2026-10-01"},
        {"case_id": 2, "hearing_date": "2026-10-01"},
    ]
    fake2 = _fake_supabase(case_rows=case_rows, hearing_rows=two_different_cases)
    with patch("app.controllers.admin.supabase", fake2):
        result2 = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert result2["workload"][0]["conflict_dates"] == ["2026-10-01"]


def test_firm_analytics_excludes_lawyers_never_assigned_to_a_case():
    """Verifies the workload table has exactly one row per lawyer who actually appears on
    a case -- no zeroed-out rows for lawyers who never touched this org's cases.
    Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [_case_row(1, "Open", None, [5])]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        result = get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert [w["lawyer_id"] for w in result["workload"]] == [5]


def test_firm_analytics_caps_the_cases_query():
    """Verifies the cases query is capped at MAX_CASES, the same as every other list query
    in this codebase (list_cases, list_users) -- an unbounded select here would either
    silently truncate the exposure total (if PostgREST's db-max-rows is configured) or, for
    a large org, build an oversized case_id IN-list against `hearings` risking a 414.
    Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [_case_row(1, "Open", None, [5])]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    fake.table("cases").select.return_value.eq.return_value.limit.assert_called_once_with(MAX_CASES)


def test_firm_analytics_queries_only_scheduled_future_hearings():
    """Verifies the hearings query's actual filter values, not just its call-chain shape --
    a Completed/Cancelled hearing, or a past Scheduled one, must not count toward workload
    or conflicts. Exercises: `GET /admin/firm-analytics` (`admin.get_firm_analytics()`)."""
    case_rows = [_case_row(1, "Open", None, [5])]
    fake = _fake_supabase(case_rows=case_rows, hearing_rows=[])
    with patch("app.controllers.admin.supabase", fake):
        get_firm_analytics(profile={"role_id": auth.ADMIN, "org_id": 7})
    fake.table("hearings").select.return_value.eq.assert_called_once_with("hearing_status", "Scheduled")
