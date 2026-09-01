# ponytail self-check for unassign_lawyer's access guard -- a lawyer must
# only be able to unassign themselves from a case they're actively on.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.cases import create_case, unassign_lawyer
from app.models.cases import CaseCreate


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


# ponytail self-check for create_case's consent gate -- a lawyer may only
# open a case for a client who accepted their client_requests invite.
def _fake_supabase_for_create(accepted_request_rows: list[dict], case_row: dict):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": 5}]
        elif name == "client_requests":
            m.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = accepted_request_rows
        elif name == "case_types":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"case_type_name": "Civil"}]
        elif name == "cases":
            m.select.return_value.like.return_value.execute.return_value.data = []
            m.insert.return_value.execute.return_value.data = [case_row]
            m.select.return_value.eq.return_value.execute.return_value.data = [case_row]
        elif name == "case_lawyers":
            m.insert.return_value.execute.return_value = MagicMock()
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def _case_create_payload():
    return CaseCreate(case_type_id=1, case_title="Test matter", client_id=99, court_id=1)


def test_create_case_denied_without_accepted_request():
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer"}
    fake = _fake_supabase_for_create(accepted_request_rows=[], case_row={})
    with patch("app.controllers.cases.supabase", fake):
        try:
            create_case(_case_create_payload(), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_create_case_allowed_with_accepted_request():
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer"}
    case_row = {
        "case_id": 42, "case_number": "CIV2026001", "case_title": "Test matter", "filing_date": None,
        "created_at": None, "status": "Open", "priority": "Medium", "next_hearing_date": None,
        "clients": None, "courts": None, "case_types": None, "case_lawyers": [],
    }
    fake = _fake_supabase_for_create(accepted_request_rows=[{"request_id": 1}], case_row=case_row)
    with patch("app.controllers.cases.supabase", fake):
        result = create_case(_case_create_payload(), profile)
        assert result["case_id"] == 42


if __name__ == "__main__":
    test_unassign_lawyer_denied_for_unassigned_lawyer()
    test_unassign_lawyer_allowed_for_assigned_lawyer()
    test_create_case_denied_without_accepted_request()
    test_create_case_allowed_with_accepted_request()
    print("ok")
