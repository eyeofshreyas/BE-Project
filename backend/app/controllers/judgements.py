from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, get_current_profile, get_scoped_case_ids, require_roles
from app.models.judgements import JudgementCreate

JUDGEMENTS_SELECT = (
    "judgement_id,case_id,citation,court,bench,judgement_date,outcome,summary,"
    "relief_text,relief_amount,appeal_status,tags,cases(case_number,case_title,filing_date)"
)


def _to_judgement_summary(row: dict) -> dict:
    case = row.get("cases")
    return {
        "id": row["judgement_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
        "case_title": case["case_title"] if case else None,
        "citation": row["citation"],
        "court": row["court"],
        "bench": row["bench"],
        "judgement_date": row["judgement_date"],
        "filing_date": case["filing_date"] if case else None,
        "outcome": row["outcome"],
        "summary": row["summary"],
        "relief_text": row["relief_text"],
        "relief_amount": row["relief_amount"],
        "appeal_status": row["appeal_status"],
        "tags": row["tags"],
    }


def list_judgements(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("judgements").select(JUDGEMENTS_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("judgement_date", desc=True).execute().data
    return [_to_judgement_summary(row) for row in rows]


def create_judgement(data: JudgementCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    ensure_case_access(data.case_id, profile)
    row = supabase.table("judgements").insert({
        **data.model_dump(),
        "created_by": profile["user_id"],
    }).execute().data[0]
    result = supabase.table("judgements").select(JUDGEMENTS_SELECT).eq("judgement_id", row["judgement_id"]).execute().data[0]
    return _to_judgement_summary(result)
