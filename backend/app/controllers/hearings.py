from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access
from app.models.hearings import HearingSummary, HearingCreate, HearingUpdate

HEARINGS_SELECT = (
    "hearing_id,case_id,hearing_date,hearing_time,courtroom,hearing_status,hearing_outcome,next_hearing_date,notes,"
    "cases(case_number,case_title,priority,clients(users(full_name))),judges(judge_name,courts(court_name))"
)


def _to_hearing_summary(row: dict) -> dict:
    case = row.get("cases")
    judge = row.get("judges")
    return {
        "id": row["hearing_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
        "case_title": case["case_title"] if case else None,
        "client": case["clients"]["users"]["full_name"] if case and case.get("clients") else None,
        "priority": case["priority"] if case else None,
        "judge_name": judge["judge_name"] if judge else None,
        "court_name": judge["courts"]["court_name"] if judge and judge.get("courts") else None,
        "hearing_date": row["hearing_date"],
        "hearing_time": row["hearing_time"],
        "courtroom": row["courtroom"],
        "hearing_status": row["hearing_status"],
        "hearing_outcome": row["hearing_outcome"],
        "next_hearing_date": row["next_hearing_date"],
        "notes": row["notes"],
    }


# shared fetch+scope-check used by get_hearing, update_hearing, and
# create_hearing's return path -- keeps the 404/403 logic in one place.
def _get_hearing(hearing_id: int, case_ids: set[int] | None = None) -> dict:
    rows = supabase.table("hearings").select(HEARINGS_SELECT).eq("hearing_id", hearing_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Hearing not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this hearing")
    return _to_hearing_summary(rows[0])


def list_hearings(case_id: int | None = None, profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("hearings").select(HEARINGS_SELECT)
    if case_id is not None:
        query = query.eq("case_id", case_id)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("hearing_date", desc=True).execute().data
    return [_to_hearing_summary(row) for row in rows]


def get_hearing(hearing_id: int, profile: dict = Depends(get_current_profile)):
    return _get_hearing(hearing_id, get_scoped_case_ids(profile))


def create_hearing(data: HearingCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    ensure_case_access(data.case_id, profile)
    row = supabase.table("hearings").insert({
        "case_id": data.case_id,
        "judge_id": data.judge_id,
        "hearing_date": data.hearing_date,
        "hearing_time": data.hearing_time,
        "courtroom": data.courtroom,
        "notes": data.notes,
        "hearing_status": "Scheduled",
    }).execute().data[0]
    supabase.table("cases").update({"next_hearing_date": data.hearing_date}).eq("case_id", data.case_id).execute()
    return _get_hearing(row["hearing_id"])


def update_hearing(hearing_id: int, data: HearingUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    _get_hearing(hearing_id, get_scoped_case_ids(profile))

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return _get_hearing(hearing_id)

    rows = supabase.table("hearings").update(updates).eq("hearing_id", hearing_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Hearing not found")

    if data.next_hearing_date is not None:
        supabase.table("cases").update({"next_hearing_date": data.next_hearing_date}).eq("case_id", rows[0]["case_id"]).execute()

    return _get_hearing(hearing_id)
