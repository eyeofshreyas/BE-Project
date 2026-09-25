"""Admin-only controllers backing the admin console's Dashboard and Analytics tabs.
Gated by require_roles(ADMIN, SUPER_ADMIN)."""

from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import BackgroundTasks, Depends, HTTPException
from app.core.config import FRONTEND_URL, STORAGE_QUOTA_BYTES
from app.core.email import send_email
from app.controllers.cases import _active_case_lawyers
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, CLIENT, LAWYER, SUPER_ADMIN, require_roles, get_scoped_case_ids
from app.models.admin import LawyerInviteCreate

TIMELINE_SELECT = (
    "timeline_id,event_type,event_title,event_description,created_at,"
    "cases(case_number),users(full_name)"
)
GROWTH_MONTHS = 6
AI_USAGE_WEEKS = 8


def _count(query) -> int:
    """Run a PostgREST query built with count="exact" and return just the count.
    Counting server-side keeps these cards off the "fetch every row to len() it" path."""
    return query.execute().count or 0


def invite_lawyer(data: LawyerInviteCreate, background_tasks: BackgroundTasks, profile: dict = Depends(require_roles(ADMIN))):
    """Create a pending invite for a lawyer to join the caller's organization and email them a
    signup link; consumed by /signup when that email signs up as a lawyer. SUPER_ADMIN is
    deliberately excluded -- that role has no org_id to invite a lawyer into.

    The email is sent after the response goes out (BackgroundTasks) -- SMTP is a slow round
    trip and the invite row is already committed, so there's nothing left for the caller to
    wait on.

    An email that already has a LexFlow account can't redeem this invite -- signup for an
    existing email fails outright, and there's no way to move an existing account between
    orgs -- so that's rejected up front rather than silently creating a dead invite."""
    existing = supabase.table("users").select("user_id").eq("email", data.email).execute().data
    if existing:
        raise HTTPException(status_code=409, detail="This email already has a LexFlow account.")

    supabase.table("lawyer_invites").insert({
        "org_id": profile["org_id"],
        "email": data.email,
        "status": "pending",
    }).execute()

    org_rows = supabase.table("organizations").select("name").eq("org_id", profile["org_id"]).execute().data
    firm_name = org_rows[0]["name"] if org_rows else "a firm"

    background_tasks.add_task(
        send_email,
        data.email,
        f"You're invited to join {firm_name} on LexFlow",
        f"{profile['full_name']} has invited you to join {firm_name} as a lawyer on LexFlow.\n\n"
        f"Go to {FRONTEND_URL}/signup and sign up with this email address ({data.email}) to accept the invite.",
    )

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
    # Clients are global (users.org_id is always NULL for them, by design -- a client can have
    # cases with lawyers at different firms), so an org admin's registered_clients is derived
    # below from their own org's case_ids instead, the same way clients.list_clients() does.
    clients_query = supabase.table("users").select("user_id", count="exact").eq("role_id", CLIENT)
    if profile["role_id"] == ADMIN:
        users_query = users_query.eq("org_id", profile["org_id"])
        lawyers_query = lawyers_query.eq("org_id", profile["org_id"])

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

    if case_ids is not None:
        client_rows = supabase.table("cases").select("client_id").in_("case_id", list(case_ids)).execute().data if case_ids else []
        registered_clients = len({r["client_id"] for r in client_rows if r["client_id"]})
    else:
        registered_clients = _count(clients_query)

    return {
        "total_users": _count(users_query),
        "active_lawyers": _count(lawyers_query),
        "registered_clients": registered_clients,
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


def get_firm_analytics(profile: dict = Depends(require_roles(ADMIN))):
    """Case exposure rows and per-lawyer workload for the Firm Analytics tab, scoped to
    the caller's own org. ADMIN only -- there is no platform-wide variant for SUPER_ADMIN,
    who has no single org's exposure to show. Calls: `_active_case_lawyers()`."""
    case_rows = supabase.table("cases").select(
        "case_id,case_title,status,claim_value,client_id,"
        "clients(users(full_name)),case_types(case_type_name),"
        "case_lawyers(lawyer_id,is_active,lawyers(users(full_name)))"
    ).eq("org_id", profile["org_id"]).execute().data

    if not case_rows:
        return {"cases": [], "workload": []}

    case_ids = [row["case_id"] for row in case_rows]
    hearing_rows = (
        supabase.table("hearings").select("case_id,hearing_date")
        .eq("hearing_status", "Scheduled").gte("hearing_date", date.today().isoformat())
        .in_("case_id", case_ids).execute().data
    )

    fa_cases = []
    case_lawyer_ids: dict[int, list[int]] = {}
    lawyer_names: dict[int, str] = {}
    active_case_counts: dict[int, int] = {}

    for row in case_rows:
        active = _active_case_lawyers(row["case_lawyers"])
        lawyer_ids = [cl["lawyer_id"] for cl in active]
        case_lawyer_ids[row["case_id"]] = lawyer_ids
        for cl in active:
            lawyer_names[cl["lawyer_id"]] = cl["lawyers"]["users"]["full_name"]
            if row["status"] != "Closed":
                active_case_counts[cl["lawyer_id"]] = active_case_counts.get(cl["lawyer_id"], 0) + 1
        fa_cases.append({
            "case_id": row["case_id"],
            "case_title": row["case_title"],
            "client": row["clients"]["users"]["full_name"] if row.get("clients") else None,
            "client_id": row["client_id"],
            "case_type": row["case_types"]["case_type_name"] if row.get("case_types") else None,
            "status": row["status"],
            "claim_value": row["claim_value"],
            "lawyer_ids": lawyer_ids,
            "lawyers": [cl["lawyers"]["users"]["full_name"] for cl in active],
        })

    # lawyer_id -> hearing_date -> set of distinct case_ids that lawyer has a Scheduled
    # hearing for on that date. A date maps to 2+ cases only when the lawyer is genuinely
    # double-booked; the same case re-listed twice on one day (allowed, see
    # HearingCreate.allow_duplicate) must not look like a conflict.
    hearing_case_dates: dict[int, dict[str, set[int]]] = {}
    upcoming_counts: dict[int, int] = {}
    for h in hearing_rows:
        for lawyer_id in case_lawyer_ids.get(h["case_id"], []):
            hearing_case_dates.setdefault(lawyer_id, {}).setdefault(h["hearing_date"], set()).add(h["case_id"])
            upcoming_counts[lawyer_id] = upcoming_counts.get(lawyer_id, 0) + 1

    workload = []
    for lawyer_id, name in lawyer_names.items():
        dates = hearing_case_dates.get(lawyer_id, {})
        conflicts = sorted(d for d, case_set in dates.items() if len(case_set) > 1)
        workload.append({
            "lawyer_id": lawyer_id,
            "lawyer_name": name,
            "active_cases": active_case_counts.get(lawyer_id, 0),
            "upcoming_hearings": upcoming_counts.get(lawyer_id, 0),
            "conflict_dates": conflicts,
        })

    return {"cases": fa_cases, "workload": workload}
