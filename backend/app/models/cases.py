from pydantic import BaseModel


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
    status: str
    hearing: str | None
    priority: str
