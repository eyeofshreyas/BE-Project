from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_profile
from app.models.reference import CaseType, Court, Role, Judge, DocumentType


def list_roles(profile: dict = Depends(get_current_profile)):
    return supabase.table("roles").select("*").order("role_id").execute().data


def list_case_types(profile: dict = Depends(get_current_profile)):
    return supabase.table("case_types").select("*").order("case_type_name").execute().data


def list_courts(profile: dict = Depends(get_current_profile)):
    return supabase.table("courts").select("*").order("court_name").execute().data


def list_document_types(profile: dict = Depends(get_current_profile)):
    return supabase.table("document_types").select("*").order("type_name").execute().data


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
