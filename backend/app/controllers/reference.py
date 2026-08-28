from fastapi import Depends
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_profile


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


def list_roles(profile: dict = Depends(get_current_profile)):
    return supabase.table("roles").select("*").order("role_id").execute().data


def list_case_types(profile: dict = Depends(get_current_profile)):
    return supabase.table("case_types").select("*").order("case_type_name").execute().data


def list_courts(profile: dict = Depends(get_current_profile)):
    return supabase.table("courts").select("*").order("court_name").execute().data


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
