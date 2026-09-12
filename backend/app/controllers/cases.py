"""Controllers for cases: list (scoped), create, and unassign-lawyer."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, get_current_profile, get_scoped_case_ids, require_roles
from app.models.cases import CaseCreate, CaseSummary

CASES_SELECT = (
    "case_id,case_number,case_title,filing_date,created_at,status,priority,next_hearing_date,description,"
    "client_id,"
    "clients(users(full_name,email,phone)),"
    "courts(court_name),"
    "case_types(case_type_name),"
    "case_lawyers(lawyer_id,assigned_role,is_active,lawyers(users(full_name,email,phone)))"
)


def _active_case_lawyer(case_lawyers: list[dict]) -> dict | None:
    """Return the first case_lawyers entry with is_active=True and a joined lawyer, or None."""
    for cl in case_lawyers:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl
    return None


def _to_case_summary(row: dict) -> dict:
    """Shape a raw `cases` row (joined with clients/courts/case_types/case_lawyers) into
    the CaseSummary dict. Calls: `_active_case_lawyer()`."""
    active_lawyer = _active_case_lawyer(row["case_lawyers"])
    return {
        "id": row["case_number"],
        "case_id": row["case_id"],
        "case_title": row["case_title"],
        "filing_date": row["filing_date"],
        "created_at": row["created_at"],
        "client": row["clients"]["users"]["full_name"] if row["clients"] else None,
        "client_id": row["client_id"],
        "client_email": row["clients"]["users"]["email"] if row["clients"] else None,
        "client_phone": row["clients"]["users"]["phone"] if row["clients"] else None,
        "lawyer": active_lawyer["lawyers"]["users"]["full_name"] if active_lawyer else None,
        "lawyer_id": active_lawyer["lawyer_id"] if active_lawyer else None,
        "lawyer_email": active_lawyer["lawyers"]["users"]["email"] if active_lawyer else None,
        "lawyer_phone": active_lawyer["lawyers"]["users"]["phone"] if active_lawyer else None,
        "court": row["courts"]["court_name"] if row["courts"] else None,
        "case_type": row["case_types"]["case_type_name"] if row.get("case_types") else None,
        "status": row["status"],
        "hearing": row["next_hearing_date"],
        "priority": row["priority"],
        "description": row.get("description"),
    }


def list_cases(profile: dict = Depends(get_current_profile)):
    """List cases visible to the caller. Calls: `get_scoped_case_ids()`, `_to_case_summary()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("cases").select(CASES_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("case_id").execute().data
    return [_to_case_summary(row) for row in rows]


def _generate_case_number(case_type_name: str) -> str:
    """Build a case number like "CIV2026001" from the case type's letters + year + sequence.
    Counting rows breaks as soon as one number in the run is missing (deleted case, seed data
    that starts at 003), so take the highest number in use for the prefix instead -- a count
    would hand back a case_number that already exists and the insert would fail.
    ponytail: read-then-insert, fine at this app's scale; move to a DB sequence if
    concurrent creates ever race for the same number."""
    prefix = "".join(ch for ch in case_type_name.upper() if ch.isalpha())[:3] or "GEN"
    like_prefix = f"{prefix}{datetime.now(timezone.utc).year}"
    existing = supabase.table("cases").select("case_number").like("case_number", f"{like_prefix}%").execute().data
    used = [int(r["case_number"][len(like_prefix):]) for r in existing if r["case_number"][len(like_prefix):].isdigit()]
    return f"{like_prefix}{max(used, default=0) + 1:03d}"


def create_case(data: CaseCreate, profile: dict = Depends(require_roles(LAWYER))):
    """Create a case for a client who has accepted this lawyer's client_requests invite,
    assign the lawyer as Primary, and optionally seed a case note. Calls:
    `_generate_case_number()`, `_to_case_summary()`."""
    lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
    if not lawyer_rows:
        raise HTTPException(status_code=400, detail="No lawyer profile for this account")

    # ponytail: mirrors respond_client_request's consent gate -- a lawyer may
    # only open a case for a client who accepted their client_requests invite.
    accepted_request = supabase.table("client_requests").select("request_id") \
        .eq("lawyer_id", lawyer_rows[0]["lawyer_id"]).eq("client_id", data.client_id).eq("status", "accepted") \
        .execute().data
    if not accepted_request:
        raise HTTPException(status_code=403, detail="You don't have an accepted client relationship with this client")

    case_type_rows = supabase.table("case_types").select("case_type_name").eq("case_type_id", data.case_type_id).execute().data
    if not case_type_rows:
        raise HTTPException(status_code=400, detail="Unknown case type")

    case_row = supabase.table("cases").insert({
        "case_number": _generate_case_number(case_type_rows[0]["case_type_name"]),
        "case_title": data.case_title,
        "client_id": data.client_id,
        "court_id": data.court_id,
        "case_type_id": data.case_type_id,
        "status": "Open",
        "priority": data.priority,
        "next_hearing_date": data.next_hearing_date,
        "description": data.description,
    }).execute().data[0]

    supabase.table("case_lawyers").insert({
        "case_id": case_row["case_id"],
        "lawyer_id": lawyer_rows[0]["lawyer_id"],
        "assigned_role": "Primary",
        "is_active": True,
    }).execute()

    if data.description:
        supabase.table("case_notes").insert({
            "case_id": case_row["case_id"],
            "lawyer_id": lawyer_rows[0]["lawyer_id"],
            "note": data.description,
        }).execute()

    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_row["case_id"]).execute().data[0]
    return _to_case_summary(row)


def unassign_lawyer(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Deactivates the case's active case_lawyers row. A lawyer may only step
    down from a case they're actively assigned to (enforced by
    ensure_case_access); an admin can unassign any case's lawyer."""
    ensure_case_access(case_id, profile)
    supabase.table("case_lawyers").update({"is_active": False}).eq("case_id", case_id).eq("is_active", True).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)
