from pydantic import BaseModel


class NoteSummary(BaseModel):
    id: int
    case_id: int
    note: str
    created_at: str
    lawyer_name: str | None


class NoteCreate(BaseModel):
    note: str


class TimelineEvent(BaseModel):
    id: int
    case_id: int
    event_type: str
    event_title: str
    event_description: str | None
    created_at: str
    created_by: str | None


class StatusHistoryEntry(BaseModel):
    id: int
    case_id: int
    previous_status: str | None
    current_status: str | None
    changed_at: str
    changed_by: str | None


class StatusChange(BaseModel):
    new_status: str
