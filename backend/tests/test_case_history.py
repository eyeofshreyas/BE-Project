# ponytail self-check for the case-scoping fix on change_case_status -- a
# lawyer scoped to case 10 must not be able to change the status of case 20.
"""Tests for the case-history domain: status changes, case notes, and who may read them."""
import inspect
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.case_ai_summary import get_case_ai_summary
from app.controllers.case_history import change_case_status, add_case_note, update_case_note, delete_case_note, list_case_notes
from app.models.case_history import StatusChange, NoteCreate, NoteUpdate


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


def test_change_case_status_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot change the status of case 20; raises 403. Exercises: `PATCH /cases/{id}/status` (`case_history.change_case_status()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    lawyer_scoped_to_case_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
    with patch("app.middleware.auth.supabase", _fake_supabase(lawyer_scoped_to_case_10)):
        try:
            change_case_status(20, StatusChange(new_status="Closed"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_case_note_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot add a note to case 20; raises 403. Exercises: `POST /cases/{id}/notes` (`case_history.add_case_note()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    lawyer_scoped_to_case_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
    with patch("app.middleware.auth.supabase", _fake_supabase(lawyer_scoped_to_case_10)):
        try:
            add_case_note(20, NoteCreate(note="hi"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_update_case_note_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot edit a note on case 20; raises 403. Exercises: `PATCH /cases/{id}/notes/{note_id}` (`case_history.update_case_note()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    lawyer_scoped_to_case_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
    with patch("app.middleware.auth.supabase", _fake_supabase(lawyer_scoped_to_case_10)):
        try:
            update_case_note(20, 1, NoteUpdate(pinned=True), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_delete_case_note_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot delete a note on case 20; raises 403. Exercises: `DELETE /cases/{id}/notes/{note_id}` (`case_history.delete_case_note()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    lawyer_scoped_to_case_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
    with patch("app.middleware.auth.supabase", _fake_supabase(lawyer_scoped_to_case_10)):
        try:
            delete_case_note(20, 1, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_list_case_notes_is_staff_only():
    """Verifies a client cannot read a case's notes even on their own case; raises 403. Exercises: `GET /cases/{id}/notes` (`case_history.list_case_notes()`)."""
    _assert_staff_only(list_case_notes, "list_case_notes")


def test_get_case_ai_summary_is_staff_only():
    """Verifies a client cannot read the AI summary, which is written from the firm's private notes; raises 403. Exercises: `GET /cases/{id}/ai-summary` (`case_ai_summary.get_case_ai_summary()`)."""
    _assert_staff_only(get_case_ai_summary, "get_case_ai_summary")


if __name__ == "__main__":
    test_change_case_status_rejects_out_of_scope_case()
    test_add_case_note_rejects_out_of_scope_case()
    test_update_case_note_rejects_out_of_scope_case()
    test_delete_case_note_rejects_out_of_scope_case()
    test_list_case_notes_is_staff_only()
    test_get_case_ai_summary_is_staff_only()
    print("ok")
