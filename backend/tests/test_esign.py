# ponytail self-check for the e-signature branch logic (non-PDF rejected, out-of-scope case,
# a successful send writing esign_status, and the webhook's mac verification + signed-file
# download on completion) -- mirrors test_billing.py/test_ecourts.py's pattern for an
# external-API-backed controller.
"""Tests for the e-signature domain: sending a document to Leegality and its webhook."""
import hashlib
import hmac
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.esign import handle_esign_webhook, request_signature
from app.models.documents import SignatureRequestCreate, SignerInfo

LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
SIGNERS = SignatureRequestCreate(signers=[SignerInfo(name="Asha Rao", email="asha@example.com")])


def _fake_supabase(rows_by_table, on_write=None):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data

        def update(payload):
            if on_write:
                on_write(name, "update", payload)
            return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
        m.update.side_effect = update

        def insert(payload):
            if on_write:
                on_write(name, "insert", payload)
            return MagicMock(execute=MagicMock(return_value=MagicMock(data=[payload])))
        m.insert.side_effect = insert
        return m

    fake.table.side_effect = table
    fake.storage.from_.return_value.download.return_value = b"%PDF-1.4 fake pdf bytes"
    fake.storage.from_.return_value.upload.return_value = None
    return fake


def test_request_signature_rejects_out_of_scope_case():
    """Verifies a lawyer scoped to case 10 cannot send a document on case 20 for signature.
    Exercises: `POST /documents/{id}/request-signature` (`esign.request_signature()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    doc_row = {"case_id": 20, "file_path": "case-20/a.pdf", "mime_type": "application/pdf", "file_name": "deed.pdf"}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.esign.supabase", _fake_supabase({"documents": [doc_row]})), \
         patch("app.controllers.esign.LEEGALITY_AUTH_TOKEN", "test"), \
         patch("app.controllers.esign.LEEGALITY_WORKFLOW_PROFILE_ID", "wf1"):
        try:
            request_signature(1, SIGNERS, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_request_signature_rejects_non_pdf():
    """Verifies a non-PDF document is refused before any Leegality call. Exercises:
    `POST /documents/{id}/request-signature` (`esign.request_signature()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    doc_row = {"case_id": 10, "file_path": "case-10/a.docx", "mime_type": "application/msword", "file_name": "deed.docx"}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.esign.supabase", _fake_supabase({"documents": [doc_row]})), \
         patch("app.controllers.esign.LEEGALITY_AUTH_TOKEN", "test"), \
         patch("app.controllers.esign.LEEGALITY_WORKFLOW_PROFILE_ID", "wf1"):
        try:
            request_signature(1, SIGNERS, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400


def test_request_signature_writes_status_and_timeline_event():
    """Verifies a successful send stores esign_document_id/esign_status on the document and
    logs a timeline event. Exercises: `POST /documents/{id}/request-signature`
    (`esign.request_signature()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    doc_first = {"case_id": 10, "file_path": "case-10/deed.pdf", "mime_type": "application/pdf", "file_name": "Deed.pdf"}
    doc_summary_row = {
        "document_id": 1, "file_name": "Deed.pdf", "mime_type": "application/pdf", "upload_date": "2026-01-01",
        "file_size": 10, "case_id": 10, "file_path": "case-10/deed.pdf", "esign_status": "SENT",
        "document_types": None, "cases": None, "users": None,
    }
    writes = []

    fake = MagicMock()
    docs_mock = MagicMock()
    docs_mock.select.return_value.eq.return_value.execute.side_effect = [
        MagicMock(data=[doc_first]),
        MagicMock(data=[doc_summary_row]),
    ]

    def docs_update(payload):
        writes.append(("documents", payload))
        return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
    docs_mock.update.side_effect = docs_update

    def table(name):
        if name == "documents":
            return docs_mock
        m = MagicMock()
        if name == "case_timeline":
            def insert(payload):
                writes.append(("case_timeline", payload))
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[payload])))
            m.insert.side_effect = insert
        return m

    fake.table.side_effect = table
    fake.storage.from_.return_value.download.return_value = b"%PDF-1.4 fake pdf bytes"

    fake_response = MagicMock(status_code=200)
    fake_response.json.return_value = {"status": 1, "data": {"documentId": "LEG123", "invitees": []}}

    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.esign.supabase", fake), \
         patch("app.controllers.case_history.supabase", fake), \
         patch("app.controllers.esign.LEEGALITY_AUTH_TOKEN", "test"), \
         patch("app.controllers.esign.LEEGALITY_WORKFLOW_PROFILE_ID", "wf1"), \
         patch("app.controllers.esign.httpx.post", return_value=fake_response) as mock_post:
        result = request_signature(1, SIGNERS, profile)

        assert result["id"] == 1
        assert mock_post.call_args.kwargs["headers"]["X-Auth-Token"] == "test"
        assert mock_post.call_args.kwargs["json"]["profileId"] == "wf1"

        doc_writes = [p for (t, p) in writes if t == "documents"]
        assert doc_writes[0]["esign_document_id"] == "LEG123"
        assert doc_writes[0]["esign_status"] == "SENT"

        timeline_writes = [p for (t, p) in writes if t == "case_timeline"]
        assert timeline_writes[0]["event_type"] == "esign_requested"


def test_webhook_rejects_bad_mac():
    """Verifies a webhook whose mac doesn't match the private salt is refused with 401, before
    any document lookup. Exercises: `POST /webhooks/leegality` (`esign.handle_esign_webhook()`)."""
    with patch("app.controllers.esign.LEEGALITY_PRIVATE_SALT", "shh"):
        try:
            handle_esign_webhook({"documentId": "LEG123", "documentStatus": "Completed", "mac": "wrong"})
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 401


def test_webhook_downloads_signed_file_on_completion():
    """Verifies a Completed webhook with a valid mac fetches the signed PDF and stores it,
    rather than just flipping esign_status. Exercises: `POST /webhooks/leegality`
    (`esign.handle_esign_webhook()`)."""
    salt = "shh"
    document_id = "LEG123"
    mac = hmac.new(salt.encode(), document_id.encode(), hashlib.sha1).hexdigest()

    writes = []
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "documents":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"document_id": 1, "case_id": 10, "file_name": "Deed.pdf"}
            ]

            def update(payload):
                writes.append(payload)
                return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
            m.update.side_effect = update
        return m

    fake.table.side_effect = table
    fake.storage.from_.return_value.upload.return_value = None

    details_response = MagicMock(status_code=200)
    details_response.json.return_value = {"data": {"file": "https://cdn.leegality.com/short-lived-url"}}
    file_response = MagicMock(content=b"%PDF-1.4 signed bytes")

    with patch("app.controllers.esign.supabase", fake), \
         patch("app.controllers.esign.LEEGALITY_PRIVATE_SALT", salt), \
         patch("app.controllers.esign.LEEGALITY_AUTH_TOKEN", "test"), \
         patch("app.controllers.esign.httpx.get", side_effect=[details_response, file_response]):
        result = handle_esign_webhook({"documentId": document_id, "documentStatus": "Completed", "mac": mac})

        assert result == {"message": "ok"}
        assert writes[0]["esign_status"] == "COMPLETED"
        assert writes[0]["esign_signed_file_path"] == "case-10/signed-LEG123.pdf"


def test_webhook_marks_rejected_distinctly_from_pending():
    """Verifies a rejection sets esign_status to REJECTED, not the raw documentStatus value --
    Leegality's own payload leaves documentStatus as "Sent" on a rejection, identical to a
    document nobody's acted on yet, so the signal has to come from request.action instead.
    Payload shape is Leegality's real documented example for this event. Exercises:
    `POST /webhooks/leegality` (`esign.handle_esign_webhook()`)."""
    salt = "shh"
    document_id = "LEG123"
    mac = hmac.new(salt.encode(), document_id.encode(), hashlib.sha1).hexdigest()

    writes = []
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "documents":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"document_id": 1, "case_id": 10, "file_name": "Deed.pdf"}
            ]

            def update(payload):
                writes.append(payload)
                return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
            m.update.side_effect = update
        return m

    fake.table.side_effect = table

    # Leegality's own documented example payload for "Signer Rejected".
    payload = {
        "webhookType": "Error",
        "documentId": document_id,
        "documentStatus": "Sent",
        "irn": None,
        "mac": mac,
        "messages": [],
        "verification": None,
        "request": {
            "inviteeType": "Signer",
            "name": "Abhishek Sharma",
            "email": "abhishek@example.com",
            "phone": None,
            "invitationUrl": "https://sandbox.leegality.com/sign/uuid-here",
            "active": True,
            "action": "Rejected",
            "error": "Invitation rejected by the signer.",
            "expired": False,
            "expiryDate": "03-04-2026 23:59:59",
            "rejectionMessage": None,
            "signType": None,
        },
    }

    with patch("app.controllers.esign.supabase", fake), \
         patch("app.controllers.esign.LEEGALITY_PRIVATE_SALT", salt):
        result = handle_esign_webhook(payload)

        assert result == {"message": "ok"}
        assert writes[0]["esign_status"] == "REJECTED"


if __name__ == "__main__":
    test_request_signature_rejects_out_of_scope_case()
    test_request_signature_rejects_non_pdf()
    test_request_signature_writes_status_and_timeline_event()
    test_webhook_rejects_bad_mac()
    test_webhook_downloads_signed_file_on_completion()
    test_webhook_marks_rejected_distinctly_from_pending()
    print("ok")
