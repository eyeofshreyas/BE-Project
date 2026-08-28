# ponytail self-check for the case-scoping fix on meetings writes -- a lawyer
# scoped to case 10 must not be able to create a meeting, or add a
# participant to a meeting, on case 20.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.meetings import create_meeting, add_participant
from app.models.meetings import MeetingCreate, ParticipantCreate


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
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            create_meeting(MeetingCreate(case_id=20, conducted_by=1, meeting_date="2026-01-01"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_participant_rejects_meeting_on_out_of_scope_case():
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
