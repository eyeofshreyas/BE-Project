"""AI case-search endpoint: mounted directly in main.py. Semantic search over the caller's *own*
cases -- as opposed to /ai/similar-cases, which searches the public IN-Abs judgment corpus.
Answers "have we handled something like this before". Shells out to sentence-transformers
running in finetune-summarizer/.venv via run_ml_subprocess()."""

from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_profile, get_scoped_case_ids
from app.ml.subprocess_utils import run_ml_subprocess

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[3]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
CASE_SEARCH_RUNNER = Path(__file__).resolve().parent / "runners" / "case_search_runner.py"

CASE_SEARCH_SELECT = "case_id,case_number,case_title,description"
EXCERPT_CHARS = 240


class CaseSearchRequest(BaseModel):
    """Request body: free-text query plus how many cases to return."""
    query: str
    top_k: int = 5


class CaseSearchResult(BaseModel):
    """One own-case search hit."""
    case_id: int
    case_number: str | None
    case_title: str | None
    score: float
    excerpt: str


def _searchable_text(row: dict, summary_text: str | None) -> str:
    """The text a case is matched on -- its title, description and AI summary joined."""
    return "\n".join(part for part in (row.get("case_title"), row.get("description"), summary_text) if part)


@router.post("/case-search", response_model=list[CaseSearchResult])
def case_search(data: CaseSearchRequest, profile: dict = Depends(get_current_profile)):
    """Semantically rank the caller's own cases against a free-text query.

    Scoped through `get_scoped_case_ids()` the same way `list_cases()` is, so a lawyer only
    ever searches cases they're actively assigned to and a client only their own -- the
    subprocess is handed that filtered corpus and never sees anything wider.
    Calls: `get_scoped_case_ids()`, `_searchable_text()`, `run_ml_subprocess()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("cases").select(CASE_SEARCH_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.execute().data
    if not rows:
        return []

    summary_rows = (
        supabase.table("case_ai_summaries")
        .select("case_id,summary_text")
        .in_("case_id", [row["case_id"] for row in rows])
        .execute()
        .data
    )
    summaries = {row["case_id"]: row["summary_text"] for row in summary_rows}

    texts = {row["case_id"]: _searchable_text(row, summaries.get(row["case_id"])) for row in rows}
    # a case with no title, description or summary has nothing to match on
    docs = [{"case_id": cid, "text": text} for cid, text in texts.items() if text.strip()]
    if not docs:
        return []

    hits = run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(CASE_SEARCH_RUNNER)],
        {"query": data.query, "top_k": data.top_k, "docs": docs},
        timeout=120,
    )

    by_id = {row["case_id"]: row for row in rows}
    return [
        {
            "case_id": hit["case_id"],
            "case_number": by_id[hit["case_id"]].get("case_number"),
            "case_title": by_id[hit["case_id"]].get("case_title"),
            "score": hit["score"],
            "excerpt": texts[hit["case_id"]][:EXCERPT_CHARS],
        }
        for hit in hits
    ]
