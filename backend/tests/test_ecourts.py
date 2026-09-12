# ponytail self-check for the eCourts sync branch logic (missing CNR, out-of-scope
# case, and a successful sync writing status + timeline event) -- mirrors
# test_billing.py's pattern for an external-API-backed controller.
"""Tests for the eCourts domain: CNR assignment and status sync."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.ecourts import set_case_cnr, sync_case_from_ecourts
from app.models.cases import CnrUpdate

LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}


def _fake_supabase(rows_by_table, on_update=None):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data

        def update(payload):
            if on_update:
                on_update(name, payload)
            return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
        m.update.side_effect = update

        def insert(payload):
            if on_update:
                on_update(name, payload)
            return MagicMock(execute=MagicMock(return_value=MagicMock(data=[payload])))
        m.insert.side_effect = insert
        return m

    fake.table.side_effect = table
    return fake


def test_set_case_cnr_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot attach a CNR to case 20. Exercises: `PATCH /cases/{id}/cnr` (`ecourts.set_case_cnr()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            set_case_cnr(20, CnrUpdate(cnr_number="DLST020314162024"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_set_case_cnr_rejects_wrong_length():
    """Verifies a CNR that isn't 16 characters raises 400. Exercises: `PATCH /cases/{id}/cnr` (`ecourts.set_case_cnr()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            set_case_cnr(10, CnrUpdate(cnr_number="TOOSHORT"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400


def test_sync_case_rejects_case_without_cnr():
    """Verifies syncing a case with no cnr_number set raises 400 before any HTTP call. Exercises: `POST /cases/{id}/sync-ecourts` (`ecourts.sync_case_from_ecourts()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.ecourts.supabase", _fake_supabase({"cases": [{"cnr_number": None}]})), \
         patch("app.controllers.ecourts.ECOURTS_API_KEY", "eci_live_test"):
        try:
            sync_case_from_ecourts(10, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400


def test_sync_case_writes_status_and_timeline_event():
    """Verifies a successful sync stores ecourts_status/ecourts_raw on the case and logs a
    timeline event. Exercises: `POST /cases/{id}/sync-ecourts` (`ecourts.sync_case_from_ecourts()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    cnr = "DLST020314162024"
    case_row = {
        "case_id": 10, "case_number": "LX-1", "case_title": "t", "filing_date": None, "created_at": None,
        "status": "Open", "priority": "Medium", "next_hearing_date": None, "description": None,
        "cnr_number": cnr, "ecourts_status": None, "ecourts_last_synced_at": None,
        "client_id": None, "clients": None, "courts": None, "case_types": None, "case_lawyers": [],
    }
    writes = []

    fake = MagicMock()

    cases_mock = MagicMock()
    # first select (cnr lookup) then second (post-update reload) -- consumed in call order.
    cases_mock.select.return_value.eq.return_value.execute.side_effect = [
        MagicMock(data=[{"cnr_number": cnr}]),
        MagicMock(data=[case_row]),
    ]

    def cases_update(payload):
        writes.append(("cases", payload))
        return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
    cases_mock.update.side_effect = cases_update

    def table(name):
        if name == "cases":
            return cases_mock
        m = MagicMock()
        if name == "case_timeline":
            def insert(payload):
                writes.append(("case_timeline", payload))
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[payload])))
            m.insert.side_effect = insert
        return m

    fake.table.side_effect = table

    fake_response = MagicMock(status_code=200)
    fake_response.json.return_value = {"data": {"caseStatus": "PENDING", "courtCode": "DLHC01"}}

    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.ecourts.supabase", fake), \
         patch("app.controllers.case_history.supabase", fake), \
         patch("app.controllers.ecourts.ECOURTS_API_KEY", "eci_live_test"), \
         patch("app.controllers.ecourts.httpx.get", return_value=fake_response) as mock_get:
        result = sync_case_from_ecourts(10, profile)

        assert result["id"] == "LX-1"
        assert mock_get.call_args.args[0].endswith(f"/api/partner/case/{cnr}")

        case_writes = [p for (t, p) in writes if t == "cases"]
        assert case_writes[0]["ecourts_status"] == "PENDING"
        assert case_writes[0]["ecourts_raw"] == {"caseStatus": "PENDING", "courtCode": "DLHC01"}

        timeline_writes = [p for (t, p) in writes if t == "case_timeline"]
        assert timeline_writes[0]["event_type"] == "ecourts_synced"
        assert "PENDING" in timeline_writes[0]["event_title"]


if __name__ == "__main__":
    test_set_case_cnr_rejects_out_of_scope_case()
    test_set_case_cnr_rejects_wrong_length()
    test_sync_case_rejects_case_without_cnr()
    test_sync_case_writes_status_and_timeline_event()
    print("ok")
