"""Controllers for reference/lookup data (roles, case types, courts, judges, document
types). Any authenticated user may read these; no role/case scoping applied. Judges can
also be created -- see `create_judge`."""

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, SUPER_ADMIN, LAWYER, get_current_profile, require_roles
from app.models.reference import CaseType, Court, Role, Judge, JudgeCreate, DocumentType

JUDGES_SELECT = "judge_id,judge_name,designation,court_id,courts(court_name)"


def list_roles(profile: dict = Depends(get_current_profile)):
    """Return all roles. Calls: `supabase.table("roles")`."""
    return supabase.table("roles").select("*").order("role_id").execute().data


def list_case_types(profile: dict = Depends(get_current_profile)):
    """Return all case types. Calls: `supabase.table("case_types")`."""
    return supabase.table("case_types").select("*").order("case_type_name").execute().data


def list_courts(profile: dict = Depends(get_current_profile)):
    """Return all courts. Calls: `supabase.table("courts")`."""
    return supabase.table("courts").select("*").order("court_name").execute().data


def list_document_types(profile: dict = Depends(get_current_profile)):
    """Return all document types. Calls: `supabase.table("document_types")`."""
    return supabase.table("document_types").select("*").order("type_name").execute().data


def _to_judge(row: dict) -> dict:
    """Shape a raw `judges` row (joined with courts) into the Judge response shape."""
    return {
        "judge_id": row["judge_id"],
        "judge_name": row["judge_name"],
        "designation": row["designation"],
        "court_id": row["court_id"],
        "court_name": row["courts"]["court_name"] if row.get("courts") else None,
    }


def list_judges(profile: dict = Depends(get_current_profile)):
    """Return all judges joined with their court name. Calls: `_to_judge()`."""
    rows = supabase.table("judges").select(JUDGES_SELECT).order("judge_name").execute().data
    return [_to_judge(row) for row in rows]


def create_judge(data: JudgeCreate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Add a judge, e.g. one an eCourts sync or hearing needs that isn't seeded yet.
    Refuses a same-name-at-same-court duplicate; a same name at a different court is a
    different judge. Calls: `_to_judge()`."""
    clash = (
        supabase.table("judges").select("judge_id")
        .eq("judge_name", data.judge_name).eq("court_id", data.court_id)
        .execute().data
    )
    if clash:
        raise HTTPException(status_code=409, detail="This judge already exists at that court.")

    row = supabase.table("judges").insert({
        "judge_name": data.judge_name,
        "court_id": data.court_id,
        "designation": data.designation,
    }).execute().data[0]
    row = supabase.table("judges").select(JUDGES_SELECT).eq("judge_id", row["judge_id"]).execute().data[0]
    return _to_judge(row)
