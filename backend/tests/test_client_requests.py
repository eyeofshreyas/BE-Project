# ponytail self-check for respond_client_request's ownership/status guards --
# a client must not be able to accept/decline a request addressed to someone
# else, or one that's already been responded to.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.client_requests import respond_client_request, send_client_request
from app.models.client_requests import ClientRequestCreate, ClientRequestDecision


def _fake_supabase(client_id: int, request_row: dict, lawyer_user_id: int = 5):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": client_id}]
        elif name == "client_requests":
            m.select.return_value.eq.return_value.execute.return_value.data = [request_row]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"user_id": lawyer_user_id}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_respond_rejects_request_addressed_to_someone_else():
    profile = {"role_id": auth.CLIENT, "user_id": 1, "full_name": "Test Client"}
    request_row = {"request_id": 1, "client_id": 99, "status": "pending"}
    with patch("app.controllers.client_requests.supabase", _fake_supabase(7, request_row)):
        try:
            respond_client_request(1, ClientRequestDecision(decision="accept"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_respond_rejects_already_answered_request():
    profile = {"role_id": auth.CLIENT, "user_id": 1, "full_name": "Test Client"}
    request_row = {"request_id": 1, "client_id": 7, "status": "accepted"}
    with patch("app.controllers.client_requests.supabase", _fake_supabase(7, request_row)):
        try:
            respond_client_request(1, ClientRequestDecision(decision="decline"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400


def test_respond_notifies_lawyer_on_decline():
    profile = {"role_id": auth.CLIENT, "user_id": 1, "full_name": "Test Client"}
    request_row = {
        "request_id": 1, "client_id": 7, "lawyer_id": 3, "status": "pending",
        "invite_email": None, "message": None, "created_at": "now",
        "lawyers": None, "clients": None, "courts": None, "case_types": None,
    }
    fake = _fake_supabase(7, request_row, lawyer_user_id=99)
    with patch("app.controllers.client_requests.supabase", fake):
        respond_client_request(1, ClientRequestDecision(decision="decline"), profile)
        inserted = fake.table("notifications").insert.call_args[0][0]
        assert inserted["user_id"] == 99
        assert inserted["case_id"] is None


def test_respond_marks_request_declined_and_creates_no_case():
    # the actual "reject" side-effect: request status flips to declined and,
    # unlike accept, no case/case_lawyers row is ever created.
    profile = {"role_id": auth.CLIENT, "user_id": 1, "full_name": "Test Client"}
    request_row = {
        "request_id": 1, "client_id": 7, "lawyer_id": 3, "status": "pending",
        "invite_email": None, "message": None, "created_at": "now",
        "lawyers": None, "clients": None, "courts": None, "case_types": None,
    }
    fake = _fake_supabase(7, request_row, lawyer_user_id=99)
    with patch("app.controllers.client_requests.supabase", fake):
        respond_client_request(1, ClientRequestDecision(decision="decline"), profile)

        update_call = fake.table("client_requests").update.call_args[0][0]
        assert update_call["status"] == "declined"
        assert "responded_at" in update_call

        update_filter = fake.table("client_requests").update.return_value.eq.call_args[0]
        assert update_filter == ("request_id", 1)

        assert not any(call.args and call.args[0] == "cases" for call in fake.table.call_args_list)


def _fake_supabase_for_send(request_row: dict, existing_user: dict | None = None):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": 5}]
        elif name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [existing_user] if existing_user else []
        elif name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 7}]
        elif name == "client_requests":
            m.insert.return_value.execute.return_value.data = [{"request_id": 1}]
            m.select.return_value.eq.return_value.execute.return_value.data = [request_row]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_send_client_request_emails_invitee_with_no_account():
    profile = {"user_id": 1, "full_name": "Test Lawyer"}
    request_row = {
        "request_id": 1, "invite_email": "new@client.com", "message": None, "status": "pending",
        "created_at": "now", "lawyers": None, "clients": None, "courts": None, "case_types": None,
    }
    payload = ClientRequestCreate(email="new@client.com", court_id=1, case_type_id=1)
    with patch("app.controllers.client_requests.supabase", _fake_supabase_for_send(request_row)), \
         patch("app.controllers.client_requests.send_email") as mock_send:
        send_client_request(payload, profile)
        mock_send.assert_called_once()
        assert mock_send.call_args[0][0] == "new@client.com"


def test_send_client_request_notifies_existing_client():
    profile = {"user_id": 1, "full_name": "Test Lawyer"}
    request_row = {
        "request_id": 1, "invite_email": None, "message": None, "status": "pending",
        "created_at": "now", "lawyers": None, "clients": None, "courts": None, "case_types": None,
    }
    payload = ClientRequestCreate(email="existing@client.com", court_id=1, case_type_id=1)
    fake = _fake_supabase_for_send(request_row, existing_user={"user_id": 42, "role_id": auth.CLIENT})
    with patch("app.controllers.client_requests.supabase", fake), \
         patch("app.controllers.client_requests.send_email"):
        send_client_request(payload, profile)
        inserted = fake.table("notifications").insert.call_args[0][0]
        assert inserted["user_id"] == 42


if __name__ == "__main__":
    test_respond_rejects_request_addressed_to_someone_else()
    test_respond_rejects_already_answered_request()
    test_respond_notifies_lawyer_on_decline()
    test_respond_marks_request_declined_and_creates_no_case()
    test_send_client_request_emails_invitee_with_no_account()
    test_send_client_request_notifies_existing_client()
    print("ok")
