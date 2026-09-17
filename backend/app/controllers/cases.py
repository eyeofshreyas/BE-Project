"""Controllers for cases: list (scoped), create, and case-team management (add/remove/list-available lawyers)."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, SUPER_ADMIN, ensure_case_access, get_current_profile, get_scoped_case_ids, require_roles
from app.models.cases import AddLawyerRequest, CaseCreate, CaseSummary

CASES_SELECT = (
    "case_id,case_number,case_title,filing_date,created_at,status,priority,next_hearing_date,description,"
    "cnr_number,ecourts_status,ecourts_last_synced_at,"
    "client_id,org_id,"
    "clients(users(full_name,email,phone)),"
    "courts(court_name),"
    "case_types(case_type_name),"
    "case_lawyers(lawyer_id,assigned_role,is_active,lawyers(users(full_name,email,phone)))"
)


def _primary_case_lawyer(case_lawyers: list[dict]) -> dict | None:
    """Return the case_lawyers entry with assigned_role="Primary" and is_active=True, or None."""
    for cl in case_lawyers:
        if cl.get("is_active") and cl.get("assigned_role") == "Primary" and cl.get("lawyers"):
            return cl
    return None


def _active_case_lawyers(case_lawyers: list[dict]) -> list[dict]:
    """Every active case_lawyers row with a joined lawyer, Primary first."""
    active = [cl for cl in case_lawyers if cl.get("is_active") and cl.get("lawyers")]
    return sorted(active, key=lambda cl: cl.get("assigned_role") != "Primary")


def _to_case_summary(row: dict) -> dict:
    """Shape a raw `cases` row (joined with clients/courts/case_types/case_lawyers) into
    the CaseSummary dict. Calls: `_primary_case_lawyer()`, `_active_case_lawyers()`."""
    primary = _primary_case_lawyer(row["case_lawyers"])
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
        "lawyer": primary["lawyers"]["users"]["full_name"] if primary else None,
        "lawyer_id": primary["lawyer_id"] if primary else None,
        "lawyer_email": primary["lawyers"]["users"]["email"] if primary else None,
        "lawyer_phone": primary["lawyers"]["users"]["phone"] if primary else None,
        "lawyers": [
            {
                "lawyer_id": cl["lawyer_id"],
                "name": cl["lawyers"]["users"]["full_name"],
                "email": cl["lawyers"]["users"]["email"],
                "phone": cl["lawyers"]["users"]["phone"],
                "assigned_role": cl["assigned_role"],
            }
            for cl in _active_case_lawyers(row["case_lawyers"])
        ],
        "court": row["courts"]["court_name"] if row["courts"] else None,
        "case_type": row["case_types"]["case_type_name"] if row.get("case_types") else None,
        "status": row["status"],
        "hearing": row["next_hearing_date"],
        "priority": row["priority"],
        "description": row.get("description"),
        "cnr_number": row.get("cnr_number"),
        "ecourts_status": row.get("ecourts_status"),
        "ecourts_last_synced_at": row.get("ecourts_last_synced_at"),
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

    # cases.org_id is NOT NULL -- see respond_client_request's matching guard.
    if profile.get("org_id") is None:
        raise HTTPException(status_code=500, detail="This lawyer's account isn't linked to a firm. Contact support.")

    case_row = supabase.table("cases").insert({
        "case_number": _generate_case_number(case_type_rows[0]["case_type_name"]),
        "case_title": data.case_title,
        "client_id": data.client_id,
        "court_id": data.court_id,
        "case_type_id": data.case_type_id,
        "org_id": profile["org_id"],
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


def add_lawyer_to_case(case_id: int, data: AddLawyerRequest, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Add a teammate to a case's active lawyer roster. The caller must be the case's
    current Primary lawyer, or an admin (org-scoped) / super-admin. The target lawyer must
    belong to the same organization as the case. Calls: `ensure_case_access()`,
    `_primary_case_lawyer()`, `_to_case_summary()`."""
    if data.assigned_role == "Primary":
        raise HTTPException(status_code=409, detail="A case can only have one Primary lawyer.")

    ensure_case_access(case_id, profile)
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]

    if profile["role_id"] == LAWYER:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        caller_lawyer_id = lawyer_rows[0]["lawyer_id"] if lawyer_rows else None
        primary = _primary_case_lawyer(row["case_lawyers"])
        if not primary or primary["lawyer_id"] != caller_lawyer_id:
            raise HTTPException(status_code=403, detail="Only the case's Primary lawyer can add teammates.")

    target_rows = supabase.table("lawyers").select("lawyer_id,users(org_id)").eq("lawyer_id", data.lawyer_id).execute().data
    if not target_rows or not target_rows[0].get("users"):
        raise HTTPException(status_code=404, detail="Lawyer not found")
    if target_rows[0]["users"]["org_id"] != row["org_id"]:
        raise HTTPException(status_code=403, detail="That lawyer isn't part of this case's organization.")

    existing = next((cl for cl in row["case_lawyers"] if cl["lawyer_id"] == data.lawyer_id), None)
    if existing and existing["is_active"]:
        raise HTTPException(status_code=409, detail="This lawyer is already on the case.")

    if existing:
        # A previous stint left a (case_id, lawyer_id) row behind (soft-deleted via
        # is_active=False); case_lawyers has a unique index on that pair, so rejoining
        # the case reactivates it instead of inserting a second row, which would 500 on
        # the constraint.
        supabase.table("case_lawyers").update({"assigned_role": data.assigned_role, "is_active": True}) \
            .eq("case_id", case_id).eq("lawyer_id", data.lawyer_id).execute()
    else:
        supabase.table("case_lawyers").insert({
            "case_id": case_id, "lawyer_id": data.lawyer_id,
            "assigned_role": data.assigned_role, "is_active": True,
        }).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)


def remove_lawyer_from_case(case_id: int, lawyer_id: int, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Remove a lawyer from a case's active roster. Self-removal is always allowed for an
    actively-assigned lawyer; removing someone else requires being the case's Primary
    lawyer or an admin/super-admin. Calls: `ensure_case_access()`, `_primary_case_lawyer()`,
    `_to_case_summary()`."""
    ensure_case_access(case_id, profile)
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]

    if profile["role_id"] == LAWYER:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        caller_lawyer_id = lawyer_rows[0]["lawyer_id"] if lawyer_rows else None
        if caller_lawyer_id != lawyer_id:
            primary = _primary_case_lawyer(row["case_lawyers"])
            if not primary or primary["lawyer_id"] != caller_lawyer_id:
                raise HTTPException(status_code=403, detail="Only the case's Primary lawyer can remove another teammate.")

    supabase.table("case_lawyers").update({"is_active": False}) \
        .eq("case_id", case_id).eq("lawyer_id", lawyer_id).eq("is_active", True).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)


def list_available_case_lawyers(case_id: int, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """List lawyers in the case's own organization who could be added to its team --
    backs the "Add lawyer" picker. Calls: `ensure_case_access()`."""
    ensure_case_access(case_id, profile)
    case_row = supabase.table("cases").select("org_id").eq("case_id", case_id).execute().data[0]
    org_lawyer_users = supabase.table("users").select("user_id,full_name,email") \
        .eq("role_id", LAWYER).eq("org_id", case_row["org_id"]).execute().data
    user_ids = [u["user_id"] for u in org_lawyer_users]
    if not user_ids:
        return []
    lawyer_rows = supabase.table("lawyers").select("lawyer_id,user_id").in_("user_id", user_ids).execute().data
    lawyer_id_by_user = {r["user_id"]: r["lawyer_id"] for r in lawyer_rows}
    # Whoever is already on the team isn't available to be added again -- offering them
    # put names in the "Add lawyer" picker that could only ever come back as a 409.
    already_on_case = {
        row["lawyer_id"]
        for row in supabase.table("case_lawyers").select("lawyer_id").eq("case_id", case_id).eq("is_active", True).execute().data
    }
    return [
        {"lawyer_id": lawyer_id_by_user[u["user_id"]], "name": u["full_name"], "email": u["email"]}
        for u in org_lawyer_users
        if u["user_id"] in lawyer_id_by_user and lawyer_id_by_user[u["user_id"]] not in already_on_case
    ]
