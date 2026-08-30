from pydantic import BaseModel


class HearingSummary(BaseModel):
    id: int
    case_id: int
    case_number: str | None
    case_title: str | None
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
    case_id: int
    judge_id: int
    hearing_date: str
    hearing_time: str | None = None
    courtroom: str | None = None
    notes: str | None = None


class HearingUpdate(BaseModel):
    hearing_status: str | None = None
    hearing_outcome: str | None = None
    next_hearing_date: str | None = None
    notes: str | None = None
