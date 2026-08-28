from fastapi import Depends, Header, HTTPException
from supabase_client import supabase

ADMIN = 1
LAWYER = 2
CLIENT = 3


def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_profile(current_user=Depends(get_current_user)):
    rows = supabase.table("users").select("user_id,role_id,full_name,email,is_active").eq("email", current_user.email).execute().data
    if not rows:
        raise HTTPException(status_code=401, detail="No LexFlow profile for this account")
    if not rows[0]["is_active"]:
        raise HTTPException(status_code=403, detail="This account has been suspended")
    return rows[0]


def require_roles(*allowed_role_ids: int):
    def dependency(profile: dict = Depends(get_current_profile)):
        if profile["role_id"] not in allowed_role_ids:
            raise HTTPException(status_code=403, detail="You don't have permission to perform this action")
        return profile
    return dependency


def get_scoped_case_ids(profile: dict) -> set[int] | None:
    """Case IDs this profile may see. None means unrestricted (admin only)."""
    if profile["role_id"] == ADMIN:
        return None

    if profile["role_id"] == LAWYER:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        if not lawyer_rows:
            return set()
        # is_active tracks current case_lawyers assignment (see cases.py's
        # _active_lawyer_name) -- a lawyer taken off a case loses access to it.
        case_rows = (
            supabase.table("case_lawyers")
            .select("case_id")
            .eq("lawyer_id", lawyer_rows[0]["lawyer_id"])
            .eq("is_active", True)
            .execute()
            .data
        )
        return {row["case_id"] for row in case_rows}

    if profile["role_id"] == CLIENT:
        client_rows = supabase.table("clients").select("client_id").eq("user_id", profile["user_id"]).execute().data
        if not client_rows:
            return set()
        case_rows = supabase.table("cases").select("case_id").eq("client_id", client_rows[0]["client_id"]).execute().data
        return {row["case_id"] for row in case_rows}

    return set()


def ensure_case_access(case_id: int, profile: dict) -> None:
    """Raise 403 if this profile isn't scoped to case_id. Use before any write
    that targets a case_id the caller already knows, to close the gap where
    require_roles() checks *what* a user is but not *which cases* they own."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and case_id not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this case")
