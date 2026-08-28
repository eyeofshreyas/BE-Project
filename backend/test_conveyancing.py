# ponytail self-check for the case-scoping fix on conveyancing writes -- a
# lawyer scoped to case 10 must not be able to update due-diligence or
# progress on a matter that belongs to case 20.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

import auth
from conveyancing import update_due_diligence, complete_progress_stage, DueDiligenceUpdate


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
MATTER_ON_CASE_20 = {"conveyancing_matters": [{"matter_id": 5, "case_id": 20}]}


def test_update_due_diligence_rejects_matter_on_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("conveyancing.supabase", _fake_supabase(MATTER_ON_CASE_20)):
        try:
            update_due_diligence(5, DueDiligenceUpdate(title_clear=True), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_complete_progress_stage_rejects_matter_on_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("conveyancing.supabase", _fake_supabase(MATTER_ON_CASE_20)):
        try:
            complete_progress_stage(5, 1, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


if __name__ == "__main__":
    test_update_due_diligence_rejects_matter_on_out_of_scope_case()
    test_complete_progress_stage_rejects_matter_on_out_of_scope_case()
    print("ok")
