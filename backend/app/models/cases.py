"""Pydantic request/response schemas for cases."""

from pydantic import BaseModel


class CaseCreate(BaseModel):
    """Request body for creating a case."""
    case_type_id: int
    case_title: str
    client_id: int
    court_id: int
    priority: str = "Medium"
    next_hearing_date: str | None = None
    description: str | None = None


class CaseSummary(BaseModel):
    """Case row shaped for list/detail responses, joined with client/lawyer/court/type info."""
    id: str
    case_id: int
    case_title: str | None
    filing_date: str | None
    created_at: str | None
    client: str | None
    client_id: int | None
    client_email: str | None
    client_phone: str | None
    lawyer_id: int | None
    lawyer: str | None
    lawyer_email: str | None
    lawyer_phone: str | None
    court: str | None
    case_type: str | None
    status: str
    hearing: str | None
    priority: str
    description: str | None
    cnr_number: str | None
    ecourts_status: str | None
    ecourts_last_synced_at: str | None


class CnrUpdate(BaseModel):
    """Request body for attaching a case's eCourts CNR number."""
    cnr_number: str
