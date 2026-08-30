from typing import Literal

from pydantic import BaseModel


class ClientRequestCreate(BaseModel):
    email: str
    court_id: int
    case_type_id: int
    message: str | None = None


class ClientRequestDecision(BaseModel):
    decision: Literal["accept", "decline"]


class ClientRequestSummary(BaseModel):
    id: int
    lawyer_name: str | None
    client_name: str | None
    invite_email: str | None
    court_name: str | None
    case_type_name: str | None
    message: str | None
    status: str
    created_at: str
