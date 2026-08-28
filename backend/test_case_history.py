# ponytail self-check for the case-scoping fix on change_case_status -- a
# lawyer scoped to case 10 must not be able to change the status of case 20.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

import auth
from case_history import change_case_status, StatusChange


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
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    lawyer_scoped_to_case_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
    with patch("auth.supabase", _fake_supabase(lawyer_scoped_to_case_10)):
        try:
            change_case_status(20, StatusChange(new_status="Closed"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


if __name__ == "__main__":
    test_change_case_status_rejects_out_of_scope_case()
    print("ok")
