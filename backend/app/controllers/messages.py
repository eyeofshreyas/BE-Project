"""Controllers for client-lawyer conversations: get-or-create a thread, list the caller's
threads, read one thread's messages, and post a new message. Every read/write is scoped to
conversations the caller is a participant in -- see `_ensure_participant()`."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import Depends, File, Form, HTTPException, UploadFile
from app.db.supabase_client import supabase
from app.middleware.auth import CLIENT, LAWYER, get_current_profile
from app.models.messages import ConversationCreate

CONVERSATIONS_SELECT = (
    "id,client_id,lawyer_id,created_at,client_last_read_at,lawyer_last_read_at,"
    "clients(users(full_name)),lawyers(users(full_name))"
)
MESSAGES_SELECT = (
    "id,conversation_id,sender_user_id,body,created_at,"
    "attachment_path,attachment_name,attachment_type,attachment_size,users(full_name)"
)

logger = logging.getLogger(__name__)

# Attachments share the documents bucket rather than getting one of their own, so no extra
# bucket has to be provisioned -- see migrate_message_reads_and_attachments.sql.
ATTACHMENTS_BUCKET = "documents"
ATTACHMENT_URL_TTL = 3600
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
}


def _is_allowed_attachment(content_type: str | None) -> bool:
    """Images, video, and the document types the app already deals in. Checked server-side
    because the client's `accept` attribute is a hint, not a boundary."""
    if not content_type:
        return False
    return content_type.startswith(("image/", "video/")) or content_type in ALLOWED_ATTACHMENT_TYPES


def _own_client_id(user_id: int) -> int | None:
    rows = supabase.table("clients").select("client_id").eq("user_id", user_id).execute().data
    return rows[0]["client_id"] if rows else None


def _own_lawyer_id(user_id: int) -> int | None:
    rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", user_id).execute().data
    return rows[0]["lawyer_id"] if rows else None


def _relationship_exists(client_id: int, lawyer_id: int) -> bool:
    """True if this lawyer is actively assigned to one of this client's cases -- the trust
    boundary for get_or_create_conversation() before it creates a persistent conversation row."""
    case_rows = supabase.table("cases").select("case_id").eq("client_id", client_id).execute().data
    case_ids = [r["case_id"] for r in case_rows]
    if not case_ids:
        return False
    rows = supabase.table("case_lawyers").select("lawyer_id").in_("case_id", case_ids).eq("lawyer_id", lawyer_id).eq("is_active", True).execute().data
    return len(rows) > 0


def _read_column(viewer_role_id: int) -> str:
    """The conversations column holding this viewer's read marker."""
    return "client_last_read_at" if viewer_role_id == CLIENT else "lawyer_last_read_at"


def _to_summary(row: dict, viewer_role_id: int, last_message: dict | None = None, unread_count: int = 0) -> dict:
    """Shape a raw `conversations` row (joined with clients/lawyers/users) into the
    ConversationSummary dict, from the given viewer's point of view."""
    if viewer_role_id == CLIENT:
        other = row.get("lawyers")
        other_role = "lawyer"
    else:
        other = row.get("clients")
        other_role = "client"
    preview = None
    if last_message:
        preview = last_message["body"] or last_message.get("attachment_name") or "Attachment"
    return {
        "id": row["id"],
        "other_party_name": other["users"]["full_name"] if other else None,
        "other_party_role": other_role,
        "last_message": preview,
        "last_message_at": last_message["created_at"] if last_message else None,
        "unread_count": unread_count,
    }


def _attachment_url(path: str | None) -> str | None:
    """Sign a stored attachment for inline display. Returns None if signing fails so one
    broken file can't take down the whole thread."""
    if not path:
        return None
    try:
        return supabase.storage.from_(ATTACHMENTS_BUCKET).create_signed_url(path, ATTACHMENT_URL_TTL)["signedURL"]
    except Exception:
        return None


def _to_message_summary(row: dict) -> dict:
    """Shape a raw `messages` row (joined with users) into the MessageSummary dict."""
    users = row.get("users")
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "sender_user_id": row["sender_user_id"],
        "sender_name": users["full_name"] if users else None,
        "body": row["body"] or "",
        "created_at": row["created_at"],
        "attachment_url": _attachment_url(row.get("attachment_path")),
        "attachment_name": row.get("attachment_name"),
        "attachment_type": row.get("attachment_type"),
        "attachment_size": row.get("attachment_size"),
    }


def _get_conversation_row(conversation_id: int) -> dict:
    rows = supabase.table("conversations").select(CONVERSATIONS_SELECT).eq("id", conversation_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return rows[0]


def _ensure_participant(row: dict, profile: dict) -> None:
    """Raise 403 unless the caller is the client or lawyer on this conversation."""
    if profile["role_id"] == CLIENT:
        my_id = _own_client_id(profile["user_id"])
        ok = my_id is not None and row["client_id"] == my_id
    elif profile["role_id"] == LAWYER:
        my_id = _own_lawyer_id(profile["user_id"])
        ok = my_id is not None and row["lawyer_id"] == my_id
    else:
        ok = False
    if not ok:
        raise HTTPException(status_code=403, detail="You don't have access to this conversation")


def get_or_create_conversation(data: ConversationCreate, profile: dict = Depends(get_current_profile)):
    """Get-or-create the conversation for the caller and `other_party_id` (a lawyer_id from a
    client caller, a client_id from a lawyer caller). 403s unless they already share a case.
    Calls: `_relationship_exists()`, `_to_summary()`."""
    if profile["role_id"] == CLIENT:
        client_id = _own_client_id(profile["user_id"])
        if client_id is None:
            raise HTTPException(status_code=400, detail="No client profile for this account")
        lawyer_id = data.other_party_id
    elif profile["role_id"] == LAWYER:
        lawyer_id = _own_lawyer_id(profile["user_id"])
        if lawyer_id is None:
            raise HTTPException(status_code=400, detail="No lawyer profile for this account")
        client_id = data.other_party_id
    else:
        raise HTTPException(status_code=403, detail="You don't have permission to perform this action")

    if not _relationship_exists(client_id, lawyer_id):
        raise HTTPException(status_code=403, detail="You don't have a case with this person yet")

    existing = supabase.table("conversations").select(CONVERSATIONS_SELECT) \
        .eq("client_id", client_id).eq("lawyer_id", lawyer_id).execute().data
    if existing:
        row = existing[0]
    else:
        inserted = supabase.table("conversations").insert({"client_id": client_id, "lawyer_id": lawyer_id}).execute().data[0]
        row = supabase.table("conversations").select(CONVERSATIONS_SELECT).eq("id", inserted["id"]).execute().data[0]

    return _to_summary(row, profile["role_id"])


def list_conversations(profile: dict = Depends(get_current_profile)):
    """List the caller's conversations, most recently active first. Calls: `_to_summary()`."""
    if profile["role_id"] == CLIENT:
        my_id = _own_client_id(profile["user_id"])
        if my_id is None:
            return []
        rows = supabase.table("conversations").select(CONVERSATIONS_SELECT).eq("client_id", my_id).execute().data
    elif profile["role_id"] == LAWYER:
        my_id = _own_lawyer_id(profile["user_id"])
        if my_id is None:
            return []
        rows = supabase.table("conversations").select(CONVERSATIONS_SELECT).eq("lawyer_id", my_id).execute().data
    else:
        return []

    read_column = _read_column(profile["role_id"])
    result = []
    for row in rows:
        # ponytail: two queries per conversation -- last-message preview and unread count --
        # fine at this app's per-user conversation counts; move to a DB view/RPC if this ever
        # needs to scale past a handful of threads per user.
        last = supabase.table("messages").select("body,created_at,attachment_name") \
            .eq("conversation_id", row["id"]).order("created_at", desc=True).limit(1).execute().data

        # Unread = messages the other party sent after this viewer last opened the thread.
        # A null marker means they have never opened it, so everything inbound counts.
        unread_query = supabase.table("messages").select("id", count="exact") \
            .eq("conversation_id", row["id"]).neq("sender_user_id", profile["user_id"])
        if row.get(read_column):
            unread_query = unread_query.gt("created_at", row[read_column])
        unread = unread_query.execute().count or 0

        result.append(_to_summary(row, profile["role_id"], last[0] if last else None, unread))

    result.sort(key=lambda c: c["last_message_at"] or "", reverse=True)
    return result


def get_conversation(conversation_id: int, profile: dict = Depends(get_current_profile)):
    """Read one conversation's full message history, and mark it read for the caller -- opening
    a thread is what clears its unread badge. 403s if the caller isn't a participant.
    Calls: `_get_conversation_row()`, `_ensure_participant()`, `_to_summary()`, `_to_message_summary()`."""
    row = _get_conversation_row(conversation_id)
    _ensure_participant(row, profile)

    supabase.table("conversations").update(
        {_read_column(profile["role_id"]): datetime.now(timezone.utc).isoformat()}
    ).eq("id", conversation_id).execute()

    messages = supabase.table("messages").select(MESSAGES_SELECT) \
        .eq("conversation_id", conversation_id).order("created_at").execute().data
    summary = _to_summary(row, profile["role_id"])
    return {
        "id": summary["id"],
        "other_party_name": summary["other_party_name"],
        "other_party_role": summary["other_party_role"],
        "messages": [_to_message_summary(m) for m in messages],
    }


def send_message(
    conversation_id: int,
    body: str = Form(""),
    file: UploadFile | None = File(None),
    profile: dict = Depends(get_current_profile),
):
    """Append a message from the caller into this conversation, optionally carrying one file
    (image, video, or document). Sent as multipart so text and attachment share one endpoint.
    403s if the caller isn't a participant. Calls: `_get_conversation_row()`,
    `_ensure_participant()`, `_is_allowed_attachment()`, `_to_message_summary()`."""
    row = _get_conversation_row(conversation_id)
    _ensure_participant(row, profile)

    body = body.strip()
    if not body and file is None:
        raise HTTPException(status_code=400, detail="Message can't be empty")

    record = {
        "conversation_id": conversation_id,
        "sender_user_id": profile["user_id"],
        "body": body,
    }

    if file is not None:
        if not _is_allowed_attachment(file.content_type):
            raise HTTPException(status_code=400, detail="Only images, video, and documents can be attached")
        content = file.file.read()
        if not content:
            raise HTTPException(status_code=400, detail="That file is empty")
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=400, detail="Attachments are limited to 25 MB")

        ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
        storage_path = f"conversation-{conversation_id}/{uuid.uuid4().hex}.{ext}"
        try:
            supabase.storage.from_(ATTACHMENTS_BUCKET).upload(
                storage_path, content, {"content-type": file.content_type or "application/octet-stream"}
            )
        except Exception as err:
            # Storage rejecting the file is a bad request, not a server crash -- surface why
            # so the composer can show it instead of a bare "failed to send".
            logger.warning("Attachment upload failed for conversation %s: %s", conversation_id, err)
            raise HTTPException(status_code=400, detail=f"Couldn't upload that file: {err}")
        record |= {
            "attachment_path": storage_path,
            "attachment_name": file.filename or storage_path,
            "attachment_type": file.content_type,
            "attachment_size": len(content),
        }

    supabase.table("messages").insert(record).execute()

    inserted = supabase.table("messages").select(MESSAGES_SELECT) \
        .eq("conversation_id", conversation_id).order("created_at", desc=True).limit(1).execute().data[0]
    return _to_message_summary(inserted)
