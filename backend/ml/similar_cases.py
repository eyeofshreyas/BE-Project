import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[2]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
SEARCH_RUNNER = Path(__file__).resolve().parent / "runners" / "search_runner.py"


class SimilarCasesRequest(BaseModel):
    query: str
    top_k: int = 5


class SimilarCaseResult(BaseModel):
    doc_id: str
    score: float
    excerpt: str


@router.post("/similar-cases", response_model=list[SimilarCaseResult])
def similar_cases(data: SimilarCasesRequest):
    # ponytail: reloads the embedding model + FAISS index on every call (a few
    # seconds). Fine for now; move to a long-lived worker if latency matters.
    proc = subprocess.run(
        [str(FINETUNE_VENV_PYTHON), str(SEARCH_RUNNER)],
        input=json.dumps({"query": data.query, "top_k": data.top_k}),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr[-2000:])
    return json.loads(proc.stdout)
