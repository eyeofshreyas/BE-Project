"""Pydantic request/response schemas for case parties and conflict checks."""

from pydantic import BaseModel


class PartyCreate(BaseModel):
    """Request body for adding a non-client party to a case (opposing party, co-party, etc.)."""
    name: str
    role: str = "Opposing Party"


class PartySummary(BaseModel):
    """A case_parties row shaped for list responses."""
    id: int
    case_id: int
    name: str
    role: str
    created_at: str


class ConflictMatch(BaseModel):
    """One name match surfaced by a conflict check -- enough to flag it, not full case detail."""
    source: str  # "client" | "party"
    name: str
    case_id: int
    case_number: str
    lawyer: str | None
    role: str | None  # the party's role when source == "party"; None for a client match
