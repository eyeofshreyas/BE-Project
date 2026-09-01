"""Pydantic request/response schemas for lawyer-to-client invite requests."""

from typing import Literal

from pydantic import BaseModel


class ClientRequestCreate(BaseModel):
    """Request body for a lawyer sending a client invite."""
    email: str
    court_id: int
    case_type_id: int
    message: str | None = None


class ClientRequestDecision(BaseModel):
    """Request body for a client accepting or declining an invite."""
    decision: Literal["accept", "decline"]


class ClientRequestSummary(BaseModel):
    """Client request row shaped for list responses."""
    id: int
    lawyer_name: str | None
    client_name: str | None
    invite_email: str | None
    court_name: str | None
    case_type_name: str | None
    message: str | None
    status: str
    created_at: str
