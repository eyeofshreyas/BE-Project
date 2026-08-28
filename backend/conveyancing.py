from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase_client import supabase
from auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access

router = APIRouter(prefix="/conveyancing", tags=["conveyancing"])

MATTERS_SELECT = (
    "matter_id,matter_number,matter_type,registration_status,completion_percentage,case_id,"
    "conveyancing_parties(party_name,role)"
)

COMPLETED_STATUSES = {"Completed", "Registered"}
PENDING_STATUSES = {"Pending", "Registration Scheduled"}


class Stats(BaseModel):
    active_matters: int
    pending_registrations: int
    completed_registrations: int
    upcoming_appointments: int


class StatusCount(BaseModel):
    label: str
    count: int


class MatterSummary(BaseModel):
    number: str
    client: str | None
    type: str
    status: str


class ConveyancingSummary(BaseModel):
    stats: Stats
    status_breakdown: list[StatusCount]
    recent_matters: list[MatterSummary]


@router.get("/summary", response_model=ConveyancingSummary)
def conveyancing_summary(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        rows = []
    else:
        query = supabase.table("conveyancing_matters").select(MATTERS_SELECT)
        if case_ids is not None:
            query = query.in_("case_id", list(case_ids))
        rows = query.order("matter_id", desc=True).execute().data

    completed = sum(1 for r in rows if r["registration_status"] in COMPLETED_STATUSES)
    pending = sum(1 for r in rows if r["registration_status"] in PENDING_STATUSES)
    active = len(rows) - completed

    status_counts: dict[str, int] = {}
    for r in rows:
        status_counts[r["registration_status"]] = status_counts.get(r["registration_status"], 0) + 1

    case_ids = [r["case_id"] for r in rows if r.get("case_id") is not None]
    upcoming_appointments = 0
    if case_ids:
        now_iso = datetime.now(timezone.utc).isoformat()
        upcoming_appointments = len(
            supabase.table("meetings")
            .select("meeting_id")
            .in_("case_id", case_ids)
            .gte("meeting_date", now_iso)
            .execute()
            .data
        )

    return {
        "stats": {
            "active_matters": active,
            "pending_registrations": pending,
            "completed_registrations": completed,
            "upcoming_appointments": upcoming_appointments,
        },
        "status_breakdown": [{"label": k, "count": v} for k, v in status_counts.items()],
        "recent_matters": [
            {
                "number": r["matter_number"],
                "client": r["conveyancing_parties"][0]["party_name"] if r["conveyancing_parties"] else None,
                "type": r["matter_type"],
                "status": r["registration_status"],
            }
            for r in rows[:10]
        ],
    }


class Property(BaseModel):
    property_id: int
    property_name: str
    address: str
    city: str | None
    state: str | None
    property_type: str | None
    survey_number: str | None
    market_value: float | None
    land_area: float | None
    builtup_area: float | None


class DueDiligence(BaseModel):
    diligence_id: int
    title_clear: bool | None
    tax_verified: bool | None
    encumbrance_checked: bool | None
    litigation_checked: bool | None
    lawyer_name: str | None
    remarks: str | None
    completed_at: str | None


class DueDiligenceUpdate(BaseModel):
    title_clear: bool | None = None
    tax_verified: bool | None = None
    encumbrance_checked: bool | None = None
    litigation_checked: bool | None = None
    remarks: str | None = None


class ProgressStage(BaseModel):
    progress_id: int
    stage_name: str
    stage_order: int
    completed: bool
    completed_at: str | None
    remarks: str | None


class PropertyRegistration(BaseModel):
    registration_id: int
    office_name: str | None
    registration_number: str | None
    registration_date: str | None
    deed_number: str | None
    registration_status: str | None
    registered_by: str | None
    remarks: str | None


class MatterDocument(BaseModel):
    matter_document_id: int
    document_id: int
    file_name: str | None
    is_required: bool
    is_verified: bool
    verified_by: str | None


class MatterDetail(BaseModel):
    matter_id: int
    matter_number: str
    matter_type: str | None
    transaction_type: str | None
    registration_status: str | None
    completion_percentage: int
    expected_completion_date: str | None
    property: Property | None
    due_diligence: DueDiligence | None
    progress: list[ProgressStage]
    registration: PropertyRegistration | None
    documents: list[MatterDocument]


@router.get("/matters/{matter_id}", response_model=MatterDetail)
def get_matter_detail(matter_id: int, profile: dict = Depends(get_current_profile)):
    matter_rows = supabase.table("conveyancing_matters").select("*").eq("matter_id", matter_id).execute().data
    if not matter_rows:
        raise HTTPException(status_code=404, detail="Matter not found")
    matter = matter_rows[0]

    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and matter.get("case_id") not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this matter")

    property_rows = supabase.table("properties").select("*").eq("property_id", matter["property_id"]).execute().data
    property_ = property_rows[0] if property_rows else None

    dd_rows = supabase.table("due_diligence").select("*,lawyers(users(full_name))").eq("matter_id", matter_id).execute().data
    due_diligence = None
    if dd_rows:
        dd = dd_rows[0]
        lawyer = dd.get("lawyers")
        due_diligence = {**dd, "lawyer_name": lawyer["users"]["full_name"] if lawyer else None}

    progress = supabase.table("registration_progress").select("*").eq("matter_id", matter_id).order("stage_order").execute().data

    reg_rows = supabase.table("property_registrations").select("*,lawyers(users(full_name))").eq("matter_id", matter_id).execute().data
    registration = None
    if reg_rows:
        reg = reg_rows[0]
        lawyer = reg.get("lawyers")
        registration = {**reg, "registered_by": lawyer["users"]["full_name"] if lawyer else None}

    doc_rows = supabase.table("matter_documents").select("*,documents(file_name),lawyers(users(full_name))").eq("matter_id", matter_id).execute().data
    documents = [
        {
            "matter_document_id": d["matter_document_id"],
            "document_id": d["document_id"],
            "file_name": d["documents"]["file_name"] if d.get("documents") else None,
            "is_required": d["is_required"],
            "is_verified": d["is_verified"],
            "verified_by": d["lawyers"]["users"]["full_name"] if d.get("lawyers") else None,
        }
        for d in doc_rows
    ]

    return {
        "matter_id": matter["matter_id"],
        "matter_number": matter["matter_number"],
        "matter_type": matter["matter_type"],
        "transaction_type": matter["transaction_type"],
        "registration_status": matter["registration_status"],
        "completion_percentage": matter["completion_percentage"],
        "expected_completion_date": matter["expected_completion_date"],
        "property": property_,
        "due_diligence": due_diligence,
        "progress": progress,
        "registration": registration,
        "documents": documents,
    }


def _ensure_matter_access(matter_id: int, profile: dict) -> None:
    matter_rows = supabase.table("conveyancing_matters").select("case_id").eq("matter_id", matter_id).execute().data
    if not matter_rows:
        raise HTTPException(status_code=404, detail="Matter not found")
    ensure_case_access(matter_rows[0]["case_id"], profile)


@router.patch("/matters/{matter_id}/due-diligence", response_model=DueDiligence)
def update_due_diligence(matter_id: int, data: DueDiligenceUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    _ensure_matter_access(matter_id, profile)

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    rows = supabase.table("due_diligence").select("diligence_id").eq("matter_id", matter_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="No due diligence record for this matter")

    supabase.table("due_diligence").update(updates).eq("matter_id", matter_id).execute()
    result = supabase.table("due_diligence").select("*,lawyers(users(full_name))").eq("matter_id", matter_id).execute().data[0]
    lawyer = result.get("lawyers")
    return {**result, "lawyer_name": lawyer["users"]["full_name"] if lawyer else None}


@router.patch("/matters/{matter_id}/progress/{progress_id}", response_model=ProgressStage)
def complete_progress_stage(matter_id: int, progress_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    _ensure_matter_access(matter_id, profile)

    rows = supabase.table("registration_progress").update({
        "completed": True,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("progress_id", progress_id).eq("matter_id", matter_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Progress stage not found")

    all_stages = supabase.table("registration_progress").select("completed").eq("matter_id", matter_id).execute().data
    pct = round(100 * sum(1 for s in all_stages if s["completed"]) / len(all_stages))
    supabase.table("conveyancing_matters").update({"completion_percentage": pct}).eq("matter_id", matter_id).execute()

    return rows[0]
