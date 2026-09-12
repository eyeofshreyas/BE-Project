"""Admin-only controllers backing the admin console's Dashboard and Analytics tabs, plus
the platform-wide settings row. Gated by require_roles(ADMIN)."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from postgrest.exceptions import APIError as PostgrestAPIError
from app.core.config import STORAGE_QUOTA_BYTES
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, CLIENT, LAWYER, require_roles
from app.models.admin import PlatformSettings

TIMELINE_SELECT = (
    "timeline_id,event_type,event_title,event_description,created_at,"
    "cases(case_number),users(full_name)"
)
SETTINGS_FIELDS = ("maintenance_mode", "new_signup_alerts", "weekly_reports", "auto_backup")
SETTINGS_DEFAULTS = {"maintenance_mode": False, "new_signup_alerts": True, "weekly_reports": True, "auto_backup": True}
UNDEFINED_TABLE = "42P01"
GROWTH_MONTHS = 6
AI_USAGE_WEEKS = 8


def _count(query) -> int:
    """Run a PostgREST query built with count="exact" and return just the count.
    Counting server-side keeps these cards off the "fetch every row to len() it" path."""
    return query.execute().count or 0


def get_stats(profile: dict = Depends(require_roles(ADMIN))):
    """Platform-wide totals for the dashboard's overview cards."""
    month_start = date.today().replace(day=1).isoformat()
    today = date.today().isoformat()

    payments = (
        supabase.table("payments")
        .select("amount")
        .eq("payment_status", "Completed")
        .gte("payment_date", month_start)
        .execute()
        .data
    )

    return {
        "total_users": _count(supabase.table("users").select("user_id", count="exact")),
        "active_lawyers": _count(
            supabase.table("users").select("user_id", count="exact").eq("role_id", LAWYER).eq("is_active", True)
        ),
        "registered_clients": _count(
            supabase.table("users").select("user_id", count="exact").eq("role_id", CLIENT)
        ),
        # "Active" means anything still being worked -- Closed is the only terminal status.
        "active_cases": _count(supabase.table("cases").select("case_id", count="exact").neq("status", "Closed")),
        "documents_uploaded": _count(
            supabase.table("documents").select("document_id", count="exact").eq("is_deleted", False)
        ),
        "ai_summaries": _count(supabase.table("ai_summaries").select("document_id", count="exact")),
        "revenue_this_month": sum(float(p["amount"] or 0) for p in payments),
        "pending_hearings": _count(
            supabase.table("hearings")
            .select("hearing_id", count="exact")
            .eq("hearing_status", "Scheduled")
            .gte("hearing_date", today)
        ),
    }


def list_activity(limit: int = 15, profile: dict = Depends(require_roles(ADMIN))):
    """The newest `case_timeline` events across every case -- the admin-wide version of
    the per-case timeline on the case page."""
    rows = (
        supabase.table("case_timeline")
        .select(TIMELINE_SELECT)
        .order("created_at", desc=True)
        .limit(min(limit, 50))
        .execute()
        .data
    )
    return [
        {
            "id": r["timeline_id"],
            "event_type": r["event_type"],
            "event_title": r["event_title"],
            "event_description": r["event_description"],
            "case_number": r["cases"]["case_number"] if r.get("cases") else None,
            "actor": r["users"]["full_name"] if r.get("users") else None,
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def _month_buckets(n: int) -> list[tuple[str, str]]:
    """(YYYY-MM, "Mar") for the last n months, oldest first."""
    today = date.today()
    year, month = today.year, today.month
    out = []
    for _ in range(n):
        out.append((f"{year:04d}-{month:02d}", date(year, month, 1).strftime("%b")))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(out))


def _week_buckets(n: int) -> list[tuple[date, str]]:
    """(monday, "14 Jul") for the last n weeks, oldest first."""
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    weeks = [this_monday - timedelta(weeks=i) for i in range(n - 1, -1, -1)]
    return [(w, w.strftime("%d %b")) for w in weeks]


def get_analytics(profile: dict = Depends(require_roles(ADMIN))):
    """Case-status distribution, monthly filing growth, AI-summary usage, document
    insights and storage usage. Calls: `_month_buckets()`, `_week_buckets()`."""
    months = _month_buckets(GROWTH_MONTHS)
    weeks = _week_buckets(AI_USAGE_WEEKS)

    case_rows = supabase.table("cases").select("status,filing_date,created_at").execute().data
    status_counts = Counter(r["status"] or "Unknown" for r in case_rows)

    # filing_date is the date that matters for "cases filed", but conveyancing-style cases
    # are created without one -- fall back to the row's creation timestamp so they still count.
    filed_months = Counter((r["filing_date"] or r["created_at"] or "")[:7] for r in case_rows)

    summary_rows = (
        supabase.table("ai_summaries")
        .select("generated_at")
        .gte("generated_at", weeks[0][0].isoformat())
        .execute()
        .data
    )
    ai_counts: Counter = Counter()
    for row in summary_rows:
        if not row["generated_at"]:
            continue
        generated = datetime.fromisoformat(row["generated_at"].replace("Z", "+00:00")).date()
        ai_counts[generated - timedelta(days=generated.weekday())] += 1

    live_docs = supabase.table("documents").select("file_size").eq("is_deleted", False).execute().data
    summarized = _count(supabase.table("ai_summaries").select("document_id", count="exact"))
    deleted_docs = _count(
        supabase.table("documents").select("document_id", count="exact").eq("is_deleted", True)
    )

    return {
        "total_cases": len(case_rows),
        "case_status": [{"label": label, "count": count} for label, count in status_counts.most_common()],
        "case_growth": [{"label": label, "count": filed_months.get(key, 0)} for key, label in months],
        "ai_usage": [{"label": label, "count": ai_counts.get(monday, 0)} for monday, label in weeks],
        "documents": {
            "total": len(live_docs),
            "summarized": summarized,
            "awaiting_summary": max(len(live_docs) - summarized, 0),
            "deleted": deleted_docs,
        },
        "storage": {
            "used_bytes": sum(int(d["file_size"] or 0) for d in live_docs),
            "quota_bytes": STORAGE_QUOTA_BYTES,
        },
    }


def _reraise_settings_error(error: PostgrestAPIError) -> None:
    """Always raises. The settings table is created by a migration run by hand in the
    Supabase SQL editor, so "table doesn't exist" is a real thing an operator will hit --
    name the file to run instead of falling through to main.py's generic 500."""
    if error.code == UNDEFINED_TABLE:
        raise HTTPException(status_code=503, detail="Platform settings aren't set up yet. Run backend/migrate_platform_settings.sql.")
    raise error


def get_settings(profile: dict = Depends(require_roles(ADMIN))):
    """Read the single pinned platform_settings row, falling back to defaults if the row
    was deleted. Calls: `_reraise_settings_error()`."""
    try:
        rows = supabase.table("platform_settings").select("*").eq("id", 1).execute().data
    except PostgrestAPIError as e:
        _reraise_settings_error(e)
    if not rows:
        return dict(SETTINGS_DEFAULTS)
    return {field: rows[0][field] for field in SETTINGS_FIELDS}


def update_settings(data: PlatformSettings, profile: dict = Depends(require_roles(ADMIN))):
    """Upsert the pinned platform_settings row. Calls: `_reraise_settings_error()`."""
    try:
        supabase.table("platform_settings").upsert({
            "id": 1,
            **data.model_dump(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except PostgrestAPIError as e:
        _reraise_settings_error(e)
    return data
