"""Controllers for syncing case status from the eCourtsIndia API (webapi.ecourtsindia.com)
by CNR number. No official government API exists for this -- services.ecourts.gov.in is a
CAPTCHA-gated portal -- so this goes through eCourtsIndia's third-party partner API instead."""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import BackgroundTasks, Depends, HTTPException
from app.controllers.case_history import add_timeline_event
from app.controllers.cases import CASES_SELECT, _to_case_summary
from app.core.config import ECOURTS_API_BASE, ECOURTS_API_KEY
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, SUPER_ADMIN, LAWYER, ensure_case_access, require_roles
from app.models.cases import CnrUpdate

logger = logging.getLogger(__name__)


def _ecourts_auth() -> str:
    """Return the eCourtsIndia bearer token, or 500 if it isn't configured -- see .env.example."""
    if not ECOURTS_API_KEY:
        raise HTTPException(status_code=500, detail="eCourts sync is not configured on this server.")
    return ECOURTS_API_KEY


def set_case_cnr(case_id: int, data: CnrUpdate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Attach a case's 16-character eCourts CNR number so it can be synced.
    Calls: `ensure_case_access()`."""
    ensure_case_access(case_id, profile)
    cnr = data.cnr_number.strip().upper()
    if len(cnr) != 16:
        raise HTTPException(status_code=400, detail="A CNR number is 16 characters (e.g. DLST020314162024).")
    supabase.table("cases").update({"cnr_number": cnr}).eq("case_id", case_id).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)


def _run_ecourts_sync(case_id: int, cnr: str, token: str, user_id: int) -> None:
    """Background counterpart to sync_case_from_ecourts's inline checks: makes the
    eCourtsIndia call, stores the result, and logs a timeline event. There's no request left
    to raise an HTTPException to by the time this runs, so failures land in
    cases.ecourts_sync_status/ecourts_sync_error instead."""
    try:
        resp = httpx.get(
            f"{ECOURTS_API_BASE}/api/partner/case/{cnr}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        if resp.status_code == 404:
            raise ValueError("This CNR isn't indexed by eCourts yet. Try again shortly.")
        if resp.status_code >= 400:
            raise ValueError("eCourts sync failed.")
        record = resp.json()["data"]
        # ponytail: log the raw payload until hearing-history auto-import is written (see
        # docs/FUTURE_SCOPE.md §1.1); drop this once that mapping is in place.
        logger.info("eCourts raw response for CNR %s: %s", cnr, record)
        # caseStatus/courtCode live under courtCaseData, not at the top level of `data`
        # -- see docs/FUTURE_SCOPE.md §1.1 for the confirmed response shape.
        case_data = record.get("courtCaseData", {})

        # Additive: only overwrite ecourts_status if this response actually carried one. A
        # response shape eCourts changes on us (a renamed field, a court type that nests it
        # differently -- courtCaseData itself was one such surprise, see docs/FUTURE_SCOPE.md
        # §1.1) must not silently blank out a status a previous, working sync already set.
        updates = {
            "ecourts_raw": record,
            "ecourts_last_synced_at": datetime.now(timezone.utc).isoformat(),
            "ecourts_sync_status": "idle",
            "ecourts_sync_error": None,
        }
        if case_data.get("caseStatus") is not None:
            updates["ecourts_status"] = case_data["caseStatus"]
        supabase.table("cases").update(updates).eq("case_id", case_id).execute()

        add_timeline_event(
            case_id, "ecourts_synced",
            f"Synced with eCourts — status: {case_data.get('caseStatus', 'unknown')}",
            f"CNR {cnr}, court {case_data.get('courtCode', 'n/a')}.",
            user_id,
        )
    except Exception as exc:
        logger.exception("Background eCourts sync failed for case %s", case_id)
        supabase.table("cases").update({
            "ecourts_sync_status": "error",
            "ecourts_sync_error": str(exc)[:500],
        }).eq("case_id", case_id).execute()


def sync_case_from_ecourts(case_id: int, background_tasks: BackgroundTasks, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Queue a background pull of the latest record for a case from eCourtsIndia by its CNR
    (the HTTP round trip is slow enough to move off the request thread) and return
    immediately with ecourts_sync_status="syncing"; poll GET /cases for ecourts_sync_status
    to flip to "idle"/"error". Auto-creating hearing rows from the response's hearing-history
    is a follow-up once that field's exact shape is confirmed against a live call --
    ponytail: sync status/parties now, wire hearings once the schema is known.
    Calls: `ensure_case_access()`, `_ecourts_auth()`."""
    ensure_case_access(case_id, profile)
    token = _ecourts_auth()

    case_rows = supabase.table("cases").select("cnr_number").eq("case_id", case_id).execute().data
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    cnr = case_rows[0]["cnr_number"]
    if not cnr:
        raise HTTPException(status_code=400, detail="This case has no CNR number set yet. Add one first.")

    supabase.table("cases").update({"ecourts_sync_status": "syncing", "ecourts_sync_error": None}).eq("case_id", case_id).execute()
    background_tasks.add_task(_run_ecourts_sync, case_id, cnr, token, profile["user_id"])

    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)
