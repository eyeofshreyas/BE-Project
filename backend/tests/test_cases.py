# ponytail self-check for unassign_lawyer's access guard -- a lawyer must
# only be able to unassign themselves from a case they're actively on.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.cases import unassign_lawyer


def _fake_supabase(assigned_case_ids: set[int], case_row: dict):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": 5}]
        elif name == "case_lawyers":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"case_id": cid} for cid in assigned_case_ids
            ]
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = [case_row]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_unassign_lawyer_denied_for_unassigned_lawyer():
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer"}
    fake = _fake_supabase(assigned_case_ids=set(), case_row={})
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            unassign_lawyer(42, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_unassign_lawyer_allowed_for_assigned_lawyer():
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer"}
    case_row = {
        "case_id": 42, "case_number": "C001", "case_title": "x", "filing_date": None, "created_at": None, "status": "Open",
        "priority": "Medium", "next_hearing_date": None, "clients": None, "courts": None, "case_types": None,
        "case_lawyers": [],
    }
    fake = _fake_supabase(assigned_case_ids={42}, case_row=case_row)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = unassign_lawyer(42, profile)
        assert result["case_id"] == 42
        assert fake.table("case_lawyers").update.call_args[0][0] == {"is_active": False}


if __name__ == "__main__":
    test_unassign_lawyer_denied_for_unassigned_lawyer()
    test_unassign_lawyer_allowed_for_assigned_lawyer()
    print("ok")
