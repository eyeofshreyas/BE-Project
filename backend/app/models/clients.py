"""Pydantic request/response schemas for clients."""

from pydantic import BaseModel


class ClientSummary(BaseModel):
    """Client row shaped for list responses, with derived case/billing counts."""
    id: int
    full_name: str
    email: str
    phone: str
    address: str | None
    preferred_language: str | None
    active_cases: int
    status: str
    pending_amount: float
