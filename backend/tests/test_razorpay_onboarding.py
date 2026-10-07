"""Tests for Razorpay Route onboarding: linked-account creation and its status gate."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.controllers.admin import get_razorpay_account_status, submit_razorpay_onboarding
from app.models.admin import RazorpayOnboardingCreate

KEY_ID = "rzp_test_key"
KEY_SECRET = "rzp_test_secret"
ADMIN_PROFILE = {"role_id": 1, "user_id": 1, "org_id": 7}

ONBOARDING = RazorpayOnboardingCreate(
    business_name="Kulkarni & Associates", business_type="partnership", pan="ABCDE1234F",
    contact_email="admin@kulkarni.law", contact_phone="+919876543210",
    bank_account_number="000123456789", bank_ifsc="HDFC0000123",
)


def _settings_supabase(status="not_started", updated_sink=None):
    fake = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = [
        {"razorpay_account_status": status, "razorpay_account_error": None}
    ]

    def update(payload):
        if updated_sink is not None:
            updated_sink.update(payload)
        return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
    m.update.side_effect = update
    fake.table.return_value = m
    return fake


def _razorpay_response(status_code=200, payload=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload or {}
    return resp


def test_onboarding_creates_linked_account_and_sets_pending():
    """A fresh org's onboarding submission creates the linked account on Razorpay, attaches
    settlement details, and persists the account id with status 'pending'.
    Exercises: `POST /admin/razorpay-account` (`admin.submit_razorpay_onboarding()`)."""
    updated = {}

    def fake_post(url, **kwargs):
        if url.endswith("/accounts"):
            return _razorpay_response(200, {"id": "acc_123"})
        return _razorpay_response(200, {})  # the settlement/products attach call

    with patch("app.controllers.admin.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.admin.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.controllers.admin.supabase", _settings_supabase(updated_sink=updated)), \
         patch("app.controllers.admin.httpx.post", side_effect=fake_post):
        result = submit_razorpay_onboarding(ONBOARDING, ADMIN_PROFILE)

    assert result["status"] == "pending"
    assert updated["razorpay_account_id"] == "acc_123"
    assert updated["razorpay_account_status"] == "pending"


def test_onboarding_rejects_resubmission_while_pending():
    """An org whose linked account is already pending/activated can't resubmit over it.
    Exercises: `POST /admin/razorpay-account` (`admin.submit_razorpay_onboarding()`)."""
    with patch("app.controllers.admin.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.admin.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.controllers.admin.supabase", _settings_supabase(status="pending")):
        with pytest.raises(HTTPException) as err:
            submit_razorpay_onboarding(ONBOARDING, ADMIN_PROFILE)
    assert err.value.status_code == 409


def test_onboarding_allows_resubmission_after_rejection():
    """An org whose account was rejected can resubmit a corrected form.
    Exercises: `POST /admin/razorpay-account` (`admin.submit_razorpay_onboarding()`)."""
    def fake_post(url, **kwargs):
        if url.endswith("/accounts"):
            return _razorpay_response(200, {"id": "acc_456"})
        return _razorpay_response(200, {})

    with patch("app.controllers.admin.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.admin.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.controllers.admin.supabase", _settings_supabase(status="rejected")), \
         patch("app.controllers.admin.httpx.post", side_effect=fake_post):
        result = submit_razorpay_onboarding(ONBOARDING, ADMIN_PROFILE)
    assert result["status"] == "pending"


def test_onboarding_fails_loudly_when_account_creation_is_rejected():
    """A Razorpay-side account-creation failure surfaces as 502, not a silently-pending row.
    Exercises: `POST /admin/razorpay-account` (`admin.submit_razorpay_onboarding()`)."""
    with patch("app.controllers.admin.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.admin.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.controllers.admin.supabase", _settings_supabase()), \
         patch("app.controllers.admin.httpx.post", side_effect=lambda url, **kw: _razorpay_response(400)):
        with pytest.raises(HTTPException) as err:
            submit_razorpay_onboarding(ONBOARDING, ADMIN_PROFILE)
    assert err.value.status_code == 502


def test_onboarding_fails_loudly_when_settlement_attach_is_rejected():
    """The account is created but Razorpay rejects the second call that attaches the bank
    account/settlement details -- this must surface as 502, not leave a 'pending' row with
    no settlement account behind it.
    Exercises: `POST /admin/razorpay-account` (`admin.submit_razorpay_onboarding()`)."""
    def fake_post(url, **kwargs):
        if url.endswith("/accounts"):
            return _razorpay_response(200, {"id": "acc_789"})
        return _razorpay_response(400, {"error": {"description": "Invalid IFSC"}})

    with patch("app.controllers.admin.RAZORPAY_KEY_ID", KEY_ID), \
         patch("app.controllers.admin.RAZORPAY_KEY_SECRET", KEY_SECRET), \
         patch("app.controllers.admin.supabase", _settings_supabase()), \
         patch("app.controllers.admin.httpx.post", side_effect=fake_post):
        with pytest.raises(HTTPException) as err:
            submit_razorpay_onboarding(ONBOARDING, ADMIN_PROFILE)
    assert err.value.status_code == 502


def test_get_status_returns_the_orgs_current_row():
    """Status endpoint reflects whatever's on the org's platform_settings row.
    Exercises: `GET /admin/razorpay-account` (`admin.get_razorpay_account_status()`)."""
    with patch("app.controllers.admin.supabase", _settings_supabase(status="activated")):
        result = get_razorpay_account_status(ADMIN_PROFILE)
    assert result["status"] == "activated"
