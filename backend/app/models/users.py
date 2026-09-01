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
