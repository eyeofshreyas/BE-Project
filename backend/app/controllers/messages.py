"""Controllers for client-lawyer conversations: get-or-create a thread, list the caller's
threads, read one thread's messages, and post a new message. Every read/write is scoped to
conversations the caller is a participant in -- see `_ensure_participant()`."""

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import CLIENT, LAWYER, get_current_profile
from app.models.messages import ConversationCreate, MessageCreate

CONVERSATIONS_SELECT = "id,client_id,lawyer_id,created_at,clients(users(full_name)),lawyers(users(full_name))"
MESSAGES_SELECT = "id,conversation_id,sender_user_id,body,created_at,users(full_name)"


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


def _to_summary(row: dict, viewer_role_id: int, last_message: dict | None = None) -> dict:
    """Shape a raw `conversations` row (joined with clients/lawyers/users) into the
    ConversationSummary dict, from the given viewer's point of view."""
    if viewer_role_id == CLIENT:
        other = row.get("lawyers")
        other_role = "lawyer"
    else:
        other = row.get("clients")
        other_role = "client"
    return {
        "id": row["id"],
        "other_party_name": other["users"]["full_name"] if other else None,
        "other_party_role": other_role,
        "last_message": last_message["body"] if last_message else None,
        "last_message_at": last_message["created_at"] if last_message else None,
    }


def _to_message_summary(row: dict) -> dict:
    """Shape a raw `messages` row (joined with users) into the MessageSummary dict."""
    users = row.get("users")
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "sender_user_id": row["sender_user_id"],
        "sender_name": users["full_name"] if users else None,
        "body": row["body"],
        "created_at": row["created_at"],
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

    result = []
    for row in rows:
        # ponytail: one query per conversation for its last-message preview -- fine at this
        # app's per-user conversation counts; move to a DB view/RPC if this ever needs to
        # scale past a handful of threads per user.
        last = supabase.table("messages").select("body,created_at") \
            .eq("conversation_id", row["id"]).order("created_at", desc=True).limit(1).execute().data
        result.append(_to_summary(row, profile["role_id"], last[0] if last else None))

    result.sort(key=lambda c: c["last_message_at"] or "", reverse=True)
    return result


def get_conversation(conversation_id: int, profile: dict = Depends(get_current_profile)):
    """Read one conversation's full message history. 403s if the caller isn't a participant.
    Calls: `_get_conversation_row()`, `_ensure_participant()`, `_to_summary()`, `_to_message_summary()`."""
    row = _get_conversation_row(conversation_id)
    _ensure_participant(row, profile)

    messages = supabase.table("messages").select(MESSAGES_SELECT) \
        .eq("conversation_id", conversation_id).order("created_at").execute().data
    summary = _to_summary(row, profile["role_id"])
    return {
        "id": summary["id"],
        "other_party_name": summary["other_party_name"],
        "other_party_role": summary["other_party_role"],
        "messages": [_to_message_summary(m) for m in messages],
    }


def send_message(conversation_id: int, data: MessageCreate, profile: dict = Depends(get_current_profile)):
    """Append a message from the caller into this conversation. 403s if the caller isn't a
    participant. Calls: `_get_conversation_row()`, `_ensure_participant()`, `_to_message_summary()`."""
    row = _get_conversation_row(conversation_id)
    _ensure_participant(row, profile)

    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message can't be empty")

    supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "sender_user_id": profile["user_id"],
        "body": body,
    }).execute()

    inserted = supabase.table("messages").select(MESSAGES_SELECT) \
        .eq("conversation_id", conversation_id).order("created_at", desc=True).limit(1).execute().data[0]
    return _to_message_summary(inserted)
