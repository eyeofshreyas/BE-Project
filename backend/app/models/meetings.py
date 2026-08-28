from pydantic import BaseModel


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
