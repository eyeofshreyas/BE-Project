from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from supabase_client import supabase

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
def conveyancing_summary():
    rows = supabase.table("conveyancing_matters").select(MATTERS_SELECT).order("matter_id", desc=True).execute().data

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
