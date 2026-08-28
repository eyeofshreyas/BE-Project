from pydantic import BaseModel


class UserSummary(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str
    role: str | None
    is_active: bool
    created_at: str


class StatusUpdate(BaseModel):
    is_active: bool
