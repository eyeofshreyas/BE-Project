from fastapi import APIRouter
from pydantic import BaseModel
from supabase_client import supabase

router = APIRouter(tags=["cases"])

CASES_SELECT = (
    "case_id,case_number,case_title,status,priority,next_hearing_date,"
    "clients(users(full_name)),"
    "courts(court_name),"
    "case_lawyers(assigned_role,is_active,lawyers(users(full_name)))"
)


class CaseSummary(BaseModel):
    id: str
    client: str | None
    lawyer: str | None
    court: str | None
    status: str
    hearing: str | None
    priority: str


def _active_lawyer_name(case_lawyers: list[dict]) -> str | None:
    for cl in case_lawyers:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl["lawyers"]["users"]["full_name"]
    return None


@router.get("/cases", response_model=list[CaseSummary])
def list_cases():
    rows = supabase.table("cases").select(CASES_SELECT).order("case_id").execute().data
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
