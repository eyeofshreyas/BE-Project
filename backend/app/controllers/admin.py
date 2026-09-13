"""Admin-only controllers backing the admin console's Dashboard and Analytics tabs, plus
the platform-wide settings row. Gated by require_roles(ADMIN, SUPER_ADMIN)."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from postgrest.exceptions import APIError as PostgrestAPIError
from app.core.config import STORAGE_QUOTA_BYTES
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, CLIENT, LAWYER, SUPER_ADMIN, require_roles, get_scoped_case_ids
from app.models.admin import LawyerInviteCreate, PlatformSettings

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


def invite_lawyer(data: LawyerInviteCreate, profile: dict = Depends(require_roles(ADMIN))):
    """Create a pending invite for a lawyer to join the caller's organization; consumed by
    /signup when that email signs up as a lawyer. SUPER_ADMIN is deliberately excluded --
    that role has no org_id to invite a lawyer into."""
    supabase.table("lawyer_invites").insert({
        "org_id": profile["org_id"],
        "email": data.email,
        "status": "pending",
    }).execute()
    return {"message": "Invite sent."}


def get_stats(profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Totals for the dashboard's overview cards -- platform-wide for the super-admin,
    scoped to the caller's own org for an org admin. Calls: `get_scoped_case_ids()`."""
    month_start = date.today().replace(day=1).isoformat()
    today = date.today().isoformat()
    case_ids = get_scoped_case_ids(profile)  # None for super-admin, this org's cases for admin

    document_ids = None
    invoice_ids = None
    if case_ids is not None:
        document_ids = [d["document_id"] for d in supabase.table("documents").select("document_id").in_("case_id", list(case_ids)).execute().data] if case_ids else []
        invoice_ids = [i["invoice_id"] for i in supabase.table("invoices").select("invoice_id").in_("case_id", list(case_ids)).execute().data] if case_ids else []

    users_query = supabase.table("users").select("user_id", count="exact")
    lawyers_query = supabase.table("users").select("user_id", count="exact").eq("role_id", LAWYER).eq("is_active", True)
    clients_query = supabase.table("users").select("user_id", count="exact").eq("role_id", CLIENT)
    if profile["role_id"] == ADMIN:
        users_query = users_query.eq("org_id", profile["org_id"])
        lawyers_query = lawyers_query.eq("org_id", profile["org_id"])
        clients_query = clients_query.eq("org_id", profile["org_id"])

    # "Active" means anything still being worked -- Closed is the only terminal status.
    cases_query = supabase.table("cases").select("case_id", count="exact").neq("status", "Closed")
    documents_query = supabase.table("documents").select("document_id", count="exact").eq("is_deleted", False)
    ai_summaries_query = supabase.table("ai_summaries").select("document_id", count="exact")
    hearings_query = (
        supabase.table("hearings").select("hearing_id", count="exact")
        .eq("hearing_status", "Scheduled").gte("hearing_date", today)
    )
    payments_query = (
        supabase.table("payments").select("amount")
        .eq("payment_status", "Completed").gte("payment_date", month_start)
    )
    if case_ids is not None:
        cases_query = supabase.table("cases").select("case_id", count="exact").neq("status", "Closed").in_("case_id", list(case_ids))
        documents_query = documents_query.in_("case_id", list(case_ids))
        ai_summaries_query = ai_summaries_query.in_("document_id", document_ids)
        hearings_query = hearings_query.in_("case_id", list(case_ids))
        payments_query = payments_query.in_("invoice_id", invoice_ids)

    payments = payments_query.execute().data

    return {
        "total_users": _count(users_query),
        "active_lawyers": _count(lawyers_query),
        "registered_clients": _count(clients_query),
        "active_cases": _count(cases_query),
        "documents_uploaded": _count(documents_query),
        "ai_summaries": _count(ai_summaries_query),
        "revenue_this_month": sum(float(p["amount"] or 0) for p in payments),
        "pending_hearings": _count(hearings_query),
    }


def list_activity(limit: int = 15, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """The newest `case_timeline` events -- platform-wide for the super-admin, scoped to the
    caller's own org's cases for an org admin. Calls: `get_scoped_case_ids()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []
    query = supabase.table("case_timeline").select(TIMELINE_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("created_at", desc=True).limit(min(limit, 50)).execute().data
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


def get_analytics(profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Case-status distribution, monthly filing growth, AI-summary usage, document
    insights and storage usage -- platform-wide for the super-admin, scoped to the
    caller's own org for an org admin. Calls: `_month_buckets()`, `_week_buckets()`,
    `get_scoped_case_ids()`."""
    months = _month_buckets(GROWTH_MONTHS)
    weeks = _week_buckets(AI_USAGE_WEEKS)
    case_ids = get_scoped_case_ids(profile)

    cases_query = supabase.table("cases").select("status,filing_date,created_at")
    documents_query = supabase.table("documents").select("file_size").eq("is_deleted", False)
    summarized_query = supabase.table("ai_summaries").select("document_id", count="exact")
    deleted_query = supabase.table("documents").select("document_id", count="exact").eq("is_deleted", True)
    if case_ids is not None:
        cases_query = cases_query.in_("case_id", list(case_ids))
        documents_query = documents_query.in_("case_id", list(case_ids))
        deleted_query = deleted_query.in_("case_id", list(case_ids))

    case_rows = cases_query.execute().data
    status_counts = Counter(r["status"] or "Unknown" for r in case_rows)

    # filing_date is the date that matters for "cases filed", but conveyancing-style cases
    # are created without one -- fall back to the row's creation timestamp so they still count.
    filed_months = Counter((r["filing_date"] or r["created_at"] or "")[:7] for r in case_rows)

    document_ids = None
    if case_ids is not None:
        document_ids = [d["document_id"] for d in supabase.table("documents").select("document_id").in_("case_id", list(case_ids)).execute().data]
        summarized_query = summarized_query.in_("document_id", document_ids)

    summary_query = (
        supabase.table("ai_summaries").select("generated_at").gte("generated_at", weeks[0][0].isoformat())
    )
    if document_ids is not None:
        summary_query = summary_query.in_("document_id", document_ids)
    summary_rows = summary_query.execute().data
    ai_counts: Counter = Counter()
    for row in summary_rows:
        if not row["generated_at"]:
            continue
        generated = datetime.fromisoformat(row["generated_at"].replace("Z", "+00:00")).date()
        ai_counts[generated - timedelta(days=generated.weekday())] += 1

    live_docs = documents_query.execute().data
    summarized = _count(summarized_query)
    deleted_docs = _count(deleted_query)

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


def get_settings(profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Read the caller's own org's platform_settings row, falling back to defaults if the
    row was deleted. Calls: `_reraise_settings_error()`."""
    if profile["role_id"] == SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Platform settings are managed per organization.")
    try:
        rows = supabase.table("platform_settings").select("*").eq("org_id", profile["org_id"]).execute().data
    except PostgrestAPIError as e:
        _reraise_settings_error(e)
    if not rows:
        return dict(SETTINGS_DEFAULTS)
    return {field: rows[0][field] for field in SETTINGS_FIELDS}


def update_settings(data: PlatformSettings, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN))):
    """Upsert the caller's own org's platform_settings row. Calls: `_reraise_settings_error()`."""
    if profile["role_id"] == SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Platform settings are managed per organization.")
    try:
        supabase.table("platform_settings").upsert({
            "org_id": profile["org_id"],
            **data.model_dump(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except PostgrestAPIError as e:
        _reraise_settings_error(e)
    return data
