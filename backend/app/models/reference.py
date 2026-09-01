"""Pydantic response schemas for reference/lookup data (courts, case types, roles, judges, document types)."""

from pydantic import BaseModel


class CaseType(BaseModel):
    """Case type lookup row."""
    case_type_id: int
    case_type_name: str
    description: str | None


class Court(BaseModel):
    """Court lookup row."""
    court_id: int
    court_name: str
    court_type: str | None
    city: str | None
    state: str | None
    address: str | None


class Role(BaseModel):
    """User role lookup row."""
    role_id: int
    role_name: str
    description: str | None


class Judge(BaseModel):
    """Judge lookup row."""
    judge_id: int
    judge_name: str
    designation: str | None
    court_id: int
    court_name: str | None


class DocumentType(BaseModel):
    """Document type lookup row."""
    document_type_id: int
    type_name: str
    description: str | None
