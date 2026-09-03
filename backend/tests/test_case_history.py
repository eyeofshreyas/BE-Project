# ponytail self-check for the case-scoping fix on change_case_status -- a
# lawyer scoped to case 10 must not be able to change the status of case 20.
"""Tests for the case-history domain: status changes and case notes."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.case_history import change_case_status, add_case_note, update_case_note, delete_case_note
from app.models.case_history import StatusChange, NoteCreate, NoteUpdate


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


if __name__ == "__main__":
    test_change_case_status_rejects_out_of_scope_case()
    test_add_case_note_rejects_out_of_scope_case()
    test_update_case_note_rejects_out_of_scope_case()
    test_delete_case_note_rejects_out_of_scope_case()
    print("ok")
