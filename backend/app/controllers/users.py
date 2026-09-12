"""Controllers for users: the admin-only roster (list, activate/deactivate), gated by
require_roles(ADMIN) -- see docs/BACKEND_ARCHITECTURE.md's require_roles-only section --
plus the self-service profile edit any signed-in user may make to their own row."""

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, get_current_profile, require_roles
from app.models.users import UserSummary, StatusUpdate, ProfileUpdate

USERS_SELECT = "user_id,full_name,email,phone,is_active,created_at,roles(role_name)"


def _to_user_summary(row: dict) -> dict:
    """Shape a raw `users` row (joined with roles) into the UserSummary dict."""
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
    """List all users, optionally filtered by role name. Calls: `_to_user_summary()`."""
    rows = supabase.table("users").select(USERS_SELECT).order("created_at", desc=True).execute().data
    # ponytail: filters in Python post-fetch, fine while the users table is small;
    # switch to a PostgREST embedded filter (roles.role_name=eq.X) if the table grows large.
    if role is not None:
        rows = [r for r in rows if r.get("roles") and r["roles"]["role_name"].lower() == role.lower()]
    return [_to_user_summary(row) for row in rows]


def set_user_status(user_id: int, data: StatusUpdate, profile: dict = Depends(require_roles(ADMIN))):
    """Activate/deactivate a user; 404 if not found. Calls: `_to_user_summary()`."""
    rows = supabase.table("users").update({"is_active": data.is_active}).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data
    return _to_user_summary(result[0])


def update_own_profile(data: ProfileUpdate, profile: dict = Depends(get_current_profile)):
    """Update the caller's own name/phone. Email is deliberately not editable here: it's the
    only link between a `users` row and its Supabase Auth account (see auth.get_current_profile),
    so changing it on one side alone locks the account out. Calls: `_to_user_summary()`."""
    supabase.table("users").update(data.model_dump()).eq("user_id", profile["user_id"]).execute()
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", profile["user_id"]).execute().data
    return _to_user_summary(result[0])
