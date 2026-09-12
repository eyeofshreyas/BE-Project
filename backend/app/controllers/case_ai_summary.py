"""Controllers for the case-level AI summary: reuses the summarize and similar-cases ML
subprocess runners already wired up for documents (see ml/summarize.py, ml/similar_cases.py),
just fed with the case's notes + timeline text instead of a single document."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, ensure_case_access, require_roles
from app.ml.case_search import search_own_cases
from app.ml.similar_cases import FINETUNE_VENV_PYTHON, SEARCH_RUNNER
from app.ml.subprocess_utils import run_ml_subprocess
from app.ml.summarize import INFERENCE_DIR, SUMMARIZE_RUNNER

CASE_AI_SUMMARY_SELECT = "case_id,summary_text,related_cases,generated_at"

CASE_FACTS_SELECT = (
    "case_number,case_title,status,priority,filing_date,next_hearing_date,description,"
    "clients(users(full_name)),courts(court_name),case_types(case_type_name)"
)
HEARINGS_SELECT = "hearing_date,hearing_status,hearing_outcome,notes,judges(judge_name)"


def _to_case_ai_summary(row: dict) -> dict:
    """Shape a raw `case_ai_summaries` row into the CaseAiSummary dict."""
    return {
        "case_id": row["case_id"],
        "summary_text": row["summary_text"],
        "related_cases": row["related_cases"] or [],
        "generated_at": row["generated_at"],
    }


def _case_facts(case_id: int) -> list[str]:
    """The case's own columns as labelled `Field: value` lines. Facts the model is told outright
    are facts it doesn't have to invent, which is most of what went wrong when the whole case
    was handed over as one unlabelled blob."""
    rows = supabase.table("cases").select(CASE_FACTS_SELECT).eq("case_id", case_id).execute().data
    if not rows:
        return []
    row = rows[0]
    client = row.get("clients") or {}
    fields = {
        "Case number": row.get("case_number"),
        "Title": row.get("case_title"),
        "Client": (client.get("users") or {}).get("full_name"),
        "Case type": (row.get("case_types") or {}).get("case_type_name"),
        "Court": (row.get("courts") or {}).get("court_name"),
        "Status": row.get("status"),
        "Priority": row.get("priority"),
        "Filed on": row.get("filing_date"),
        "Next hearing": row.get("next_hearing_date"),
        "Description": row.get("description"),
    }
    return [f"{label}: {value}" for label, value in fields.items() if value]


def _hearing_lines(case_id: int) -> list[str]:
    """Each hearing as one line, carrying the parts a brief actually turns on -- what was decided
    and what the lawyer wrote down afterwards."""
    rows = (
        supabase.table("hearings").select(HEARINGS_SELECT)
        .eq("case_id", case_id).order("hearing_date").execute().data
    )
    lines = []
    for row in rows:
        judge = (row.get("judges") or {}).get("judge_name")
        parts = [f"{row['hearing_date']} ({row.get('hearing_status') or 'status unknown'})"]
        if judge:
            parts.append(f"before {judge}")
        if row.get("hearing_outcome"):
            parts.append(f"outcome: {row['hearing_outcome']}")
        if row.get("notes"):
            parts.append(f"notes: {row['notes']}")
        lines.append(" -- ".join(parts))
    return lines


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


def _section(heading: str, lines: list[str]) -> list[str]:
    """A labelled block, or nothing at all when the section is empty."""
    return [f"## {heading}", *lines, ""] if lines else []


def _build_case_text(case_id: int) -> str:
    """Build the case file the ML runners see: the case's own facts, its hearings, notes,
    timeline and document summaries, each under a heading so the model can tell them apart.
    Calls: `_case_facts()`, `_hearing_lines()`, `_document_summaries()`, `_section()`."""
    notes = supabase.table("case_notes").select("note").eq("case_id", case_id).execute().data
    timeline = supabase.table("case_timeline").select("event_title,event_description") \
        .eq("case_id", case_id).execute().data

    timeline_lines = [
        f"{t['event_title']}: {t['event_description']}" if t["event_description"] else t["event_title"]
        for t in timeline
    ]

    lines = _section("Case", _case_facts(case_id))
    lines += _section("Hearings", _hearing_lines(case_id))
    lines += _section("Notes", [n["note"] for n in notes])
    lines += _section("Timeline", timeline_lines)
    lines += _section("Documents", _document_summaries(case_id))
    return "\n".join(lines).strip()


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
    """Generate (or regenerate) the case's AI summary from the whole case file, and look up
    related precedent cases via the similar-cases search. Calls: `ensure_case_access()`,
    `_build_case_text()`, `run_ml_subprocess()`."""
    ensure_case_access(case_id, profile)
    text = _build_case_text(case_id)
    if not text.strip():
        raise HTTPException(status_code=400, detail="This case has nothing recorded yet to summarize")

    # mode="case" runs the base model on a brief prompt; the fine-tuned adapter only knows
    # judgment -> headnote and invents judgment boilerplate when handed a case file.
    summary = run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(SUMMARIZE_RUNNER)],
        {"text": text, "mode": "case"},
        cwd=str(INFERENCE_DIR),
        timeout=600,
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


def list_similar_own_cases(case_id: int, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Rank the caller's *other* cases against this one -- "have we handled something like this
    before" over the firm's own files, not the public reference corpus. The query is the same
    case file the summary is written from, and `search_own_cases()` applies the caller's normal
    case scoping, so a lawyer is only ever matched against cases they're assigned to.
    Calls: `ensure_case_access()`, `_build_case_text()`, `search_own_cases()`."""
    ensure_case_access(case_id, profile)
    text = _build_case_text(case_id)
    if not text.strip():
        return []
    return search_own_cases(profile, text, top_k=5, exclude_case_id=case_id)
