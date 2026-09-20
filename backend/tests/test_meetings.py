# ponytail self-check for the case-scoping fix on meetings writes -- a lawyer
# scoped to case 10 must not be able to create a meeting, or add a
# participant to a meeting, on case 20 -- and for meetings being staff-only,
# same as case notes: a client must never read them, even on their own case.
"""Tests for the meetings domain: case-scoping on meeting creation and participant addition,
and that meetings are internal to the firm."""
import inspect
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.meetings import create_meeting, add_participant, list_meetings, get_meeting, list_participants
from app.models.meetings import MeetingCreate, ParticipantCreate


def _role_gate(fn):
    """The dependency FastAPI resolves for `fn`'s profile parameter. Calling the controller
    directly skips it, so a role gate has to be exercised through this to be tested at all."""
    return inspect.signature(fn).parameters["profile"].default.dependency


def _assert_staff_only(fn, name):
    """Assert `fn` 403s a client and admits a lawyer and an admin."""
    try:
        _role_gate(fn)({"role_id": auth.CLIENT, "user_id": 1})
    except HTTPException as e:
        assert e.status_code == 403
    except Exception as e:
        assert False, f"{name} is not role-gated -- its dependency raised {e!r} on a client profile"
    else:
        assert False, f"expected {name} to reject clients"
    for role in (auth.LAWYER, auth.ADMIN):
        assert _role_gate(fn)({"role_id": role, "user_id": 1})["role_id"] == role


def test_list_meetings_is_staff_only():
    """Verifies a client cannot list meetings even on their own case; raises 403 -- meetings are
    internal to the firm, same as case notes. Exercises: `GET /meetings` (`meetings.list_meetings()`)."""
    _assert_staff_only(list_meetings, "list_meetings")


def test_get_meeting_is_staff_only():
    """Verifies a client cannot read a single meeting; raises 403. Exercises: `GET /meetings/{id}` (`meetings.get_meeting()`)."""
    _assert_staff_only(get_meeting, "get_meeting")


def test_list_participants_is_staff_only():
    """Verifies a client cannot list a meeting's participants; raises 403. Exercises: `GET /meetings/{id}/participants` (`meetings.list_participants()`)."""
    _assert_staff_only(list_participants, "list_participants")


def _fake_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        return m

    fake.table.side_effect = table
    return fake


LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}


def test_create_meeting_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot create a meeting for case 20; raises 403. Exercises: `POST /meetings` (`meetings.create_meeting()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            create_meeting(MeetingCreate(case_id=20, conducted_by=1, meeting_date="2026-01-01"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_participant_rejects_meeting_on_out_of_scope_case():
    """Verifies adding a participant to a meeting whose case is out of scope raises 403, via a mocked meeting lookup. Exercises: `POST /meetings/{id}/participants` (`meetings.add_participant()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    meeting_row = {"meeting_id": 99, "case_id": 20}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.meetings.supabase", _fake_supabase({"meetings": [meeting_row]})):
        try:
            add_participant(99, ParticipantCreate(user_id=1), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


if __name__ == "__main__":
    test_create_meeting_rejects_out_of_scope_case()
    test_add_participant_rejects_meeting_on_out_of_scope_case()
    print("ok")
