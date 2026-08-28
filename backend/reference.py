from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase_client import supabase
from auth import get_current_profile

router = APIRouter(prefix="/reference", tags=["reference"])


class CaseType(BaseModel):
    case_type_id: int
    case_type_name: str
    description: str | None


class Court(BaseModel):
    court_id: int
    court_name: str
    court_type: str | None
    city: str | None
    state: str | None
    address: str | None


class Role(BaseModel):
    role_id: int
    role_name: str
    description: str | None


class Judge(BaseModel):
    judge_id: int
    judge_name: str
    designation: str | None
    court_id: int
    court_name: str | None


@router.get("/roles", response_model=list[Role])
def list_roles(profile: dict = Depends(get_current_profile)):
    return supabase.table("roles").select("*").order("role_id").execute().data


@router.get("/case-types", response_model=list[CaseType])
def list_case_types(profile: dict = Depends(get_current_profile)):
    return supabase.table("case_types").select("*").order("case_type_name").execute().data


@router.get("/courts", response_model=list[Court])
def list_courts(profile: dict = Depends(get_current_profile)):
    return supabase.table("courts").select("*").order("court_name").execute().data


@router.get("/judges", response_model=list[Judge])
def list_judges(profile: dict = Depends(get_current_profile)):
    rows = supabase.table("judges").select("judge_id,judge_name,designation,court_id,courts(court_name)").order("judge_name").execute().data
    return [
        {
            "judge_id": row["judge_id"],
            "judge_name": row["judge_name"],
            "designation": row["designation"],
            "court_id": row["court_id"],
            "court_name": row["courts"]["court_name"] if row.get("courts") else None,
        }
        for row in rows
    ]
