"""Binds the Razorpay webhook URL to controllers.payments_webhook. No logic.

/webhooks/razorpay is deliberately outside every other router's auth dependencies --
Razorpay calls it directly, not a logged-in LexFlow user -- see
payments_webhook.handle_razorpay_webhook() for how it verifies the request is genuine
instead (same pattern as /webhooks/leegality in app/routes/esign.py)."""

from fastapi import APIRouter
from app.controllers.payments_webhook import handle_razorpay_webhook

router = APIRouter(tags=["payments-webhook"])

router.post("/webhooks/razorpay")(handle_razorpay_webhook)
