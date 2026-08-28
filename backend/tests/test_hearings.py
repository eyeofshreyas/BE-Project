# ponytail self-check for the case-scoping fix on hearings writes -- a lawyer
# scoped to case 10 must not be able to create/update a hearing on case 20.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.hearings import create_hearing, update_hearing
from app.models.hearings import HearingCreate, HearingUpdate


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


def test_create_hearing_rejects_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            create_hearing(HearingCreate(case_id=20, judge_id=1, hearing_date="2026-01-01"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_update_hearing_rejects_hearing_on_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    hearing_row = {"hearing_id": 99, "case_id": 20}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.hearings.supabase", _fake_supabase({"hearings": [hearing_row]})):
        try:
            update_hearing(99, HearingUpdate(hearing_status="Completed"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


if __name__ == "__main__":
    test_create_hearing_rejects_out_of_scope_case()
    test_update_hearing_rejects_hearing_on_out_of_scope_case()
    print("ok")
