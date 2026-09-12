"""Pydantic request/response schemas for case judgements."""

from typing import Literal
from pydantic import BaseModel

Outcome = Literal["Favourable", "Partly Favourable", "Against", "Settled"]


class JudgementSummary(BaseModel):
    """Judgement row shaped for list/detail responses."""
    id: int
    case_id: int
    case_number: str | None
    case_title: str | None
    client_name: str | None
    matter_type: str | None
    citation: str
    court: str
    bench: str
    judgement_date: str
    filing_date: str | None
    outcome: Outcome
    summary: str
    reasoning: str | None
    relief_text: str | None
    relief_amount: float | None
    appeal_status: str | None
    tags: list[str] | None


class JudgementCreate(BaseModel):
    """Request body for recording a judgement."""
    case_id: int
    citation: str
    court: str
    bench: str
    judgement_date: str
    outcome: Outcome
    summary: str
    reasoning: str | None = None
    relief_text: str | None = None
    relief_amount: float | None = None
    appeal_status: str | None = None
    tags: list[str] | None = None
