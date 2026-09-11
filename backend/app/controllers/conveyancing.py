"""Controllers for conveyancing (property transaction) matters: dashboard summary, matter
detail, due-diligence updates, registration progress, and shared-document uploads."""

import uuid
from datetime import datetime, timezone

from fastapi import Depends, File, HTTPException, UploadFile
from app.db.supabase_client import supabase
from app.controllers.documents import DOCUMENTS_BUCKET
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access
from app.models.conveyancing import Stats, StatusCount, MatterSummary, ConveyancingSummary, Property, DueDiligence, DueDiligenceUpdate, ProgressStage, PropertyRegistration, MatterDocument, MatterDetail, MatterCreate, MatterUpdate

MATTERS_SELECT = (
    "matter_id,matter_number,matter_type,transaction_type,registration_status,completion_percentage,case_id,created_at,"
    "conveyancing_parties(party_name,role),"
    "properties(property_name,address,city),"
    "property_registrations(registration_date),"
    "cases(priority,case_lawyers(lawyer_id,is_active,lawyers(users(full_name))))"
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

# The registration pipeline every matter runs through -- seeded on create so the
# progress stepper and completion_percentage have something to work with.
REGISTRATION_STAGES = ["Due Diligence", "Stamp Duty Payment", "Deed Execution", "Registration"]

COMPLETED_STATUSES = {"Completed", "Registered"}
PENDING_STATUSES = {"Pending", "Registration Scheduled", "Documents Pending"}


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
                "priority": r["cases"]["priority"] if r.get("cases") else None,
                "created_at": r.get("created_at"),
            }
            for r in rows[:500]
        ],
    }


def _suffix(value: str, prefix: str) -> int | None:
    """Numeric tail of `value` after `prefix`, or None if it isn't one of our generated numbers."""
    tail = value[len(prefix):] if value.startswith(prefix) else ""
    return int(tail) if tail.isdigit() else None


def _next_matter_seq(year: int) -> int:
    """Next free sequence for this year's MAT-<year>-NNN / PROP<year>NNN pair. Counting rows
    drifts out of sync with the numbers actually in use (seed data jumps to MAT-2026-106 with
    far fewer rows), which collided with `cases.case_number`'s unique index, so take the
    highest number in use across both tables instead.
    # ponytail: read-then-insert, fine at this app's traffic; move to a DB sequence if
    # concurrent creates ever race for the same number."""
    matters = supabase.table("conveyancing_matters").select("matter_number").execute().data
    cases = supabase.table("cases").select("case_number").execute().data
    used = [_suffix(m["matter_number"], f"MAT-{year}-") for m in matters]
    used += [_suffix(c["case_number"], f"PROP{year}") for c in cases]
    return max([n for n in used if n is not None], default=0) + 1


def create_matter(data: MatterCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Create a conveyancing matter: `conveyancing_matters.case_id`/`properties.address` are
    NOT NULL, so this opens a lightweight `cases` row first (case_type 'Property', the first
    available court, the picked client, the form's priority) the same way `create_case()` does,
    assigns the creator as the case's lawyer if they are one (so it shows as Responsible Lawyer
    on the dashboard), then inserts the property and matter, and finally a `conveyancing_parties`
    row linking the client in as the Client."""
    case_type_rows = supabase.table("case_types").select("case_type_id").eq("case_type_name", "Property").execute().data
    court_rows = supabase.table("courts").select("court_id").limit(1).execute().data
    if not case_type_rows or not court_rows:
        raise HTTPException(status_code=500, detail="Missing reference data: a 'Property' case type and at least one court are required.")

    year = datetime.now(timezone.utc).year
    seq = _next_matter_seq(year)
    matter_number = f"MAT-{year}-{seq:03d}"

    case_row = supabase.table("cases").insert({
        "case_number": f"PROP{year}{seq:03d}",
        "case_title": data.matter_name,
        "client_id": data.client_id,
        "court_id": court_rows[0]["court_id"],
        "case_type_id": case_type_rows[0]["case_type_id"],
        "status": "Open",
        "priority": data.priority,
    }).execute().data[0]

    lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
    if lawyer_rows:
        supabase.table("case_lawyers").insert({
            "case_id": case_row["case_id"],
            "lawyer_id": lawyer_rows[0]["lawyer_id"],
            "assigned_role": "Primary",
            "is_active": True,
        }).execute()

    property_row = supabase.table("properties").insert({
        "property_name": data.matter_name,
        "address": data.property_address or "TBD",
        "property_type": data.property_type,
        "survey_number": data.title_number,
        "market_value": data.sale_value,
    }).execute().data[0]

    matter_row = supabase.table("conveyancing_matters").insert({
        "case_id": case_row["case_id"],
        "property_id": property_row["property_id"],
        "matter_number": matter_number,
        "matter_type": data.matter_type,
        "transaction_type": data.matter_type,
        "registration_status": "Pending",
        "completion_percentage": 0,
        "expected_completion_date": data.target_settlement_date,
    }).execute().data[0]

    supabase.table("registration_progress").insert([
        {"matter_id": matter_row["matter_id"], "stage_name": name, "stage_order": i + 1, "completed": False}
        for i, name in enumerate(REGISTRATION_STAGES)
    ]).execute()
    supabase.table("due_diligence").insert({
        "matter_id": matter_row["matter_id"],
        "lawyer_id": lawyer_rows[0]["lawyer_id"] if lawyer_rows else None,
    }).execute()

    client_rows = supabase.table("clients").select("users(full_name)").eq("client_id", data.client_id).execute().data
    if client_rows:
        supabase.table("conveyancing_parties").insert({
            "matter_id": matter_row["matter_id"],
            "party_name": client_rows[0]["users"]["full_name"],
            "role": "Client",
        }).execute()

    return {"matter_id": matter_row["matter_id"], "matter_number": matter_number}


def update_matter(matter_id: int, data: MatterUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Edit a matter's registration status and/or its scheduled registration (date + office),
    upserting the `property_registrations` row since a matter may not have one yet. Backs both
    the dashboard's row Edit action and the Schedule Registration quick action.
    Calls: `_ensure_matter_access()`, `_registration_date()`."""
    _ensure_matter_access(matter_id, profile)

    if data.registration_status:
        supabase.table("conveyancing_matters").update(
            {"registration_status": data.registration_status}
        ).eq("matter_id", matter_id).execute()

    reg = {k: v for k, v in data.model_dump().items() if v is not None}
    if reg:
        existing = supabase.table("property_registrations").select("registration_id").eq("matter_id", matter_id).execute().data
        if existing:
            supabase.table("property_registrations").update(reg).eq("matter_id", matter_id).execute()
        else:
            supabase.table("property_registrations").insert({"matter_id": matter_id, **reg}).execute()

    row = supabase.table("conveyancing_matters").select(
        "matter_id,registration_status,property_registrations(registration_date)"
    ).eq("matter_id", matter_id).execute().data[0]
    return {
        "matter_id": row["matter_id"],
        "registration_status": row["registration_status"],
        "registration_date": _registration_date(row),
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

    doc_rows = supabase.table("matter_documents").select("*,documents(file_name,mime_type),lawyers(users(full_name))").eq("matter_id", matter_id).execute().data
    documents = [
        {
            "matter_document_id": d["matter_document_id"],
            "document_id": d["document_id"],
            "file_name": d["documents"]["file_name"] if d.get("documents") else None,
            "mime_type": d["documents"]["mime_type"] if d.get("documents") else None,
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
        "created_at": matter.get("created_at"),
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


def upload_matter_document(
    matter_id: int,
    file: UploadFile = File(...),
    profile: dict = Depends(get_current_profile),
):
    """Upload a file to Supabase Storage and attach it to a matter's Shared Documents list:
    a `documents` row under the matter's case (client or lawyer -- same access rule as case
    document uploads, see documents.upload_document) defaulting to the 'Contract' document
    type since matter uploads have no type picker, plus a `matter_documents` link row.
    Calls: `_ensure_matter_access()`."""
    _ensure_matter_access(matter_id, profile)
    case_id = supabase.table("conveyancing_matters").select("case_id").eq("matter_id", matter_id).execute().data[0]["case_id"]

    content = file.file.read()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    storage_path = f"case-{case_id}/{uuid.uuid4().hex}.{ext}"
    supabase.storage.from_(DOCUMENTS_BUCKET).upload(
        storage_path, content, {"content-type": file.content_type or "application/octet-stream"}
    )

    doc_type_rows = supabase.table("document_types").select("document_type_id").eq("type_name", "Contract").execute().data
    doc_row = supabase.table("documents").insert({
        "case_id": case_id,
        "document_type_id": doc_type_rows[0]["document_type_id"] if doc_type_rows else None,
        "uploaded_by": profile["user_id"],
        "file_name": file.filename or storage_path,
        "file_path": storage_path,
        "file_size": len(content),
        "mime_type": file.content_type,
    }).execute().data[0]

    link_row = supabase.table("matter_documents").insert({
        "matter_id": matter_id,
        "document_id": doc_row["document_id"],
        "is_required": False,
        "is_verified": False,
    }).execute().data[0]

    return {
        "matter_document_id": link_row["matter_document_id"],
        "document_id": doc_row["document_id"],
        "file_name": doc_row["file_name"],
        "mime_type": doc_row["mime_type"],
        "is_required": link_row["is_required"],
        "is_verified": link_row["is_verified"],
        "verified_by": None,
    }


def update_due_diligence(matter_id: int, data: DueDiligenceUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Update a matter's due-diligence checklist fields. Calls: `_ensure_matter_access()`."""
    _ensure_matter_access(matter_id, profile)

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    # Matters seeded before create_matter() opened a due_diligence row have none,
    # so insert on first update rather than 404ing the checklist forever.
    if supabase.table("due_diligence").select("diligence_id").eq("matter_id", matter_id).execute().data:
        supabase.table("due_diligence").update(updates).eq("matter_id", matter_id).execute()
    else:
        supabase.table("due_diligence").insert({"matter_id": matter_id, **updates}).execute()
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
