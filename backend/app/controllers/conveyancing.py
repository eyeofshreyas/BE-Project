"""Controllers for conveyancing (property transaction) matters: dashboard summary, matter
detail, due-diligence updates, and registration progress."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access
from app.models.conveyancing import Stats, StatusCount, MatterSummary, ConveyancingSummary, Property, DueDiligence, DueDiligenceUpdate, ProgressStage, PropertyRegistration, MatterDocument, MatterDetail

MATTERS_SELECT = (
    "matter_id,matter_number,matter_type,transaction_type,registration_status,completion_percentage,case_id,"
    "conveyancing_parties(party_name,role),"
    "properties(property_name,address,city),"
    "property_registrations(registration_date),"
    "cases(case_lawyers(lawyer_id,is_active,lawyers(users(full_name))))"
)


def _registration_date(row: dict) -> str | None:
    """Extract the registration_date from a matter row's joined property_registrations."""
    regs = row.get("property_registrations")
    if not regs:
        return None
    reg = regs[0] if isinstance(regs, list) else regs
    return reg.get("registration_date")


def _active_matter_lawyer(case_lawyers: list[dict]) -> str | None:
    """Return the active assigned lawyer's full name from a matter's joined case_lawyers, or None."""
    for cl in case_lawyers or []:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl["lawyers"]["users"]["full_name"]
    return None

COMPLETED_STATUSES = {"Completed", "Registered"}
PENDING_STATUSES = {"Pending", "Registration Scheduled"}


def conveyancing_summary(profile: dict = Depends(get_current_profile)):
    """Build the conveyancing dashboard: stats, status breakdown, and up to 500 recent matters,
    all scoped to the caller. Calls: `get_scoped_case_ids()`, `_active_matter_lawyer()`,
    `_registration_date()`."""
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
                "matter_id": r["matter_id"],
                "case_id": r.get("case_id"),
                "number": r["matter_number"],
                "title": f"{r['transaction_type']} of {r['properties']['property_name']}" if r.get("properties") else f"{r['transaction_type']} matter",
                "client": r["conveyancing_parties"][0]["party_name"] if r["conveyancing_parties"] else None,
                "type": r["matter_type"],
                "property": f"{r['properties']['address']}, {r['properties']['city']}" if r.get("properties") else None,
                "lawyer": _active_matter_lawyer(r["cases"]["case_lawyers"] if r.get("cases") else []),
                "reg_date": _registration_date(r),
                "status": r["registration_status"],
            }
            for r in rows[:500]
        ],
    }


def get_matter_detail(matter_id: int, profile: dict = Depends(get_current_profile)):
    """Fetch a matter's full detail: property, due diligence, progress stages, registration,
    and documents. 404 if missing, 403 if outside the caller's scope. Calls: `get_scoped_case_ids()`."""
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
    """Resolve matter_id to its owning case_id and defer to `ensure_case_access()` -- matters
    aren't scoped directly, same pattern as documents/hearings/meetings. 404 if matter missing."""
    matter_rows = supabase.table("conveyancing_matters").select("case_id").eq("matter_id", matter_id).execute().data
    if not matter_rows:
        raise HTTPException(status_code=404, detail="Matter not found")
    ensure_case_access(matter_rows[0]["case_id"], profile)


def update_due_diligence(matter_id: int, data: DueDiligenceUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Update a matter's due-diligence checklist fields. Calls: `_ensure_matter_access()`."""
    _ensure_matter_access(matter_id, profile)

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    rows = supabase.table("due_diligence").select("diligence_id").eq("matter_id", matter_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="No due diligence record for this matter")

    supabase.table("due_diligence").update(updates).eq("matter_id", matter_id).execute()
    result = supabase.table("due_diligence").select("*,lawyers(users(full_name))").eq("matter_id", matter_id).execute().data[0]
    lawyer = result.get("lawyers")
    return {**result, "lawyer_name": lawyer["users"]["full_name"] if lawyer else None}


def complete_progress_stage(matter_id: int, progress_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Mark one registration-progress stage complete and recompute the matter's
    completion_percentage from all stages. Calls: `_ensure_matter_access()`."""
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
