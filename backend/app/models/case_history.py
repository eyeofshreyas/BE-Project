"""Pydantic request/response schemas for case notes, timeline events, and status history."""

from pydantic import BaseModel


class ChecklistItem(BaseModel):
    """One checklist line within a case note."""
    text: str
    checked: bool = False


class NoteSummary(BaseModel):
    """Case note row shaped for list responses."""
    id: int
    case_id: int
    title: str | None
    note: str
    checklist: list[ChecklistItem] | None
    pinned: bool
    created_at: str
    lawyer_name: str | None


class NoteCreate(BaseModel):
    """Request body for adding a case note."""
    note: str
    title: str | None = None
    checklist: list[ChecklistItem] | None = None


class NoteUpdate(BaseModel):
    """Request body for editing a case note. Only provided fields are changed."""
    title: str | None = None
    note: str | None = None
    checklist: list[ChecklistItem] | None = None
    pinned: bool | None = None


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
