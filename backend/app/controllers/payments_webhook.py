"""Handles Razorpay's Route linked-account status webhook -- Razorpay reviews a linked
account's KYC asynchronously and calls this endpoint with the outcome, rather than this app
polling for it. See app/routes/payments_webhook.py for why this sits outside every other
router's auth dependency."""

import hashlib
import hmac
import json

from fastapi import HTTPException, Request

from app.core.config import RAZORPAY_WEBHOOK_SECRET
from app.db.supabase_client import supabase

STATUS_BY_EVENT = {
    "account.activated": "activated",
    "account.needs_clarification": "needs_clarification",
    "account.rejected": "rejected",
}


async def handle_razorpay_webhook(request: Request):
    """Verify Razorpay's webhook signature over the raw body (not the re-serialized JSON --
    Razorpay signs the literal bytes it sent), then update the org whose razorpay_account_id
    matches the event's linked account. Unrecognised events are acknowledged (200) and
    ignored -- Razorpay sends many event types this app doesn't act on, and NOT acking one
    just makes Razorpay retry it forever."""
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay webhooks are not configured on this server.")

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    event = json.loads(body)
    new_status = STATUS_BY_EVENT.get(event.get("event"))
    if new_status is None:
        return {"ok": True}

    account = event["payload"]["account"]["entity"]
    error = None if new_status == "activated" else (account.get("notes") or {}).get("error")
    supabase.table("platform_settings").update({
        "razorpay_account_status": new_status,
        "razorpay_account_error": error,
    }).eq("razorpay_account_id", account["id"]).execute()
    return {"ok": True}
