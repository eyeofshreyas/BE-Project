"""AI similar-case search endpoints: mounted directly in main.py. Search shells out to the FAISS +
sentence-transformers index running in finetune-summarizer/.venv via run_ml_subprocess(); the
detail endpoint just reads the matched judgment straight off disk from the same IN-Abs corpus
the index was built over."""

import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.middleware.auth import get_current_profile
from app.ml.subprocess_utils import run_ml_subprocess

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[3]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
SEARCH_RUNNER = Path(__file__).resolve().parent / "runners" / "search_runner.py"

# the same corpus build_index.py embedded, so every doc_id the search returns resolves here
IN_ABS = REPO_ROOT / "finetune-summarizer" / "data_prep" / "raw" / "dataset" / "IN-Abs"
CORPUS_DIRS = [IN_ABS / "train-data", IN_ABS / "test-data"]
DOC_ID_RE = re.compile(r"[0-9A-Za-z_-]+\.txt")


class SimilarCasesRequest(BaseModel):
    """Request body: free-text query plus how many results to return."""
    query: str
    top_k: int = 5


class SimilarCaseResult(BaseModel):
    """One similar-case search hit."""
    doc_id: str
    score: float
    excerpt: str


@router.post("/similar-cases", response_model=list[SimilarCaseResult])
def similar_cases(data: SimilarCasesRequest, profile: dict = Depends(get_current_profile)):
    """Run a semantic similarity search over case documents via the FAISS subprocess.
    Calls: `run_ml_subprocess()`.
    ponytail: reloads the embedding model + FAISS index on every call (a few
    seconds). Fine for now; move to a long-lived worker if latency matters."""
    return run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(SEARCH_RUNNER)],
        {"query": data.query, "top_k": data.top_k},
        timeout=120,
    )


class SimilarCaseDetail(BaseModel):
    """The full judgment behind one search hit, plus the corpus's own headnote summary."""
    doc_id: str
    citation: str | None
    summary: str | None
    text: str


@router.get("/similar-cases/{doc_id}", response_model=SimilarCaseDetail)
def similar_case_detail(doc_id: str, profile: dict = Depends(get_current_profile)):
    """Return the full text of one IN-Abs judgment by the `doc_id` a /similar-cases hit carries.
    The corpus is public reference material, so it isn't scoped to the caller -- but doc_id is
    matched against DOC_ID_RE before it ever touches a path, so it can't walk out of the corpus."""
    if not DOC_ID_RE.fullmatch(doc_id):
        raise HTTPException(status_code=400, detail="Invalid document id")

    for corpus_dir in CORPUS_DIRS:
        judgement = corpus_dir / "judgement" / doc_id
        if not judgement.is_file():
            continue
        text = judgement.read_text(errors="ignore").strip()
        summary_path = corpus_dir / "summary" / doc_id
        summary = summary_path.read_text(errors="ignore").strip() if summary_path.is_file() else None
        # the first line of an IN-Abs judgment is its appeal/petition number
        citation = next((line.strip() for line in text.splitlines() if line.strip()), None)
        return {"doc_id": doc_id, "citation": citation, "summary": summary, "text": text}

    raise HTTPException(status_code=404, detail="Judgement not found in the reference corpus")
