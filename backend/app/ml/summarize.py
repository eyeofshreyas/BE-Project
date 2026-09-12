"""AI summarize endpoint: mounted directly in main.py. Shells out to the fine-tuned LoRA
model running in finetune-summarizer/.venv via subprocess_utils.run_ml_subprocess()."""

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.controllers.documents import extract_document_text
from app.middleware.auth import ADMIN, LAWYER, require_roles, ensure_case_access
from app.ml.subprocess_utils import run_ml_subprocess

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[3]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
INFERENCE_DIR = REPO_ROOT / "finetune-summarizer" / "inference"
SUMMARIZE_RUNNER = Path(__file__).resolve().parent / "runners" / "summarize_runner.py"


class SummarizeRequest(BaseModel):
    """Request body: a document_id, raw text, or both. With a document_id and no text, the text
    is read out of the stored file; text wins when both are given, so a scanned document can
    still be summarized by pasting it."""
    text: str = ""
    document_id: int | None = None


class SummarizeResponse(BaseModel):
    """Response body for a summarize call."""
    summary: str


@router.post("/summarize", response_model=SummarizeResponse)
def summarize_text(data: SummarizeRequest, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    """Summarize text via the LoRA model subprocess. With a document_id, checks case access,
    falls back to the stored file's own text when none was posted, and upserts the result into
    ai_summaries. Calls: `ensure_case_access()`, `extract_document_text()`, `run_ml_subprocess()`,
    `supabase.table("ai_summaries").upsert()`."""
    text = data.text.strip()
    if data.document_id is not None:
        doc_rows = (
            supabase.table("documents")
            .select("case_id,file_path,mime_type")
            .eq("document_id", data.document_id)
            .execute()
            .data
        )
        if not doc_rows:
            raise HTTPException(status_code=404, detail="Document not found")
        ensure_case_access(doc_rows[0]["case_id"], profile)
        if not text:
            text = extract_document_text(doc_rows[0]["file_path"], doc_rows[0]["mime_type"])

    if not text:
        raise HTTPException(
            status_code=400,
            detail="No text to summarize -- this file has no text layer (a scan?). Paste its text instead.",
        )

    # ponytail: reloads the 1B model + LoRA adapter on every call (tens of
    # seconds on a laptop GPU). Fine for now; a long-lived worker is the
    # upgrade path if latency matters.
    result = run_ml_subprocess(
        [str(FINETUNE_VENV_PYTHON), str(SUMMARIZE_RUNNER)],
        {"text": text},
        cwd=str(INFERENCE_DIR),
        timeout=600,
    )

    if data.document_id is not None:
        # ai_summaries.document_id is unique -- one summary per document.
        supabase.table("ai_summaries").upsert({
            "document_id": data.document_id,
            "summary_text": result["summary"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()

    return result
