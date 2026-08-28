from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase_client import supabase
from auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access

router = APIRouter(prefix="/hearings", tags=["hearings"])

HEARINGS_SELECT = (
    "hearing_id,case_id,hearing_date,hearing_time,courtroom,hearing_status,hearing_outcome,next_hearing_date,notes,"
    "cases(case_number),judges(judge_name,courts(court_name))"
)


class HearingSummary(BaseModel):
    id: int
    case_id: int
    case_number: str | None
    judge_name: str | None
    court_name: str | None
    hearing_date: str
    hearing_time: str | None
    courtroom: str | None
    hearing_status: str
    hearing_outcome: str | None
    next_hearing_date: str | None
    notes: str | None


class HearingCreate(BaseModel):
    case_id: int
    judge_id: int
    hearing_date: str
    hearing_time: str | None = None
    courtroom: str | None = None
    notes: str | None = None


class HearingUpdate(BaseModel):
    hearing_status: str | None = None
    hearing_outcome: str | None = None
    next_hearing_date: str | None = None
    notes: str | None = None


def _to_hearing_summary(row: dict) -> dict:
    case = row.get("cases")
    judge = row.get("judges")
    return {
        "id": row["hearing_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
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


def _get_hearing(hearing_id: int, case_ids: set[int] | None = None) -> dict:
    rows = supabase.table("hearings").select(HEARINGS_SELECT).eq("hearing_id", hearing_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Hearing not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this hearing")
    return _to_hearing_summary(rows[0])


@router.get("", response_model=list[HearingSummary])
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


@router.get("/{hearing_id}", response_model=HearingSummary)
def get_hearing(hearing_id: int, profile: dict = Depends(get_current_profile)):
    return _get_hearing(hearing_id, get_scoped_case_ids(profile))


@router.post("", response_model=HearingSummary)
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


@router.patch("/{hearing_id}", response_model=HearingSummary)
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
