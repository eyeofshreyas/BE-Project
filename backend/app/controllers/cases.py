from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, get_current_profile, get_scoped_case_ids, require_roles
from app.models.cases import CaseSummary

CASES_SELECT = (
    "case_id,case_number,case_title,status,priority,next_hearing_date,"
    "clients(users(full_name)),"
    "courts(court_name),"
    "case_lawyers(lawyer_id,assigned_role,is_active,lawyers(users(full_name)))"
)


def _active_case_lawyer(case_lawyers: list[dict]) -> dict | None:
    for cl in case_lawyers:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl
    return None


def _to_case_summary(row: dict) -> dict:
    active_lawyer = _active_case_lawyer(row["case_lawyers"])
    return {
        "id": row["case_number"],
        "case_id": row["case_id"],
        "client": row["clients"]["users"]["full_name"] if row["clients"] else None,
        "lawyer": active_lawyer["lawyers"]["users"]["full_name"] if active_lawyer else None,
        "lawyer_id": active_lawyer["lawyer_id"] if active_lawyer else None,
        "court": row["courts"]["court_name"] if row["courts"] else None,
        "status": row["status"],
        "hearing": row["next_hearing_date"],
        "priority": row["priority"],
    }


def list_cases(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("cases").select(CASES_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("case_id").execute().data
    return [_to_case_summary(row) for row in rows]


def unassign_lawyer(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Deactivates the case's active case_lawyers row. A lawyer may only step
    down from a case they're actively assigned to (enforced by
    ensure_case_access); an admin can unassign any case's lawyer."""
    ensure_case_access(case_id, profile)
    supabase.table("case_lawyers").update({"is_active": False}).eq("case_id", case_id).eq("is_active", True).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)
