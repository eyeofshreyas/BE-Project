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
