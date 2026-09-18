# ponytail self-check for the Razorpay checkout path -- the one place the app takes
# money. Everything here is about not trusting the browser: the signature has to be
# ours, the payment has to be captured, the amount comes from Razorpay rather than
# the request body, and a retried verify must not bank the same payment twice.
"""Tests for the Razorpay order/verify path: signature checks, capture confirmation, idempotency."""
import hashlib
import hmac
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middleware import auth
from app.controllers.billing import create_razorpay_order, verify_razorpay_payment
from app.models.billing import RazorpayVerify

KEY_ID = "rzp_test_key"
KEY_SECRET = "rzp_test_secret"

ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}
INVOICE = {
    "invoice_id": 7, "case_id": 10, "invoice_number": "INV-7", "amount": 1000, "tax": 0,
    "total_amount": 1000, "issue_date": "2026-01-01", "due_date": None,
    "payment_status": "Pending", "cases": None,
}


def _signature(order_id: str, payment_id: str, secret: str = KEY_SECRET) -> str:
    """The HMAC Razorpay's Checkout.js hands back on success."""
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _billing_supabase(payments=(), existing=(), inserted_sink=None, updated_sink=None):
    """Fake supabase for the billing module: one invoice, a payments table whose
    Completed rows are `payments`, and a transaction_reference lookup returning `existing`."""
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "invoices":
            m.select.return_value.eq.return_value.execute.return_value.data = [INVOICE]

            def update(payload):
                if updated_sink is not None:
                    updated_sink.update(payload)
                return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
            m.update.side_effect = update
        elif name == "payments":
            # .eq(invoice_id).eq(payment_status) -> Completed payments
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = list(payments)
            # .eq(transaction_reference) -> the idempotency lookup
            m.select.return_value.eq.return_value.execute.return_value.data = list(existing)

            def insert(payload):
                if inserted_sink is not None:
                    inserted_sink.update(payload)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{**payload, "payment_id": 99}])))
            m.insert.side_effect = insert
        return m

    fake.table.side_effect = table
    return fake


def _auth_supabase():
    """Auth-side fake: the admin's org owns case 10, so INVOICE is in scope."""
    fake = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = [{"case_id": 10}]
    fake.table.return_value = m
    return fake


def _razorpay_response(status_code=200, payload=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload or {}
    return resp


CAPTURED = {"order_id": "order_abc", "status": "captured", "amount": 100000, "method": "upi"}


def _verify(data, billing_fake, http_payload=CAPTURED, http_status=200):
    """Run verify_razorpay_payment with Razorpay's key config and HTTP call stubbed out."""
    with patch("app.controllers.billing.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.billing.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.middleware.auth.supabase", _auth_supabase()), \
         patch("app.controllers.billing.supabase", billing_fake), \
         patch("app.controllers.billing.httpx.get", return_value=_razorpay_response(http_status, http_payload)):
        return verify_razorpay_payment(7, data, ADMIN_PROFILE)


def test_forged_signature_is_rejected():
    """Verifies a signature not computed with our key secret raises 400 and records nothing --
    otherwise anyone could mark any invoice paid by POSTing invented IDs.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    inserted = {}
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc", secret="attacker_guess"),
    )
    with pytest.raises(HTTPException) as err:
        _verify(data, _billing_supabase(inserted_sink=inserted))
    assert err.value.status_code == 400
    assert not inserted, "a forged signature must not record a payment"


def test_payment_that_razorpay_says_is_not_captured_is_rejected():
    """Verifies a validly-signed but uncaptured (authorized/failed) payment raises 400 -- a real
    signature on a payment that never settled must not mark the invoice paid.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    inserted = {}
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    with pytest.raises(HTTPException) as err:
        _verify(data, _billing_supabase(inserted_sink=inserted), http_payload={**CAPTURED, "status": "authorized"})
    assert err.value.status_code == 400
    assert not inserted


def test_payment_belonging_to_a_different_order_is_rejected():
    """Verifies a payment whose order_id doesn't match the one being verified raises 400, so a
    real payment for a cheap invoice can't be replayed against an expensive one.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    with pytest.raises(HTTPException) as err:
        _verify(data, _billing_supabase(), http_payload={**CAPTURED, "order_id": "order_someone_else"})
    assert err.value.status_code == 400


def test_amount_recorded_comes_from_razorpay_not_the_caller():
    """Verifies the banked amount is Razorpay's captured paise converted to rupees, not anything
    the caller supplied, and that the payment lands as Completed with the gateway reference.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    inserted, updated = {}, {}
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    _verify(data, _billing_supabase(inserted_sink=inserted, updated_sink=updated))
    assert inserted["amount"] == 1000.0           # 100000 paise, not a client-supplied figure
    assert inserted["payment_status"] == "Completed"
    assert inserted["transaction_reference"] == "pay_abc"
    assert inserted["payment_method"] == "UPI"    # mapped from Razorpay's "upi"


def test_a_retried_verify_does_not_bank_the_same_payment_twice():
    """Verifies a second verify for an already-recorded razorpay_payment_id returns the existing
    row instead of inserting again -- a dropped response and client retry would otherwise
    double-credit the invoice. Exercises: `POST /invoices/{id}/razorpay/verify`
    (`billing.verify_razorpay_payment()`)."""
    inserted = {}
    already = {"payment_id": 42, "invoice_id": 7, "amount": 1000.0, "transaction_reference": "pay_abc"}
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    result = _verify(data, _billing_supabase(existing=[already], inserted_sink=inserted))
    assert result == already
    assert not inserted, "the retry must not insert a second payment row"


def test_razorpay_being_unreachable_is_a_502_not_a_silent_pass():
    """Verifies a failed confirmation call to Razorpay raises 502 rather than trusting the
    client's word that the payment succeeded.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    with pytest.raises(HTTPException) as err:
        _verify(data, _billing_supabase(), http_status=500)
    assert err.value.status_code == 502


def test_verify_rejects_an_invoice_outside_the_callers_scope():
    """Verifies a caller scoped to no cases cannot verify a payment against this invoice; 403.
    Exercises: `POST /invoices/{id}/razorpay/verify` (`billing.verify_razorpay_payment()`)."""
    out_of_scope = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = []   # org owns no cases
    out_of_scope.table.return_value = m
    data = RazorpayVerify(
        razorpay_order_id="order_abc", razorpay_payment_id="pay_abc",
        razorpay_signature=_signature("order_abc", "pay_abc"),
    )
    with patch("app.controllers.billing.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.billing.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.middleware.auth.supabase", out_of_scope), \
         patch("app.controllers.billing.supabase", _billing_supabase()):
        with pytest.raises(HTTPException) as err:
            verify_razorpay_payment(7, data, ADMIN_PROFILE)
    assert err.value.status_code == 403


def test_unconfigured_razorpay_fails_loudly():
    """Verifies a server with no Razorpay keys raises 500 on checkout rather than proceeding
    with an empty secret (which would make every signature verifiable).
    Exercises: `POST /invoices/{id}/razorpay/order` (`billing.create_razorpay_order()`)."""
    with patch("app.controllers.billing.RAZORPAY_KEY_ID", None), \
         patch("app.controllers.billing.RAZORPAY_KEY_SECRET", None):
        with pytest.raises(HTTPException) as err:
            create_razorpay_order(7, ADMIN_PROFILE)
    assert err.value.status_code == 500


def test_order_for_an_already_paid_invoice_is_refused():
    """Verifies a fully-paid invoice can't start another checkout; 400 instead of a zero/negative
    order. Exercises: `POST /invoices/{id}/razorpay/order` (`billing.create_razorpay_order()`)."""
    with patch("app.controllers.billing.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.billing.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.middleware.auth.supabase", _auth_supabase()), \
         patch("app.controllers.billing.supabase", _billing_supabase(payments=[{"amount": 1000}])):
        with pytest.raises(HTTPException) as err:
            create_razorpay_order(7, ADMIN_PROFILE)
    assert err.value.status_code == 400


def test_order_is_raised_for_the_outstanding_balance_in_paise():
    """Verifies a part-paid invoice starts a checkout for only what is still owed, sent to
    Razorpay in paise, and that the public key_id (not the secret) is returned to the browser.
    Exercises: `POST /invoices/{id}/razorpay/order` (`billing.create_razorpay_order()`)."""
    posted = {}

    def fake_post(url, **kwargs):
        posted.update(kwargs.get("json", {}))
        return _razorpay_response(200, {"id": "order_new", "amount": posted["amount"], "currency": "INR"})

    with patch("app.controllers.billing.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.billing.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.middleware.auth.supabase", _auth_supabase()), \
         patch("app.controllers.billing.supabase", _billing_supabase(payments=[{"amount": 400}])), \
         patch("app.controllers.billing.httpx.post", side_effect=fake_post):
        result = create_razorpay_order(7, ADMIN_PROFILE)

    assert posted["amount"] == 60000          # 600 rupees outstanding, in paise
    assert result["key_id"] == KEY_ID
    assert KEY_SECRET not in str(result)
