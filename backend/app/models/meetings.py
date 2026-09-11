"""Pydantic request/response schemas for meetings and their participants."""

from pydantic import BaseModel


class MeetingSummary(BaseModel):
    """Meeting row shaped for list/detail responses."""
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
    """Request body for scheduling a meeting."""
    case_id: int
    conducted_by: int | None = None
    meeting_title: str | None = None
    meeting_type: str | None = None
    meeting_date: str
    duration_minutes: int | None = None
    agenda: str | None = None
    next_meeting_date: str | None = None


class MeetingUpdate(BaseModel):
    """Request body for recording what came out of a meeting. Every field is optional; only the
    ones sent are written."""
    meeting_status: str | None = None
    discussion_summary: str | None = None
    decisions: str | None = None
    action_items: str | None = None
    next_meeting_date: str | None = None


class ParticipantSummary(BaseModel):
    """Meeting participant row shaped for list responses."""
    participant_id: int
    meeting_id: int
    user_id: int
    participant_role: str | None
    full_name: str | None


class ParticipantCreate(BaseModel):
    """Request body for adding a participant to a meeting."""
    user_id: int
    participant_role: str | None = None
