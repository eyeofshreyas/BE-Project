"""Controllers for the case-level AI summary: reuses the summarize and similar-cases ML
subprocess runners already wired up for documents (see ml/summarize.py, ml/similar_cases.py),
just fed with the case's notes + timeline text instead of a single document."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, require_roles
from app.ml.similar_cases import FINETUNE_VENV_PYTHON, SEARCH_RUNNER
from app.ml.subprocess_utils import run_ml_subprocess
from app.ml.summarize import INFERENCE_DIR, SUMMARIZE_RUNNER

CASE_AI_SUMMARY_SELECT = "case_id,summary_text,related_cases,generated_at"


def _to_case_ai_summary(row: dict) -> dict:
    """Shape a raw `case_ai_summaries` row into the CaseAiSummary dict."""
    return {
        "case_id": row["case_id"],
        "summary_text": row["summary_text"],
        "related_cases": row["related_cases"] or [],
        "generated_at": row["generated_at"],
    }


def _document_summaries(case_id: int) -> list[str]:
    """The AI summaries of the case's documents -- the closest thing to the filings' own text
    that's stored, since document files live in Storage and are never read back here."""
    docs = supabase.table("documents").select("document_id").eq("case_id", case_id).execute().data
    if not docs:
        return []
    rows = (
        supabase.table("ai_summaries")
        .select("summary_text")
        .in_("document_id", [d["document_id"] for d in docs])
        .execute()
        .data
    )
    return [row["summary_text"] for row in rows if row.get("summary_text")]


def _build_case_text(case_id: int) -> str:
    """Concatenates a case's notes, timeline events and document summaries into one text blob
    for the ML runners -- so the summary and the precedent search both see the whole case, not
    one filing. Calls: `_document_summaries()`."""
    notes = supabase.table("case_notes").select("note").eq("case_id", case_id).execute().data
    timeline = supabase.table("case_timeline").select("event_title,event_description") \
        .eq("case_id", case_id).execute().data

    lines = [n["note"] for n in notes]
    lines += [
        f"{t['event_title']}: {t['event_description']}" if t["event_description"] else t["event_title"]
        for t in timeline
    ]
    lines += _document_summaries(case_id)
    return "\n".join(lines)


def get_case_ai_summary(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Fetch the stored AI summary for a case, if one has been generated. Staff-only: the
    summary is written from the case's notes (see `_build_case_text()`), which are private to
    the firm, so it inherits their audience. Calls: `ensure_case_access()`."""
    ensure_case_access(case_id, profile)
    rows = supabase.table("case_ai_summaries").select(CASE_AI_SUMMARY_SELECT).eq("case_id", case_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="No AI summary generated for this case yet")
    return _to_case_ai_summary(rows[0])


def generate_case_ai_summary(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Generate (or regenerate) the case's AI summary from its notes + timeline, and look up
    related precedent cases via the similar-cases search. Calls: `ensure_case_access()`,
    `_build_case_text()`, `run_ml_subprocess()`."""
    ensure_case_access(case_id, profile)
    text = _build_case_text(case_id)
    if not text.strip():
        raise HTTPException(status_code=400, detail="This case has no notes, timeline or document summaries yet to summarize")

    summary = run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(SUMMARIZE_RUNNER)], {"text": text}, cwd=str(INFERENCE_DIR), timeout=600,
    )
    related = run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(SEARCH_RUNNER)], {"query": text, "top_k": 3}, timeout=120,
    )

    row = {
        "case_id": case_id,
        "summary_text": summary["summary"],
        "related_cases": [{"doc_id": r["doc_id"], "score": r["score"]} for r in related],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("case_ai_summaries").upsert(row, on_conflict="case_id").execute()
    return _to_case_ai_summary(row)
