"""Controllers for case notes, timeline events, and status history/changes."""

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, ensure_case_access
from app.models.case_history import NoteSummary, NoteCreate, TimelineEvent, StatusHistoryEntry, StatusChange

NOTES_SELECT = "note_id,case_id,note,created_at,lawyers(users(full_name))"
TIMELINE_SELECT = "timeline_id,case_id,event_type,event_title,event_description,created_at,users(full_name)"
STATUS_HISTORY_SELECT = "history_id,case_id,previous_status,current_status,changed_at,users(full_name)"


def _to_note(row: dict) -> dict:
    """Shape a raw `case_notes` row (joined with lawyers/users) into the NoteSummary dict."""
    lawyer = row.get("lawyers")
    return {
        "id": row["note_id"],
        "case_id": row["case_id"],
        "note": row["note"],
        "created_at": row["created_at"],
        "lawyer_name": lawyer["users"]["full_name"] if lawyer else None,
    }


def _to_timeline_event(row: dict) -> dict:
    """Shape a raw `case_timeline` row into the TimelineEvent dict."""
    user = row.get("users")
    return {
        "id": row["timeline_id"],
        "case_id": row["case_id"],
        "event_type": row["event_type"],
        "event_title": row["event_title"],
        "event_description": row["event_description"],
        "created_at": row["created_at"],
        "created_by": user["full_name"] if user else None,
    }


def _to_status_history(row: dict) -> dict:
    """Shape a raw `case_status_history` row into the StatusHistoryEntry dict."""
    user = row.get("users")
    return {
        "id": row["history_id"],
        "case_id": row["case_id"],
        "previous_status": row["previous_status"],
        "current_status": row["current_status"],
        "changed_at": row["changed_at"],
        "changed_by": user["full_name"] if user else None,
    }


def list_case_notes(case_id: int, profile: dict = Depends(get_current_profile)):
    """List notes for a case the caller has access to. Calls: `ensure_case_access()`, `_to_note()`."""
    ensure_case_access(case_id, profile)
    rows = supabase.table("case_notes").select(NOTES_SELECT).eq("case_id", case_id).order("created_at", desc=True).execute().data
    return [_to_note(row) for row in rows]


def add_case_note(case_id: int, data: NoteCreate, profile: dict = Depends(require_roles(LAWYER))):
    """Add a note to a case as the calling lawyer. Calls: `ensure_case_access()`, `_to_note()`."""
    ensure_case_access(case_id, profile)
    lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
    if not lawyer_rows:
        raise HTTPException(status_code=400, detail="No lawyer profile for this account")

    row = supabase.table("case_notes").insert({
        "case_id": case_id,
        "lawyer_id": lawyer_rows[0]["lawyer_id"],
        "note": data.note,
    }).execute().data[0]
    rows = supabase.table("case_notes").select(NOTES_SELECT).eq("note_id", row["note_id"]).execute().data
    return _to_note(rows[0])


def list_case_timeline(case_id: int, profile: dict = Depends(get_current_profile)):
    """List timeline events for a case the caller has access to.
    Calls: `ensure_case_access()`, `_to_timeline_event()`."""
    ensure_case_access(case_id, profile)
    rows = supabase.table("case_timeline").select(TIMELINE_SELECT).eq("case_id", case_id).order("created_at", desc=True).execute().data
    return [_to_timeline_event(row) for row in rows]


def list_status_history(case_id: int, profile: dict = Depends(get_current_profile)):
    """List status-change history for a case the caller has access to.
    Calls: `ensure_case_access()`, `_to_status_history()`."""
    ensure_case_access(case_id, profile)
    rows = supabase.table("case_status_history").select(STATUS_HISTORY_SELECT).eq("case_id", case_id).order("changed_at", desc=True).execute().data
    return [_to_status_history(row) for row in rows]


def change_case_status(case_id: int, data: StatusChange, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Update a case's status, and record both a status-history row and a timeline event.
    Calls: `ensure_case_access()`, `_to_status_history()`."""
    ensure_case_access(case_id, profile)
    case_rows = supabase.table("cases").select("status").eq("case_id", case_id).execute().data
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    previous_status = case_rows[0]["status"]
    changed_by = profile["user_id"]

    supabase.table("cases").update({"status": data.new_status}).eq("case_id", case_id).execute()

    history_row = supabase.table("case_status_history").insert({
        "case_id": case_id,
        "previous_status": previous_status,
        "current_status": data.new_status,
        "changed_by": changed_by,
    }).execute().data[0]

    supabase.table("case_timeline").insert({
        "case_id": case_id,
        "event_type": "status_change",
        "event_title": f"Status changed to {data.new_status}",
        "event_description": f"Status changed from {previous_status} to {data.new_status}",
        "created_by": changed_by,
    }).execute()

    rows = supabase.table("case_status_history").select(STATUS_HISTORY_SELECT).eq("history_id", history_row["history_id"]).execute().data
    return _to_status_history(rows[0])
