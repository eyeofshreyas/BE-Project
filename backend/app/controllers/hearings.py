"""Controllers for court hearings: list (case-scoped), get, create, update."""

from datetime import date

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access
from app.models.hearings import HearingSummary, HearingCreate, HearingUpdate

HEARINGS_SELECT = (
    "hearing_id,case_id,hearing_date,hearing_time,courtroom,hearing_status,hearing_outcome,next_hearing_date,notes,"
    "cases(case_number,case_title,priority,clients(users(full_name))),judges(judge_name,courts(court_name))"
)


def _to_hearing_summary(row: dict) -> dict:
    """Shape a raw `hearings` row (joined with cases/clients/judges/courts) into the HearingSummary dict."""
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


def _sync_next_hearing_date(case_id: int) -> None:
    """Recompute cases.next_hearing_date as the nearest upcoming Scheduled hearing for
    case_id, rather than trusting whichever hearing was just created/updated -- a hearing
    touched out of chronological order (e.g. backfilling a past date) must not overwrite
    a genuinely later "next" hearing with an earlier or stale one."""
    rows = (
        supabase.table("hearings").select("hearing_date")
        .eq("case_id", case_id).eq("hearing_status", "Scheduled")
        .gte("hearing_date", date.today().isoformat())
        .order("hearing_date").limit(1).execute().data
    )
    next_date = rows[0]["hearing_date"] if rows else None
    supabase.table("cases").update({"next_hearing_date": next_date}).eq("case_id", case_id).execute()


# shared fetch+scope-check used by get_hearing, update_hearing, and
# create_hearing's return path -- keeps the 404/403 logic in one place.
def _get_hearing(hearing_id: int, case_ids: set[int] | None = None) -> dict:
    """Fetch one hearing by ID; 404 if missing, 403 if outside case_ids. Calls: `_to_hearing_summary()`."""
    rows = supabase.table("hearings").select(HEARINGS_SELECT).eq("hearing_id", hearing_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Hearing not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this hearing")
    return _to_hearing_summary(rows[0])


def list_hearings(case_id: int | None = None, profile: dict = Depends(get_current_profile)):
    """List hearings, optionally filtered by case_id, restricted to the caller's scope.
    Calls: `get_scoped_case_ids()`, `_to_hearing_summary()`."""
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
    """Fetch one hearing, scoped to the caller. Calls: `_get_hearing()`, `get_scoped_case_ids()`."""
    return _get_hearing(hearing_id, get_scoped_case_ids(profile))


def create_hearing(data: HearingCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Create a hearing for a case the caller has access to, and update the case's
    next_hearing_date. Calls: `ensure_case_access()`, `_sync_next_hearing_date()`, `_get_hearing()`."""
    ensure_case_access(data.case_id, profile)

    # A double-submitted form used to land twice, leaving two hearings a person can't tell
    # apart -- and both then read as two separate listings everywhere the case is summarised.
    # The repeat is only refused until the caller says it's deliberate, since a case genuinely
    # can be listed twice at one slot.
    if not data.allow_duplicate:
        clash = (
            supabase.table("hearings").select("hearing_id")
            .eq("case_id", data.case_id).eq("hearing_date", data.hearing_date)
            .eq("hearing_time", data.hearing_time).eq("judge_id", data.judge_id)
            .execute().data
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail="This case already has a hearing at that date and time before that judge. "
                       "Send allow_duplicate=true if the repeat listing is intended.",
            )

    row = supabase.table("hearings").insert({
        "case_id": data.case_id,
        "judge_id": data.judge_id,
        "hearing_date": data.hearing_date,
        "hearing_time": data.hearing_time,
        "courtroom": data.courtroom,
        "notes": data.notes,
        "hearing_status": "Scheduled",
    }).execute().data[0]
    _sync_next_hearing_date(data.case_id)
    return _get_hearing(row["hearing_id"])


def update_hearing(hearing_id: int, data: HearingUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Update a hearing's status/outcome/notes; also re-syncs the case's next_hearing_date
    since a status change can affect which hearing is now the nearest upcoming one.
    Calls: `_get_hearing()`, `_sync_next_hearing_date()`."""
    _get_hearing(hearing_id, get_scoped_case_ids(profile))

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return _get_hearing(hearing_id)

    rows = supabase.table("hearings").update(updates).eq("hearing_id", hearing_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Hearing not found")

    _sync_next_hearing_date(rows[0]["case_id"])

    return _get_hearing(hearing_id)
