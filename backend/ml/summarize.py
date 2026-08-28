import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase_client import supabase
from auth import ADMIN, LAWYER, require_roles

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[2]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
INFERENCE_DIR = REPO_ROOT / "finetune-summarizer" / "inference"
SUMMARIZE_RUNNER = Path(__file__).resolve().parent / "runners" / "summarize_runner.py"


class SummarizeRequest(BaseModel):
    text: str
    document_id: int | None = None


class SummarizeResponse(BaseModel):
    summary: str


@router.post("/summarize", response_model=SummarizeResponse)
def summarize_text(data: SummarizeRequest, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    # ponytail: reloads the 1B model + LoRA adapter on every call (tens of
    # seconds on a laptop GPU). Fine for now; a long-lived worker is the
    # upgrade path if latency matters.
    proc = subprocess.run(
        [str(FINETUNE_VENV_PYTHON), str(SUMMARIZE_RUNNER)],
        input=json.dumps({"text": data.text}),
        capture_output=True,
        text=True,
        cwd=str(INFERENCE_DIR),
        timeout=600,
    )
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr[-2000:])

    last_line = proc.stdout.strip().splitlines()[-1]
    result = json.loads(last_line)

    if data.document_id is not None:
        # ai_summaries.document_id is unique -- one summary per document.
        supabase.table("ai_summaries").upsert({
            "document_id": data.document_id,
            "summary_text": result["summary"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()

    return result
