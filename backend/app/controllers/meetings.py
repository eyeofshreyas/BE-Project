"""Controllers for meetings and their participants: list, get, create, plus participant management."""

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access
from app.models.meetings import MeetingSummary, MeetingCreate, MeetingUpdate, ParticipantSummary, ParticipantCreate

MEETINGS_SELECT = (
    "meeting_id,case_id,meeting_title,meeting_type,meeting_date,duration_minutes,"
    "agenda,discussion_summary,decisions,action_items,next_meeting_date,meeting_status,"
    "cases(case_number),lawyers(users(full_name))"
)

PARTICIPANTS_SELECT = "participant_id,meeting_id,user_id,participant_role,users(full_name)"


def _to_meeting_summary(row: dict) -> dict:
    """Shape a raw `meetings` row (joined with cases/lawyers/users) into the MeetingSummary dict."""
    case = row.get("cases")
    lawyer = row.get("lawyers")
    return {
        "id": row["meeting_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
        "meeting_title": row["meeting_title"],
        "meeting_type": row["meeting_type"],
        "meeting_date": row["meeting_date"],
        "duration_minutes": row["duration_minutes"],
        "agenda": row["agenda"],
        "discussion_summary": row["discussion_summary"],
        "decisions": row["decisions"],
        "action_items": row["action_items"],
        "next_meeting_date": row["next_meeting_date"],
        "meeting_status": row["meeting_status"],
        "conducted_by": lawyer["users"]["full_name"] if lawyer else None,
    }


def _to_participant_summary(row: dict) -> dict:
    """Shape a raw `meeting_participants` row (joined with users) into the ParticipantSummary dict."""
    user = row.get("users")
    return {
        "participant_id": row["participant_id"],
        "meeting_id": row["meeting_id"],
        "user_id": row["user_id"],
        "participant_role": row["participant_role"],
        "full_name": user["full_name"] if user else None,
    }


# shared fetch+scope-check used by get_meeting, list_participants, and
# add_participant -- keeps the 404/403 logic in one place.
def _get_meeting(meeting_id: int, case_ids: set[int] | None = None) -> dict:
    """Fetch one meeting by ID; 404 if missing, 403 if outside case_ids. Calls: `_to_meeting_summary()`."""
    rows = supabase.table("meetings").select(MEETINGS_SELECT).eq("meeting_id", meeting_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this meeting")
    return _to_meeting_summary(rows[0])


def list_meetings(case_id: int | None = None, profile: dict = Depends(get_current_profile)):
    """List meetings, optionally filtered by case_id, restricted to the caller's scope.
    Calls: `get_scoped_case_ids()`, `_to_meeting_summary()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("meetings").select(MEETINGS_SELECT)
    if case_id is not None:
        query = query.eq("case_id", case_id)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("meeting_date", desc=True).execute().data
    return [_to_meeting_summary(row) for row in rows]


def get_meeting(meeting_id: int, profile: dict = Depends(get_current_profile)):
    """Fetch one meeting, scoped to the caller. Calls: `_get_meeting()`, `get_scoped_case_ids()`."""
    return _get_meeting(meeting_id, get_scoped_case_ids(profile))


def create_meeting(data: MeetingCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Schedule a meeting for a case the caller has access to, conducted by the caller's own
    lawyer record unless another is named -- the client never sends a lawyer_id, it only knows
    user_ids. Calls: `ensure_case_access()`, `_get_meeting()`."""
    ensure_case_access(data.case_id, profile)

    conducted_by = data.conducted_by
    if conducted_by is None:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        if not lawyer_rows:
            raise HTTPException(status_code=400, detail="Name a lawyer to conduct this meeting.")
        conducted_by = lawyer_rows[0]["lawyer_id"]

    row = supabase.table("meetings").insert({
        "case_id": data.case_id,
        "conducted_by": conducted_by,
        "meeting_title": data.meeting_title,
        "meeting_type": data.meeting_type,
        "meeting_date": data.meeting_date,
        "duration_minutes": data.duration_minutes,
        "agenda": data.agenda,
        "next_meeting_date": data.next_meeting_date,
        "meeting_status": "Scheduled",
    }).execute().data[0]
    return _get_meeting(row["meeting_id"])


def update_meeting(meeting_id: int, data: MeetingUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Record a meeting's outcome -- what was discussed, decided and agreed, and whether it
    happened. Scoped like every other meeting read, so a lawyer can only touch meetings on
    cases they're assigned to. Calls: `_get_meeting()`."""
    _get_meeting(meeting_id, get_scoped_case_ids(profile))

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return _get_meeting(meeting_id)

    rows = supabase.table("meetings").update(updates).eq("meeting_id", meeting_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _get_meeting(meeting_id)


def list_participants(meeting_id: int, profile: dict = Depends(get_current_profile)):
    """List participants of a meeting the caller has access to.
    Calls: `_get_meeting()`, `get_scoped_case_ids()`, `_to_participant_summary()`."""
    _get_meeting(meeting_id, get_scoped_case_ids(profile))
    rows = supabase.table("meeting_participants").select(PARTICIPANTS_SELECT).eq("meeting_id", meeting_id).execute().data
    return [_to_participant_summary(row) for row in rows]


def add_participant(meeting_id: int, data: ParticipantCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Add a participant to a meeting the caller has access to.
    Calls: `_get_meeting()`, `get_scoped_case_ids()`, `_to_participant_summary()`."""
    _get_meeting(meeting_id, get_scoped_case_ids(profile))
    row = supabase.table("meeting_participants").insert({
        "meeting_id": meeting_id,
        "user_id": data.user_id,
        "participant_role": data.participant_role,
    }).execute().data[0]
    rows = supabase.table("meeting_participants").select(PARTICIPANTS_SELECT).eq("participant_id", row["participant_id"]).execute().data
    return _to_participant_summary(rows[0])
