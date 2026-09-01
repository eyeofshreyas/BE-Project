from pydantic import BaseModel


class CaseCreate(BaseModel):
    case_type_id: int
    case_title: str
    client_id: int
    court_id: int
    priority: str = "Medium"
    next_hearing_date: str | None = None
    description: str | None = None


class CaseSummary(BaseModel):
    id: str
    case_id: int
    case_title: str | None
    filing_date: str | None
    created_at: str | None
    client: str | None
    lawyer_id: int | None
    lawyer: str | None
    lawyer_email: str | None
    lawyer_phone: str | None
    court: str | None
    case_type: str | None
    status: str
    hearing: str | None
    priority: str
