from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase_client import supabase
from auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access

router = APIRouter(prefix="/meetings", tags=["meetings"])

MEETINGS_SELECT = (
    "meeting_id,case_id,meeting_title,meeting_type,meeting_date,duration_minutes,"
    "agenda,discussion_summary,decisions,action_items,next_meeting_date,meeting_status,"
    "cases(case_number),lawyers(users(full_name))"
)

PARTICIPANTS_SELECT = "participant_id,meeting_id,user_id,participant_role,users(full_name)"


class MeetingSummary(BaseModel):
    id: int
    case_id: int
    case_number: str | None
    meeting_title: str | None
    meeting_type: str | None
    meeting_date: str
    duration_minutes: int | None
    agenda: str | None
    discussion_summary: str | None
    decisions: str | None
    action_items: str | None
    next_meeting_date: str | None
    meeting_status: str
    conducted_by: str | None


class MeetingCreate(BaseModel):
    case_id: int
    conducted_by: int
    meeting_title: str | None = None
    meeting_type: str | None = None
    meeting_date: str
    duration_minutes: int | None = None
    agenda: str | None = None
    next_meeting_date: str | None = None


class ParticipantSummary(BaseModel):
    participant_id: int
    meeting_id: int
    user_id: int
    participant_role: str | None
    full_name: str | None


class ParticipantCreate(BaseModel):
    user_id: int
    participant_role: str | None = None


def _to_meeting_summary(row: dict) -> dict:
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
    user = row.get("users")
    return {
        "participant_id": row["participant_id"],
        "meeting_id": row["meeting_id"],
        "user_id": row["user_id"],
        "participant_role": row["participant_role"],
        "full_name": user["full_name"] if user else None,
    }


def _get_meeting(meeting_id: int, case_ids: set[int] | None = None) -> dict:
    rows = supabase.table("meetings").select(MEETINGS_SELECT).eq("meeting_id", meeting_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this meeting")
    return _to_meeting_summary(rows[0])


@router.get("", response_model=list[MeetingSummary])
def list_meetings(case_id: int | None = None, profile: dict = Depends(get_current_profile)):
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


@router.get("/{meeting_id}", response_model=MeetingSummary)
def get_meeting(meeting_id: int, profile: dict = Depends(get_current_profile)):
    return _get_meeting(meeting_id, get_scoped_case_ids(profile))


@router.post("", response_model=MeetingSummary)
def create_meeting(data: MeetingCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    ensure_case_access(data.case_id, profile)
    row = supabase.table("meetings").insert({
        "case_id": data.case_id,
        "conducted_by": data.conducted_by,
        "meeting_title": data.meeting_title,
        "meeting_type": data.meeting_type,
        "meeting_date": data.meeting_date,
        "duration_minutes": data.duration_minutes,
        "agenda": data.agenda,
        "next_meeting_date": data.next_meeting_date,
        "meeting_status": "Scheduled",
    }).execute().data[0]
    return _get_meeting(row["meeting_id"])


@router.get("/{meeting_id}/participants", response_model=list[ParticipantSummary])
def list_participants(meeting_id: int, profile: dict = Depends(get_current_profile)):
    _get_meeting(meeting_id, get_scoped_case_ids(profile))
    rows = supabase.table("meeting_participants").select(PARTICIPANTS_SELECT).eq("meeting_id", meeting_id).execute().data
    return [_to_participant_summary(row) for row in rows]


@router.post("/{meeting_id}/participants", response_model=ParticipantSummary)
def add_participant(meeting_id: int, data: ParticipantCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    _get_meeting(meeting_id, get_scoped_case_ids(profile))
    row = supabase.table("meeting_participants").insert({
        "meeting_id": meeting_id,
        "user_id": data.user_id,
        "participant_role": data.participant_role,
    }).execute().data[0]
    rows = supabase.table("meeting_participants").select(PARTICIPANTS_SELECT).eq("participant_id", row["participant_id"]).execute().data
    return _to_participant_summary(rows[0])
