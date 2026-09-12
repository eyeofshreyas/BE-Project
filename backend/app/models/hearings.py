"""Pydantic request/response schemas for court hearings."""

from pydantic import BaseModel


class HearingSummary(BaseModel):
    """Hearing row shaped for list/detail responses, joined with case/court/judge info."""
    id: int
    case_id: int
    case_number: str | None
    case_title: str | None
    client: str | None
    priority: str | None
    judge_name: str | None
    court_name: str | None
    hearing_date: str
    hearing_time: str | None
    courtroom: str | None
    hearing_status: str
    hearing_outcome: str | None
    next_hearing_date: str | None
    notes: str | None


class HearingCreate(BaseModel):
    """Request body for scheduling a hearing."""
    case_id: int
    judge_id: int
    hearing_date: str
    hearing_time: str | None = None
    courtroom: str | None = None
    notes: str | None = None
    # A case really can be listed twice before the same judge at the same time -- a re-listing,
    # or two matters heard together. Set this to say the repeat is deliberate; left off, an
    # identical hearing is refused so a double-submitted form doesn't create one by accident.
    allow_duplicate: bool = False


class HearingUpdate(BaseModel):
    """Request body for updating a hearing's outcome/status."""
    hearing_status: str | None = None
    hearing_outcome: str | None = None
    next_hearing_date: str | None = None
    notes: str | None = None
