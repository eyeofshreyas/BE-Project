from fastapi import Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, require_roles

USERS_SELECT = "user_id,full_name,email,phone,is_active,created_at,roles(role_name)"


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


def _to_user_summary(row: dict) -> dict:
    role = row.get("roles")
    return {
        "id": row["user_id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "phone": row["phone"],
        "role": role["role_name"] if role else None,
        "is_active": row["is_active"],
        "created_at": row["created_at"],
    }


def list_users(role: str | None = None, profile: dict = Depends(require_roles(ADMIN))):
    rows = supabase.table("users").select(USERS_SELECT).order("created_at", desc=True).execute().data
    # ponytail: filters in Python post-fetch, fine while the users table is small;
    # switch to a PostgREST embedded filter (roles.role_name=eq.X) if the table grows large.
    if role is not None:
        rows = [r for r in rows if r.get("roles") and r["roles"]["role_name"].lower() == role.lower()]
    return [_to_user_summary(row) for row in rows]


def set_user_status(user_id: int, data: StatusUpdate, profile: dict = Depends(require_roles(ADMIN))):
    rows = supabase.table("users").update({"is_active": data.is_active}).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data
    return _to_user_summary(result[0])
