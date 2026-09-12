"""Pydantic request/response schemas for admin user management."""

from pydantic import BaseModel


class UserSummary(BaseModel):
    """User row shaped for list responses."""
    id: int
    full_name: str
    email: str
    phone: str
    role: str | None
    is_active: bool
    created_at: str


class StatusUpdate(BaseModel):
    """Request body for activating/deactivating a user."""
    is_active: bool


class ProfileUpdate(BaseModel):
    """Request body for a user editing their own profile."""
    full_name: str
    phone: str


class UserDeleteImpact(BaseModel):
    """What a hard delete of one user would destroy -- produced by the delete_user_cascade
    SQL function in dry-run mode, so the preview and the deletion cannot disagree."""
    user_id: int
    is_lawyer: bool
    is_client: bool
    cases: int
    matters: int
    documents: int
    conversations: int
    invoices: int
    hearings: int
    meetings: int
    notifications: int
    case_assignments: int
