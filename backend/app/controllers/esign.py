"""Controllers for requesting document e-signatures via Leegality's Document Execution API
(https://docs.leegality.com/v3) and receiving the signed result back over its webhook.

Leegality is an ASP (Application Service Provider), not the actual signing authority -- the
cryptographic Aadhaar/DSC signing is performed by its licensed ESP partner behind the scenes.
See docs/FUTURE_SCOPE.md for why this is bought rather than built in-house."""

import base64
import hashlib
import hmac

import httpx
from fastapi import Depends, HTTPException
from app.controllers.case_history import add_timeline_event
from app.controllers.documents import DOCUMENTS_BUCKET, DOCUMENTS_SELECT, _to_document_summary
from app.core.config import LEEGALITY_API_BASE, LEEGALITY_AUTH_TOKEN, LEEGALITY_PRIVATE_SALT, LEEGALITY_WORKFLOW_PROFILE_ID
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, require_roles
from app.models.documents import SignatureRequestCreate


def _leegality_auth() -> str:
    """Return the Leegality auth token, or 500 if e-signature isn't configured -- see .env.example."""
    if not LEEGALITY_AUTH_TOKEN or not LEEGALITY_WORKFLOW_PROFILE_ID:
        raise HTTPException(status_code=500, detail="e-signature is not configured on this server.")
    return LEEGALITY_AUTH_TOKEN


def request_signature(document_id: int, data: SignatureRequestCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Send a stored PDF to Leegality for signing by the given signers -- only PDFs can be sent,
    same restriction the Document Execution API itself enforces. Calls: `ensure_case_access()`,
    `_leegality_auth()`."""
    token = _leegality_auth()

    rows = supabase.table("documents").select("case_id,file_path,mime_type,file_name").eq("document_id", document_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    doc = rows[0]
    ensure_case_access(doc["case_id"], profile)
    if doc["mime_type"] != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF documents can be sent for e-signature.")

    content = supabase.storage.from_(DOCUMENTS_BUCKET).download(doc["file_path"])

    resp = httpx.post(
        f"{LEEGALITY_API_BASE}/v3.0/sign/request",
        headers={"X-Auth-Token": token},
        json={
            "profileId": LEEGALITY_WORKFLOW_PROFILE_ID,
            "file": {"name": doc["file_name"][:255], "file": base64.b64encode(content).decode()},
            "invitees": [{"name": s.name, "email": s.email} for s in data.signers],
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="e-signature request failed.")
    result = resp.json()
    if result.get("status") != 1:
        message = (result.get("messages") or [{}])[0].get("message", "e-signature request failed.")
        raise HTTPException(status_code=502, detail=message)

    supabase.table("documents").update({
        "esign_document_id": result["data"]["documentId"],
        "esign_status": "SENT",
    }).eq("document_id", document_id).execute()

    add_timeline_event(
        doc["case_id"], "esign_requested",
        f"Sent \"{doc['file_name']}\" for e-signature",
        f"{len(data.signers)} signer(s): " + ", ".join(s.name for s in data.signers),
        profile["user_id"],
    )

    row = supabase.table("documents").select(DOCUMENTS_SELECT).eq("document_id", document_id).execute().data[0]
    return _to_document_summary(row)


def _verify_leegality_mac(document_id: str, mac: str) -> bool:
    """Recompute Leegality's webhook signature -- HMAC-SHA1(documentId, privateSalt) -- and
    compare it to the `mac` field on the payload, confirming the request genuinely came from
    Leegality rather than an arbitrary POST to a guessable URL."""
    expected = hmac.new(LEEGALITY_PRIVATE_SALT.encode(), document_id.encode(), hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected, mac)


def handle_esign_webhook(payload: dict):
    """Leegality's callback on a signing event. Not behind the usual auth dependencies --
    Leegality, not a logged-in LexFlow user, calls this -- so the `mac` field is what proves
    the request is genuine instead. On a completed document, downloads the signed PDF back
    into LexFlow's own storage immediately, since Leegality's CDN link expires in 15 seconds.

    Both a rejection and an expiry leave `documentStatus` as "Sent" -- identical to "nobody's
    acted yet" -- so the real terminal state has to come from the `request` object instead,
    or either would read as merely pending forever with no way to resend it: a rejection has
    `request.action == "Rejected"`, an expiry has `request.expired == true` with `action`
    left `null`. This same handler receives both Leegality's "Webhook URL" (success) and
    "Error Webhook URL" (rejection/expiry/failure) events -- both need pointing at this
    endpoint in the Leegality dashboard Workflow, see SETUP.md.

    ponytail: no timeline event here -- there's no LexFlow user to attribute it to, and
    `esign_status` is already queryable on the document itself.
    Calls: `_verify_leegality_mac()`."""
    if not LEEGALITY_PRIVATE_SALT:
        raise HTTPException(status_code=500, detail="e-signature is not configured on this server.")

    document_id = payload.get("documentId", "")
    if not document_id or not _verify_leegality_mac(document_id, payload.get("mac", "")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    rows = supabase.table("documents").select("document_id,case_id,file_name").eq("esign_document_id", document_id).execute().data
    if not rows:
        return {"message": "ignored"}
    doc = rows[0]

    invitee = payload.get("request") or {}
    if str(invitee.get("action", "")).upper() == "REJECTED":
        status = "REJECTED"
    elif invitee.get("expired") is True:
        status = "EXPIRED"
    else:
        status = str(payload.get("documentStatus", "SENT")).upper()
    update: dict = {"esign_status": status}

    if status == "COMPLETED":
        details = httpx.get(
            f"{LEEGALITY_API_BASE}/v3.3/document/details",
            headers={"X-Auth-Token": LEEGALITY_AUTH_TOKEN},
            params={"documentId": document_id, "file": "true"},
            timeout=30,
        )
        file_url = details.json().get("data", {}).get("file")
        if file_url:
            signed_bytes = httpx.get(file_url, timeout=30).content
            signed_path = f"case-{doc['case_id']}/signed-{document_id}.pdf"
            supabase.storage.from_(DOCUMENTS_BUCKET).upload(signed_path, signed_bytes, {"content-type": "application/pdf"})
            update["esign_signed_file_path"] = signed_path

    supabase.table("documents").update(update).eq("document_id", doc["document_id"]).execute()
    return {"message": "ok"}
