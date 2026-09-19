"""Controllers for users: the admin-only roster (list, edit, activate/deactivate, hard
delete), gated by require_roles(ADMIN, SUPER_ADMIN) -- see docs/BACKEND_ARCHITECTURE.md's
require_roles-only section -- plus the self-service profile edit any signed-in user may
make to their own row."""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from storage3.exceptions import StorageApiError
from app.controllers.documents import DOCUMENTS_BUCKET
from app.controllers.reference import LAWYER_SPECIALIZATIONS
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, CLIENT, SUPER_ADMIN, get_current_profile, require_roles
from app.models.users import UserSummary, StatusUpdate, ProfileUpdate, ClientFirmStatusUpdate

logger = logging.getLogger(__name__)

USERS_SELECT = "user_id,full_name,email,phone,is_active,created_at,roles(role_name)"

# ponytail: hard cap, not real pagination -- same reasoning as cases.MAX_CASES. Matters
# most for the super-admin's platform-wide branch below; an org admin's is already
# scoped to their own org.
MAX_USERS = 1000


def _to_user_summary(row: dict, suspended: bool = False, specialization: str | None = None) -> dict:
    """Shape a raw `users` row (joined with roles) into the UserSummary dict. `suspended`
    reflects this caller's own org_clients row for a client (always False for every other
    role, and for a super-admin caller, who has no single org to check against).
    `specialization` is the lawyer's practice area (lawyers.specialization), None for
    every other role."""
    role = row.get("roles")
    return {
        "id": row["user_id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "phone": row["phone"],
        "role": role["role_name"] if role else None,
        "is_active": row["is_active"],
        "created_at": row["created_at"],
        "suspended": suspended,
        "specialization": specialization,
    }


def _lawyer_specialization(user_id: int, role_name: str | None) -> str | None:
    """The lawyer's practice area (lawyers.specialization, e.g. 'Family Law', 'Criminal
    Law') for a single-user response; None for any non-lawyer role."""
    if role_name != "Lawyer":
        return None
    rows = supabase.table("lawyers").select("specialization").eq("user_id", user_id).execute().data
    return rows[0]["specialization"] if rows else None


def list_users(role: str | None = None, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """List users -- platform-wide for the super-admin, scoped to the caller's own org for
    an org admin -- optionally filtered by role name. Calls: `_to_user_summary()`."""
    query = supabase.table("users").select(USERS_SELECT)
    if profile["role_id"] == ADMIN:
        query = query.eq("org_id", profile["org_id"])
    rows = query.order("created_at", desc=True).limit(MAX_USERS).execute().data

    suspended_client_ids: set[int] = set()
    if profile["role_id"] == ADMIN:
        # Clients are global (users.org_id is always NULL for them, by design -- see
        # clients.list_clients()), so the org_id filter above excludes every client. Add
        # back the ones with a case in this org, the same way list_clients() scopes them.
        case_rows = supabase.table("cases").select("client_id").eq("org_id", profile["org_id"]).execute().data
        client_ids = list({r["client_id"] for r in case_rows if r["client_id"]})
        if client_ids:
            client_user_rows = supabase.table("clients").select("user_id,client_id").in_("client_id", client_ids).execute().data
            client_user_ids = {r["client_id"]: r["user_id"] for r in client_user_rows}
            if client_user_ids:
                rows += supabase.table("users").select(USERS_SELECT).in_("user_id", list(client_user_ids.values())).execute().data
            suspended_rows = supabase.table("org_clients").select("client_id").eq("org_id", profile["org_id"]).eq("is_active", False).execute().data
            suspended_by_client_id = {r["client_id"] for r in suspended_rows}
            suspended_client_ids = {user_id for client_id, user_id in client_user_ids.items() if client_id in suspended_by_client_id}
        rows.sort(key=lambda r: r["created_at"], reverse=True)

    # ponytail: filters in Python post-fetch, fine while the users table is small;
    # switch to a PostgREST embedded filter (roles.role_name=eq.X) if the table grows large.
    if role is not None:
        rows = [r for r in rows if r.get("roles") and r["roles"]["role_name"].lower() == role.lower()]

    lawyer_ids = [r["user_id"] for r in rows if r.get("roles") and r["roles"]["role_name"] == "Lawyer"]
    specializations: dict[int, str] = {}
    if lawyer_ids:
        lawyer_rows = supabase.table("lawyers").select("user_id,specialization").in_("user_id", lawyer_ids).execute().data
        specializations = {r["user_id"]: r["specialization"] for r in lawyer_rows if r["specialization"]}

    return [
        _to_user_summary(row, suspended=row["user_id"] in suspended_client_ids, specialization=specializations.get(row["user_id"]))
        for row in rows
    ]


def _client_has_case_in_org(user_id: int, org_id: int) -> bool:
    """Same "does this client have a case in my org" check list_users()/list_clients() use
    to decide which clients an org admin can even see."""
    client_rows = supabase.table("clients").select("client_id").eq("user_id", user_id).execute().data
    if not client_rows:
        return False
    case_rows = supabase.table("cases").select("client_id").eq("client_id", client_rows[0]["client_id"]).eq("org_id", org_id).execute().data
    return bool(case_rows)


def _assert_same_org_or_404(user_id: int, profile: dict) -> None:
    """404 (not 403) if this user_id belongs to a different org than an org admin's own --
    an org admin shouldn't be able to tell whether a user in another org exists. A client's
    users.org_id is always NULL (clients are global, by design), so a client instead passes
    when they have a case in the caller's org -- same reasoning and scoping as
    set_client_firm_status(). No-op for the super-admin."""
    if profile["role_id"] != ADMIN:
        return
    rows = supabase.table("users").select("org_id").eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    if rows[0]["org_id"] == profile["org_id"]:
        return
    if rows[0]["org_id"] is None and _client_has_case_in_org(user_id, profile["org_id"]):
        return
    raise HTTPException(status_code=404, detail="User not found")


def set_user_status(user_id: int, data: StatusUpdate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Activate/deactivate a user; 404 if not found or outside the caller's org. Calls:
    `_assert_same_org_or_404()`, `_to_user_summary()`."""
    _assert_same_org_or_404(user_id, profile)
    rows = supabase.table("users").update({"is_active": data.is_active}).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data[0]
    role_name = result["roles"]["role_name"] if result.get("roles") else None
    return _to_user_summary(result, specialization=_lawyer_specialization(user_id, role_name))


def set_client_firm_status(user_id: int, data: ClientFirmStatusUpdate, profile: dict = Depends(require_roles(ADMIN))):
    """Suspend or reactivate a client's relationship with the caller's own firm -- writes to
    org_clients, never to the client's global users.is_active. SUPER_ADMIN is excluded: a
    platform operator has no org_id to suspend a client *from* (same reasoning as
    admin.invite_lawyer()). Calls: `_to_user_summary()`."""
    client_rows = supabase.table("clients").select("client_id").eq("user_id", user_id).execute().data
    if not client_rows:
        raise HTTPException(status_code=404, detail="This user isn't a client")
    client_id = client_rows[0]["client_id"]

    # Same "does this client have a case in my org" check list_clients() and list_users()
    # use to scope which clients an org admin can even see -- without it, any admin could
    # suspend/reactivate any client platform-wide. 404 (not 403), same reasoning as
    # _assert_same_org_or_404: an org admin shouldn't be able to tell a client outside their
    # org exists at all.
    case_rows = supabase.table("cases").select("client_id").eq("client_id", client_id).eq("org_id", profile["org_id"]).execute().data
    if not case_rows:
        raise HTTPException(status_code=404, detail="This user isn't a client")

    supabase.table("org_clients").upsert({
        "org_id": profile["org_id"],
        "client_id": client_id,
        "is_active": data.is_active,
        "suspended_at": None if data.is_active else datetime.now(timezone.utc).isoformat(),
    }, on_conflict="org_id,client_id").execute()

    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data
    return _to_user_summary(result[0], suspended=not data.is_active)


def update_own_profile(data: ProfileUpdate, profile: dict = Depends(get_current_profile)):
    """Update the caller's own name/phone. Email is deliberately not editable here: it's the
    only link between a `users` row and its Supabase Auth account (see auth.get_current_profile),
    so changing it on one side alone locks the account out. `specialization` is ignored here --
    a lawyer doesn't self-certify their own practice area, an admin sets it (see `update_user()`).
    Calls: `_to_user_summary()`."""
    supabase.table("users").update({"full_name": data.full_name, "phone": data.phone}).eq("user_id", profile["user_id"]).execute()
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", profile["user_id"]).execute().data[0]
    role_name = result["roles"]["role_name"] if result.get("roles") else None
    return _to_user_summary(result, specialization=_lawyer_specialization(profile["user_id"], role_name))


def update_user(user_id: int, data: ProfileUpdate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Admin edit of another user's name/phone, plus specialization when the target is a
    Lawyer (must be one of reference.LAWYER_SPECIALIZATIONS); 404 if not found or outside the
    caller's org. Email stays out of reach for the same reason as in `update_own_profile()`.
    Calls: `_assert_same_org_or_404()`, `_to_user_summary()`."""
    _assert_same_org_or_404(user_id, profile)
    rows = supabase.table("users").update({"full_name": data.full_name, "phone": data.phone}).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    result = supabase.table("users").select(USERS_SELECT).eq("user_id", user_id).execute().data[0]
    role_name = result["roles"]["role_name"] if result.get("roles") else None

    specialization = _lawyer_specialization(user_id, role_name)
    if role_name == "Lawyer" and data.specialization is not None and data.specialization != specialization:
        if data.specialization not in LAWYER_SPECIALIZATIONS:
            raise HTTPException(status_code=400, detail="Not a recognized specialization.")
        supabase.table("lawyers").update({"specialization": data.specialization}).eq("user_id", user_id).execute()
        specialization = data.specialization

    return _to_user_summary(result, specialization=specialization)


def _cascade(user_id: int, dry_run: bool) -> dict:
    """Run the delete_user_cascade SQL function (see backend/migrate_delete_user_cascade.sql).
    Everything it touches happens in one transaction, so a failure part-way leaves the
    database exactly as it was."""
    return supabase.rpc("delete_user_cascade", {"p_user_id": user_id, "p_dry_run": dry_run}).execute().data


def _trust_balance_held(user_id: int) -> float:
    """Client money this user still has sitting in a trust account, across every firm.
    Deleting them would destroy the record of money the firm is holding on their behalf,
    so `_assert_deletable()` refuses while this is above zero."""
    client_rows = supabase.table("clients").select("client_id").eq("user_id", user_id).execute().data
    if not client_rows:
        return 0.0
    rows = supabase.table("trust_transactions").select("type,amount").eq("client_id", client_rows[0]["client_id"]).execute().data
    return round(sum(r["amount"] if r["type"] == "deposit" else -r["amount"] for r in rows), 2)


def _assert_deletable(user_id: int, profile: dict) -> None:
    """Refuse the deletes that shouldn't happen: your own account, the last remaining admin
    (scoped to the caller's own org for an org admin, platform-wide for the super-admin),
    and a client whose money the firm is still holding. Calls: `_trust_balance_held()`."""
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

    held = _trust_balance_held(user_id)
    if held > 0:
        raise HTTPException(
            status_code=400,
            detail=f"This client still has {held:.2f} held in the trust account. Return or disburse it before deleting them.",
        )


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
