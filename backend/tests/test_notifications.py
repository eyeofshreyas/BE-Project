# ponytail self-check for notifications. The one boundary that matters here is
# ownership: a notification carries a case number and a message body, so marking
# (and reading back) someone else's must be refused for non-admins.
"""Tests for notifications: own-list filtering, ownership on mark-read, and mark-all-read."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middleware import auth
from app.controllers.notifications import list_notifications, mark_all_read, mark_read

CLIENT_PROFILE = {"role_id": auth.CLIENT, "user_id": 42}
ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}

ROW = {
    "notification_id": 3, "case_id": 10, "title": "Payment reminder",
    "message": "Invoice INV-7 for 1000 is due.", "notification_type": "invoice_reminder",
    "is_read": False, "created_at": "2026-01-01T00:00:00Z", "cases": {"case_number": "LX-1"},
}


def _fake(owner_row, list_rows=(), filters_sink=None, updated_sink=None):
    """Fake supabase for notifications: an owner lookup for mark_read, a list query that
    records the filters it was given, and an update that records its payload."""
    fake = MagicMock()

    def table(name):
        m = MagicMock()

        def select(*args, **kwargs):
            sel = MagicMock()

            def eq(col, val):
                if filters_sink is not None:
                    filters_sink[col] = val
                inner = MagicMock()
                inner.eq.side_effect = eq
                inner.execute.return_value.data = [owner_row] if owner_row else []
                inner.order.return_value.limit.return_value.execute.return_value.data = list(list_rows)
                return inner
            sel.eq.side_effect = eq
            return sel
        m.select.side_effect = select

        def update(payload):
            if updated_sink is not None:
                updated_sink.update(payload)
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.execute.return_value = MagicMock()
            return chain
        m.update.side_effect = update
        return m

    fake.table.side_effect = table
    return fake


def test_list_is_filtered_to_the_callers_own_notifications():
    """Verifies the list query is always constrained to the caller's user_id, so one user's
    notifications can never appear in another's feed.
    Exercises: `GET /notifications` (`notifications.list_notifications()`)."""
    filters = {}
    with patch("app.controllers.notifications.supabase", _fake(None, [ROW], filters_sink=filters)):
        result = list_notifications(False, CLIENT_PROFILE)
    assert filters["user_id"] == 42
    assert result[0]["id"] == 3
    assert result[0]["case_number"] == "LX-1"


def test_unread_only_adds_the_is_read_filter():
    """Verifies `unread_only=true` narrows the query to is_read False rather than filtering in
    Python. Exercises: `GET /notifications?unread_only=true`
    (`notifications.list_notifications()`)."""
    filters = {}
    with patch("app.controllers.notifications.supabase", _fake(None, [ROW], filters_sink=filters)):
        list_notifications(True, CLIENT_PROFILE)
    assert filters["is_read"] is False


def test_marking_someone_elses_notification_read_is_refused():
    """Verifies a client cannot mark (and thereby read back) a notification belonging to another
    user; raises 403 and writes nothing.
    Exercises: `PATCH /notifications/{id}/read` (`notifications.mark_read()`)."""
    updated = {}
    with patch("app.controllers.notifications.supabase",
               _fake({"user_id": 99}, updated_sink=updated)):
        with pytest.raises(HTTPException) as err:
            mark_read(3, CLIENT_PROFILE)
    assert err.value.status_code == 403
    assert not updated


def test_an_admin_may_mark_another_users_notification_read():
    """Verifies the documented admin exemption holds -- admins administer other users' rows, so
    the ownership check deliberately does not apply to them.
    Exercises: `PATCH /notifications/{id}/read` (`notifications.mark_read()`)."""
    updated = {}
    with patch("app.controllers.notifications.supabase",
               _fake({"user_id": 99, **ROW}, updated_sink=updated)):
        mark_read(3, ADMIN_PROFILE)
    assert updated == {"is_read": True}


def test_marking_your_own_notification_read_works():
    """Verifies the owner path updates is_read and returns the reshaped row.
    Exercises: `PATCH /notifications/{id}/read` (`notifications.mark_read()`)."""
    updated = {}
    with patch("app.controllers.notifications.supabase",
               _fake({"user_id": 42, **ROW}, updated_sink=updated)):
        result = mark_read(3, CLIENT_PROFILE)
    assert updated == {"is_read": True}
    assert result["id"] == 3


def test_a_missing_notification_is_a_404():
    """Verifies an unknown notification ID raises 404 rather than 403, so a caller isn't told
    a row exists when it doesn't. Exercises: `PATCH /notifications/{id}/read`
    (`notifications.mark_read()`)."""
    with patch("app.controllers.notifications.supabase", _fake(None)):
        with pytest.raises(HTTPException) as err:
            mark_read(999, CLIENT_PROFILE)
    assert err.value.status_code == 404


def test_mark_all_read_is_scoped_to_the_caller():
    """Verifies mark-all-read filters on the caller's own user_id, so it can't clear the whole
    table. Exercises: `PATCH /notifications/read-all` (`notifications.mark_all_read()`)."""
    updated = {}
    fake = MagicMock()
    eq_calls = []
    m = MagicMock()

    def update(payload):
        updated.update(payload)
        chain = MagicMock()

        def eq(col, val):
            eq_calls.append((col, val))
            return chain
        chain.eq.side_effect = eq
        return chain
    m.update.side_effect = update
    fake.table.return_value = m

    with patch("app.controllers.notifications.supabase", fake):
        assert mark_all_read(CLIENT_PROFILE) == {"message": "All notifications marked as read."}
    assert updated == {"is_read": True}
    assert ("user_id", 42) in eq_calls
    assert ("is_read", False) in eq_calls
