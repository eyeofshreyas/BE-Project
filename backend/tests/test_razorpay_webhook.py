"""Tests for the Razorpay Route linked-account status webhook."""
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

SECRET = "whsec_test"


def _sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _settings_supabase(updated_sink=None):
    fake = MagicMock()
    m = MagicMock()

    def update(payload):
        if updated_sink is not None:
            updated_sink.update(payload)
        return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
    m.update.side_effect = update
    fake.table.return_value = m
    return fake


def test_webhook_rejects_bad_signature():
    """A webhook body whose signature doesn't match the configured secret is refused with 401.
    Exercises: `POST /webhooks/razorpay` (`payments_webhook.handle_razorpay_webhook()`)."""
    body = json.dumps({"event": "account.activated", "payload": {"account": {"entity": {"id": "acc_1"}}}}).encode()
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", SECRET):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": "wrong"})
    assert resp.status_code == 401


def test_webhook_activates_the_matching_org():
    """A validly-signed account.activated event updates the org whose razorpay_account_id
    matches, clearing any prior error. Exercises: `POST /webhooks/razorpay`
    (`payments_webhook.handle_razorpay_webhook()`)."""
    updated = {}
    body = json.dumps({"event": "account.activated", "payload": {"account": {"entity": {"id": "acc_1"}}}}).encode()
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", SECRET), \
         patch("app.controllers.payments_webhook.supabase", _settings_supabase(updated_sink=updated)):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": _sign(body)})
    assert resp.status_code == 200
    assert updated == {"razorpay_account_status": "activated", "razorpay_account_error": None}


def test_webhook_records_the_clarification_reason():
    """An account.needs_clarification event stores Razorpay's reason for display in the admin
    console. Exercises: `POST /webhooks/razorpay` (`payments_webhook.handle_razorpay_webhook()`)."""
    updated = {}
    event = {"event": "account.needs_clarification", "payload": {"account": {"entity": {"id": "acc_1", "notes": {"error": "PAN mismatch"}}}}}
    body = json.dumps(event).encode()
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", SECRET), \
         patch("app.controllers.payments_webhook.supabase", _settings_supabase(updated_sink=updated)):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": _sign(body)})
    assert resp.status_code == 200
    assert updated["razorpay_account_status"] == "needs_clarification"
    assert updated["razorpay_account_error"] == "PAN mismatch"


def test_webhook_acks_an_unrelated_event_without_touching_the_db():
    """An event type this app doesn't act on returns 200 and never calls supabase, rather than
    Razorpay retrying a webhook it already successfully delivered.
    Exercises: `POST /webhooks/razorpay` (`payments_webhook.handle_razorpay_webhook()`)."""
    body = json.dumps({"event": "payment.captured", "payload": {}}).encode()
    fake = MagicMock()
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", SECRET), \
         patch("app.controllers.payments_webhook.supabase", fake):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": _sign(body)})
    assert resp.status_code == 200
    fake.table.assert_not_called()


def test_webhook_for_an_unknown_account_id_still_acks():
    """A status event for an account_id that matches no org (stale retry, already-removed org)
    must not 500 -- the update's .eq() simply matches nothing.
    Exercises: `POST /webhooks/razorpay` (`payments_webhook.handle_razorpay_webhook()`)."""
    body = json.dumps({"event": "account.rejected", "payload": {"account": {"entity": {"id": "acc_missing"}}}}).encode()
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", SECRET), \
         patch("app.controllers.payments_webhook.supabase", _settings_supabase()):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": _sign(body)})
    assert resp.status_code == 200


def test_unconfigured_webhook_gives_clean_error():
    """No RAZORPAY_WEBHOOK_SECRET set returns a clean 500, not a raw AttributeError from
    hmac.new(None, ...) -- same convention as test_esign.py's unconfigured-webhook test.
    Exercises: `POST /webhooks/razorpay` (`payments_webhook.handle_razorpay_webhook()`)."""
    with patch("app.controllers.payments_webhook.RAZORPAY_WEBHOOK_SECRET", None):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/webhooks/razorpay", content=b"{}", headers={"X-Razorpay-Signature": "x"})
    assert resp.status_code == 500
