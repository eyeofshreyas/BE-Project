"""Controllers for users: the admin-only roster (list, edit, activate/deactivate, hard
delete), gated by require_roles(ADMIN, SUPER_ADMIN) -- see docs/BACKEND_ARCHITECTURE.md's
require_roles-only section -- plus the self-service profile edit any signed-in user may
make to their own row."""

import logging

from fastapi import Depends, HTTPException
from storage3.exceptions import StorageApiError
from app.controllers.documents import DOCUMENTS_BUCKET
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, SUPER_ADMIN, get_current_profile, require_roles
from app.models.users import UserSummary, StatusUpdate, ProfileUpdate

logger = logging.getLogger(__name__)

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


def list_users(role: str | None = None, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """List users -- platform-wide for the super-admin, scoped to the caller's own org for
    an org admin -- optionally filtered by role name. Calls: `_to_user_summary()`."""
    query = supabase.table("users").select(USERS_SELECT)
    if profile["role_id"] == ADMIN:
        query = query.eq("org_id", profile["org_id"])
    rows = query.order("created_at", desc=True).execute().data
    # ponytail: filters in Python post-fetch, fine while the users table is small;
    # switch to a PostgREST embedded filter (roles.role_name=eq.X) if the table grows large.
    if role is not None:
        rows = [r for r in rows if r.get("roles") and r["roles"]["role_name"].lower() == role.lower()]
    return [_to_user_summary(row) for row in rows]


def _assert_same_org_or_404(user_id: int, profile: dict) -> None:
    """404 (not 403) if this user_id belongs to a different org than an org admin's own --
    an org admin shouldn't be able to tell whether a user in another org exists. No-op for
    the super-admin."""
    if profile["role_id"] != ADMIN:
        return
    rows = supabase.table("users").select("org_id").eq("user_id", user_id).execute().data
    if not rows or rows[0]["org_id"] != profile["org_id"]:
        raise HTTPException(status_code=404, detail="User not found")


def set_user_status(user_id: int, data: StatusUpdate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Activate/deactivate a user; 404 if not found or outside the caller's org. Calls:
    `_assert_same_org_or_404()`, `_to_user_summary()`."""
    _assert_same_org_or_404(user_id, profile)
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


def update_user(user_id: int, data: ProfileUpdate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Admin edit of another user's name/phone; 404 if not found or outside the caller's org.
    Email stays out of reach for the same reason as in `update_own_profile()`. Calls:
    `_assert_same_org_or_404()`, `_to_user_summary()`."""
    _assert_same_org_or_404(user_id, profile)
    rows = supabase.table("users").update(data.model_dump()).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data
    return _to_user_summary(result[0])


def _cascade(user_id: int, dry_run: bool) -> dict:
    """Run the delete_user_cascade SQL function (see backend/migrate_delete_user_cascade.sql).
    Everything it touches happens in one transaction, so a failure part-way leaves the
    database exactly as it was."""
    return supabase.rpc("delete_user_cascade", {"p_user_id": user_id, "p_dry_run": dry_run}).execute().data


def _assert_deletable(user_id: int, profile: dict) -> None:
    """Refuse the two deletes that would lock an org (or the platform) out of having
    someone able to administer it: your own account, and the last remaining admin --
    scoped to the caller's own org for an org admin, platform-wide for the super-admin."""
    if user_id == profile["user_id"]:
        raise HTTPException(status_code=400, detail="You can't delete your own account.")
    rows = supabase.table("users").select("role_id,org_id").eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    if profile["role_id"] == ADMIN and rows[0]["org_id"] != profile["org_id"]:
        raise HTTPException(status_code=404, detail="User not found")
    if rows[0]["role_id"] == ADMIN:
        admins_query = supabase.table("users").select("user_id", count="exact").eq("role_id", ADMIN)
        if profile["role_id"] == ADMIN:
            admins_query = admins_query.eq("org_id", profile["org_id"])
        admins = admins_query.execute().count or 0
        if admins <= 1:
            scope = "this organization" if profile["role_id"] == ADMIN else "the platform"
            raise HTTPException(status_code=400, detail=f"This is the last admin account for {scope} -- deleting it would leave no one able to administer it.")


def get_user_delete_impact(user_id: int, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Preview what deleting this user would destroy, without touching anything; 404 if
    outside the caller's org. Calls: `_assert_same_org_or_404()`, `_cascade()`."""
    _assert_same_org_or_404(user_id, profile)
    return _cascade(user_id, dry_run=True)


def delete_user(user_id: int, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Permanently delete a user and everything cascading off them. Irreversible -- callers
    are expected to have shown `get_user_delete_impact()` first.
    Calls: `_assert_deletable()`, `_cascade()`."""
    _assert_deletable(user_id, profile)
    result = _cascade(user_id, dry_run=False)

    # Storage lives outside the transaction, so this runs after the rows are gone and can
    # only ever leave an orphaned object behind -- never a row pointing at a deleted file.
    paths = result.get("storage_paths") or []
    if paths:
        try:
            supabase.storage.from_(DOCUMENTS_BUCKET).remove(paths)
        except StorageApiError:
            logger.exception("User %s deleted but %d storage object(s) were left behind", user_id, len(paths))
    return result
