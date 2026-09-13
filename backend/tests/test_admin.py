# ponytail self-check for the admin analytics aggregation -- the buckets are the only
# real logic in the admin domain (everything else is a count passed straight through),
# and an off-by-one month or week would silently draw the wrong chart.
"""Tests for the admin console's analytics aggregation."""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from app.middleware import auth
from app.controllers.admin import get_analytics, get_stats, invite_lawyer, get_settings, update_settings
from app.models.admin import LawyerInviteCreate, PlatformSettings


def _fake_supabase(case_rows, summary_rows, summarized_count, live_docs, deleted_count):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "cases":
            m.select.return_value.execute.return_value.data = case_rows
        elif name == "ai_summaries":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.execute.return_value.count = summarized_count
                else:
                    sel.gte.return_value.execute.return_value.data = summary_rows
                return sel
            m.select.side_effect = select
        elif name == "documents":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.eq.return_value.execute.return_value.count = deleted_count
                else:
                    sel.eq.return_value.execute.return_value.data = live_docs
                return sel
            m.select.side_effect = select
        return m

    fake.table.side_effect = table
    return fake


def test_analytics_buckets_cases_by_month_and_summaries_by_week():
    """Verifies cases land in the right month bucket (falling back to created_at when
    filing_date is null) and AI summaries in the right week. Exercises: `GET /admin/analytics`."""
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    fake = _fake_supabase(
        case_rows=[
            {"status": "Open", "filing_date": today.isoformat(), "created_at": None},
            {"status": "Open", "filing_date": None, "created_at": f"{today.isoformat()}T10:00:00+00:00"},
            {"status": "Closed", "filing_date": (today - timedelta(days=400)).isoformat(), "created_at": None},
        ],
        summary_rows=[{"generated_at": f"{this_monday.isoformat()}T09:00:00+00:00"}],
        summarized_count=1,
        live_docs=[{"file_size": 1000}, {"file_size": 2500}],
        deleted_count=4,
    )

    with patch("app.controllers.admin.supabase", fake):
        result = get_analytics(profile={"role_id": auth.SUPER_ADMIN, "org_id": None})

    assert result["total_cases"] == 3
    assert dict((s["label"], s["count"]) for s in result["case_status"]) == {"Open": 2, "Closed": 1}
    # Both of this month's cases land in the last (current) growth bucket; the 400-day-old
    # one falls outside the 6-month window entirely.
    assert len(result["case_growth"]) == 6
    assert result["case_growth"][-1]["count"] == 2
    assert sum(m["count"] for m in result["case_growth"]) == 2
    assert len(result["ai_usage"]) == 8
    assert result["ai_usage"][-1]["count"] == 1
    assert result["documents"] == {"total": 2, "summarized": 1, "awaiting_summary": 1, "deleted": 4}
    assert result["storage"]["used_bytes"] == 3500


def test_awaiting_summary_never_goes_negative():
    """Verifies more summaries than live documents (summaries outlive a soft-deleted doc)
    clamps to zero instead of showing a negative card. Exercises: `GET /admin/analytics`."""
    fake = _fake_supabase(case_rows=[], summary_rows=[], summarized_count=9, live_docs=[], deleted_count=9)
    with patch("app.controllers.admin.supabase", fake):
        result = get_analytics(profile={"role_id": auth.SUPER_ADMIN, "org_id": None})
    assert result["documents"]["awaiting_summary"] == 0


def _fake_supabase_for_invite(existing_user_rows: list[dict]):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = existing_user_rows
        elif name == "lawyer_invites":
            m.insert.return_value.execute.return_value = MagicMock()
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_invite_lawyer_creates_pending_invite_for_own_org():
    """Verifies an org admin's invite is scoped to their own org_id and emails the invitee. Exercises: `POST /admin/lawyer-invites` (`admin.invite_lawyer()`)."""
    fake = _fake_supabase_for_invite(existing_user_rows=[])
    with patch("app.controllers.admin.supabase", fake), patch("app.controllers.admin.send_email") as mock_send:
        result = invite_lawyer(LawyerInviteCreate(email="new@firm.example"), profile={"role_id": auth.ADMIN, "org_id": 7, "full_name": "Test Admin"})
    assert result["message"] == "Invite sent."
    fake.table("lawyer_invites").insert.assert_called_once_with({"org_id": 7, "email": "new@firm.example", "status": "pending"})
    mock_send.assert_called_once()
    assert mock_send.call_args[0][0] == "new@firm.example"


def test_invite_lawyer_rejects_an_email_with_an_existing_account():
    """Verifies inviting an email that already has a `users` row is refused with 409 instead of
    creating a dead invite. Exercises: `POST /admin/lawyer-invites` (`admin.invite_lawyer()`)."""
    fake = _fake_supabase_for_invite(existing_user_rows=[{"user_id": 5}])
    with patch("app.controllers.admin.supabase", fake), patch("app.controllers.admin.send_email") as mock_send:
        try:
            invite_lawyer(LawyerInviteCreate(email="already@registered.com"), profile={"role_id": auth.ADMIN, "org_id": 7, "full_name": "Test Admin"})
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
    mock_send.assert_not_called()


def test_get_settings_scoped_to_org_admins_own_org():
    """Verifies an org admin reads only their own org's platform_settings row. Exercises: `GET /admin/settings` (`admin.get_settings()`)."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"maintenance_mode": True, "new_signup_alerts": False, "weekly_reports": True, "auto_backup": True}
    ]
    with patch("app.controllers.admin.supabase", fake):
        result = get_settings(profile={"role_id": auth.ADMIN, "org_id": 7})
    assert result["maintenance_mode"] is True
    fake.table.return_value.select.return_value.eq.assert_called_once_with("org_id", 7)


def test_get_settings_rejects_super_admin():
    """Verifies the super-admin (no org) is told settings are per-organization instead of crashing. Exercises: `GET /admin/settings` (`admin.get_settings()`)."""
    try:
        get_settings(profile={"role_id": auth.SUPER_ADMIN, "org_id": None})
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400


def _fake_supabase_for_stats(case_client_rows):
    """Enough of `get_stats()`'s query surface to run it end to end, with every count/data
    result zeroed out except the `cases` table's client_id rows this test cares about."""
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "documents":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.eq.return_value.in_.return_value.execute.return_value.count = 0
                else:
                    sel.in_.return_value.execute.return_value.data = []
                return sel
            m.select.side_effect = select
        elif name == "invoices":
            m.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "users":
            def select(*args, **kwargs):
                sel = MagicMock()
                sel.eq.return_value.execute.return_value.count = 0
                sel.eq.return_value.eq.return_value.eq.return_value.execute.return_value.count = 0
                return sel
            m.select.side_effect = select
        elif name == "cases":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.neq.return_value.in_.return_value.execute.return_value.count = 0
                else:
                    sel.in_.return_value.execute.return_value.data = case_client_rows
                return sel
            m.select.side_effect = select
        elif name == "ai_summaries":
            m.select.return_value.in_.return_value.execute.return_value.count = 0
        elif name == "hearings":
            m.select.return_value.eq.return_value.gte.return_value.in_.return_value.execute.return_value.count = 0
        elif name == "payments":
            m.select.return_value.eq.return_value.gte.return_value.in_.return_value.execute.return_value.data = []
        return m

    fake.table.side_effect = table
    return fake


def test_registered_clients_derived_from_org_case_ids_not_users_org_id():
    """Verifies an org admin's registered_clients count comes from the distinct clients on the
    org's own cases (case_ids), the same way list_clients() derives it -- not a users.org_id
    filter, since clients are global (users.org_id is always NULL for them) per the tenancy
    design, which made this count silently always zero for every org admin.
    Exercises: `GET /admin/stats` (`admin.get_stats()`)."""
    case_client_rows = [{"client_id": 101}, {"client_id": 102}, {"client_id": 101}, {"client_id": None}]
    fake = _fake_supabase_for_stats(case_client_rows)
    with patch("app.controllers.admin.supabase", fake), \
         patch("app.controllers.admin.get_scoped_case_ids", return_value={1, 2}):
        result = get_stats(profile={"role_id": auth.ADMIN, "org_id": 7, "user_id": 1})
    assert result["registered_clients"] == 2
