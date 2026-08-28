from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_profile, get_scoped_case_ids
from app.models.cases import CaseSummary

CASES_SELECT = (
    "case_id,case_number,case_title,status,priority,next_hearing_date,"
    "clients(users(full_name)),"
    "courts(court_name),"
    "case_lawyers(assigned_role,is_active,lawyers(users(full_name)))"
)


def _active_lawyer_name(case_lawyers: list[dict]) -> str | None:
    for cl in case_lawyers:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl["lawyers"]["users"]["full_name"]
    return None


def list_cases(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("cases").select(CASES_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("case_id").execute().data
    return [
        {
            "id": row["case_number"],
            "client": row["clients"]["users"]["full_name"] if row["clients"] else None,
            "lawyer": _active_lawyer_name(row["case_lawyers"]),
            "court": row["courts"]["court_name"] if row["courts"] else None,
            "status": row["status"],
            "hearing": row["next_hearing_date"],
            "priority": row["priority"],
        }
        for row in rows
    ]
