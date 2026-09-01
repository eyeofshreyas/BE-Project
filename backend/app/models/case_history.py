"""Pydantic request/response schemas for case notes, timeline events, and status history."""

from pydantic import BaseModel


class NoteSummary(BaseModel):
    """Case note row shaped for list responses."""
    id: int
    case_id: int
    note: str
    created_at: str
    lawyer_name: str | None


class NoteCreate(BaseModel):
    """Request body for adding a case note."""
    note: str


class TimelineEvent(BaseModel):
    """Case timeline entry (auto-logged event) shaped for list responses."""
    id: int
    case_id: int
    event_type: str
    event_title: str
    event_description: str | None
    created_at: str
    created_by: str | None


class StatusHistoryEntry(BaseModel):
    """Case status-change record shaped for list responses."""
    id: int
    case_id: int
    previous_status: str | None
    current_status: str | None
    changed_at: str
    changed_by: str | None


class StatusChange(BaseModel):
    """Request body for changing a case's status."""
    new_status: str
