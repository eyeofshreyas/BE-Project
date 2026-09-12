"""Controllers for syncing case status from the eCourtsIndia API (webapi.ecourtsindia.com)
by CNR number. No official government API exists for this -- services.ecourts.gov.in is a
CAPTCHA-gated portal -- so this goes through eCourtsIndia's third-party partner API instead."""

from datetime import datetime, timezone

import httpx
from fastapi import Depends, HTTPException
from app.controllers.case_history import add_timeline_event
from app.controllers.cases import CASES_SELECT, _to_case_summary
from app.core.config import ECOURTS_API_BASE, ECOURTS_API_KEY
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, require_roles
from app.models.cases import CnrUpdate


def _ecourts_auth() -> str:
    """Return the eCourtsIndia bearer token, or 500 if it isn't configured -- see .env.example."""
    if not ECOURTS_API_KEY:
        raise HTTPException(status_code=500, detail="eCourts sync is not configured on this server.")
    return ECOURTS_API_KEY


def set_case_cnr(case_id: int, data: CnrUpdate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Attach a case's 16-character eCourts CNR number so it can be synced.
    Calls: `ensure_case_access()`."""
    ensure_case_access(case_id, profile)
    cnr = data.cnr_number.strip().upper()
    if len(cnr) != 16:
        raise HTTPException(status_code=400, detail="A CNR number is 16 characters (e.g. DLST020314162024).")
    supabase.table("cases").update({"cnr_number": cnr}).eq("case_id", case_id).execute()
    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)


def sync_case_from_ecourts(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Pull the latest record for a case from eCourtsIndia by its CNR, store the raw
    response, and log a timeline event. Auto-creating hearing rows from the response's
    hearing-history is a follow-up once that field's exact shape is confirmed against a
    live call -- ponytail: sync status/parties now, wire hearings once the schema is known.
    Calls: `ensure_case_access()`, `_ecourts_auth()`."""
    ensure_case_access(case_id, profile)
    token = _ecourts_auth()

    case_rows = supabase.table("cases").select("cnr_number").eq("case_id", case_id).execute().data
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    cnr = case_rows[0]["cnr_number"]
    if not cnr:
        raise HTTPException(status_code=400, detail="This case has no CNR number set yet. Add one first.")

    resp = httpx.get(
        f"{ECOURTS_API_BASE}/api/partner/case/{cnr}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="This CNR isn't indexed by eCourts yet. Try again shortly.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="eCourts sync failed.")
    record = resp.json()["data"]

    supabase.table("cases").update({
        "ecourts_status": record.get("caseStatus"),
        "ecourts_raw": record,
        "ecourts_last_synced_at": datetime.now(timezone.utc).isoformat(),
    }).eq("case_id", case_id).execute()

    add_timeline_event(
        case_id, "ecourts_synced",
        f"Synced with eCourts — status: {record.get('caseStatus', 'unknown')}",
        f"CNR {cnr}, court {record.get('courtCode', 'n/a')}.",
        profile["user_id"],
    )

    row = supabase.table("cases").select(CASES_SELECT).eq("case_id", case_id).execute().data[0]
    return _to_case_summary(row)
