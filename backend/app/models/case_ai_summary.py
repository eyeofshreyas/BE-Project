"""Pydantic schema for a case-level AI summary (text summary + related precedent cases)."""

from pydantic import BaseModel


class RelatedCase(BaseModel):
    """One related-precedent hit from the similar-cases search."""
    doc_id: str
    score: float


class CaseAiSummary(BaseModel):
    """Stored AI summary for a case, shaped for responses."""
    case_id: int
    summary_text: str
    related_cases: list[RelatedCase]
    generated_at: str
