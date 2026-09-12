# ponytail self-check for case-party scoping (add-party respects case access) and the
# conflict search's core promise: it must surface a match on a case the caller isn't even
# scoped to, since that's the entire point of the feature -- a normal scoped query would
# hide exactly the conflicts that matter.
"""Tests for the conflict-check domain: case parties and the firm-wide name search."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.conflict_check import add_case_party, list_case_parties, search_conflicts
from app.models.conflict_check import PartyCreate

LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}


def _fake_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.order.return_value.execute.return_value.data = data
        # search_conflicts calls .select(...).execute() with no filter -- unscoped by design.
        m.select.return_value.execute.return_value.data = data

        def insert(payload):
            return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{**payload, "party_id": 1, "created_at": "2026-01-01T00:00:00Z"}])))
        m.insert.side_effect = insert
        return m

    fake.table.side_effect = table
    return fake


def test_add_case_party_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot add a party to case 20. Exercises:
    `POST /cases/{id}/parties` (`conflict_check.add_case_party()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            add_case_party(20, PartyCreate(name="Acme Corp", role="Opposing Party"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_case_party_rejects_blank_name():
    """Verifies whitespace-only name is refused with 400. Exercises: `POST /cases/{id}/parties`
    (`conflict_check.add_case_party()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conflict_check.supabase", _fake_supabase({})):
        try:
            add_case_party(10, PartyCreate(name="   ", role="Opposing Party"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400


def test_list_case_parties_rejects_out_of_scope_case():
    """Verifies listing parties on an out-of-scope case raises 403. Exercises:
    `GET /cases/{id}/parties` (`conflict_check.list_case_parties()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            list_case_parties(20, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_search_conflicts_finds_client_match_on_an_unscoped_case():
    """Verifies a client-name match surfaces even on a case the caller isn't scoped to --
    the whole point of the feature. Exercises: `GET /conflict-check`
    (`conflict_check.search_conflicts()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    case_row = {
        "case_id": 20, "case_number": "CIV2026099",
        "clients": {"users": {"full_name": "Priya Sharma"}},
        "case_lawyers": [{"is_active": True, "lawyers": {"users": {"full_name": "Rohan Mehta"}}}],
    }
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conflict_check.supabase", _fake_supabase({"cases": [case_row], "case_parties": []})):
        results = search_conflicts("priya", profile)

    assert len(results) == 1
    assert results[0]["source"] == "client"
    assert results[0]["case_id"] == 20
    assert results[0]["lawyer"] == "Rohan Mehta"


def test_search_conflicts_finds_party_match():
    """Verifies an opposing-party name match surfaces with its role and case context.
    Exercises: `GET /conflict-check` (`conflict_check.search_conflicts()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    party_row = {
        "party_id": 1, "case_id": 20, "name": "Metro Builders", "role": "Opposing Party",
        "cases": {"case_number": "CIV2026099", "case_lawyers": [{"is_active": True, "lawyers": {"users": {"full_name": "Rohan Mehta"}}}]},
    }
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conflict_check.supabase", _fake_supabase({"cases": [], "case_parties": [party_row]})):
        results = search_conflicts("metro", profile)

    assert len(results) == 1
    assert results[0]["source"] == "party"
    assert results[0]["role"] == "Opposing Party"
    assert results[0]["case_number"] == "CIV2026099"


def test_search_conflicts_blank_query_returns_nothing():
    """Verifies an empty/whitespace query short-circuits to no results instead of returning
    the whole firm. Exercises: `GET /conflict-check` (`conflict_check.search_conflicts()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        assert search_conflicts("   ", profile) == []


if __name__ == "__main__":
    test_add_case_party_rejects_out_of_scope_case()
    test_add_case_party_rejects_blank_name()
    test_list_case_parties_rejects_out_of_scope_case()
    test_search_conflicts_finds_client_match_on_an_unscoped_case()
    test_search_conflicts_finds_party_match()
    test_search_conflicts_blank_query_returns_nothing()
    print("ok")
