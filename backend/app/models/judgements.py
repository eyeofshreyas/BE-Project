from typing import Literal
from pydantic import BaseModel

Outcome = Literal["Favourable", "Partly Favourable", "Against", "Settled"]


class JudgementSummary(BaseModel):
    id: int
    case_id: int
    case_number: str | None
    case_title: str | None
    citation: str
    court: str
    bench: str
    judgement_date: str
    filing_date: str | None
    outcome: Outcome
    summary: str
    relief_text: str | None
    relief_amount: float | None
    appeal_status: str | None
    tags: list[str] | None


class JudgementCreate(BaseModel):
    case_id: int
    citation: str
    court: str
    bench: str
    judgement_date: str
    outcome: Outcome
    summary: str
    relief_text: str | None = None
    relief_amount: float | None = None
    appeal_status: str | None = None
    tags: list[str] | None = None
