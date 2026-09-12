"""Binds e-signature URLs to controllers.esign functions. No logic.

/webhooks/leegality is deliberately outside every other router's auth dependencies --
Leegality calls it directly, not a logged-in LexFlow user -- see esign.handle_esign_webhook()
for how it verifies the request is genuine instead."""

from fastapi import APIRouter
from app.controllers.esign import request_signature, handle_esign_webhook
from app.models.documents import DocumentSummary

router = APIRouter(tags=["esign"])

router.post("/documents/{document_id}/request-signature", response_model=DocumentSummary)(request_signature)
router.post("/webhooks/leegality")(handle_esign_webhook)
