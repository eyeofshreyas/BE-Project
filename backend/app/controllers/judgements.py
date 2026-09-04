"""Controllers for case judgements: list (case-scoped) and create."""

from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, get_current_profile, get_scoped_case_ids, require_roles
from app.models.judgements import JudgementCreate

JUDGEMENTS_SELECT = (
    "judgement_id,case_id,citation,court,bench,judgement_date,outcome,summary,reasoning,"
    "relief_text,relief_amount,appeal_status,tags,"
    "cases(case_number,case_title,filing_date,clients(users(full_name)),case_types(case_type_name))"
)


def _to_judgement_summary(row: dict) -> dict:
    """Shape a raw `judgements` row (joined with cases/clients/case_types) into the JudgementSummary dict."""
    case = row.get("cases")
    client = case.get("clients") if case else None
    case_type = case.get("case_types") if case else None
    return {
        "id": row["judgement_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
        "case_title": case["case_title"] if case else None,
        "client_name": client["users"]["full_name"] if client else None,
        "matter_type": case_type["case_type_name"] if case_type else None,
        "citation": row["citation"],
        "court": row["court"],
        "bench": row["bench"],
        "judgement_date": row["judgement_date"],
        "filing_date": case["filing_date"] if case else None,
        "outcome": row["outcome"],
        "summary": row["summary"],
        "reasoning": row.get("reasoning"),
        "relief_text": row["relief_text"],
        "relief_amount": row["relief_amount"],
        "appeal_status": row["appeal_status"],
        "tags": row["tags"],
    }


def list_judgements(profile: dict = Depends(get_current_profile)):
    """List judgements for cases in the caller's scope. Calls: `get_scoped_case_ids()`,
    `_to_judgement_summary()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("judgements").select(JUDGEMENTS_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("judgement_date", desc=True).execute().data
    return [_to_judgement_summary(row) for row in rows]


def create_judgement(data: JudgementCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Create a judgement for a case the caller has access to. Calls: `ensure_case_access()`,
    `_to_judgement_summary()`."""
    ensure_case_access(data.case_id, profile)
    row = supabase.table("judgements").insert({
        **data.model_dump(),
        "created_by": profile["user_id"],
    }).execute().data[0]
    result = supabase.table("judgements").select(JUDGEMENTS_SELECT).eq("judgement_id", row["judgement_id"]).execute().data[0]
    return _to_judgement_summary(result)
