"""AI summarize endpoint: mounted directly in main.py. Shells out to the fine-tuned LoRA
model running in finetune-summarizer/.venv via subprocess_utils.run_ml_subprocess()."""

import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.controllers.documents import extract_document_text
from app.middleware.auth import ADMIN, SUPER_ADMIN, LAWYER, require_roles, ensure_case_access
from app.ml.subprocess_utils import run_ml_subprocess

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[3]
FINETUNE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / ".venv" / "bin" / "python"
INFERENCE_DIR = REPO_ROOT / "finetune-summarizer" / "inference"
SUMMARIZE_RUNNER = Path(__file__).resolve().parent / "runners" / "summarize_runner.py"

# "Court Order" is the only document_types entry that matches what the LoRA adapter was
# actually trained on (Supreme Court judgment -> headnote). Everything else -- Affidavit,
# Contract, Identity Proof, and any custom type -- goes to mode="case" (base model, no
# adapter) instead of forcing judgment-headnote-shaped output onto a document the adapter
# has never seen the like of.
JUDGMENT_DOCUMENT_TYPE = "Court Order"


def _mode_for(type_name: str | None) -> str:
    """Maps a document_types.type_name to the summarizer mode. No type known (pasted text with
    no document_id) keeps the pre-existing default of "judgment" so that path is unchanged."""
    if type_name is None:
        return "judgment"
    return "judgment" if type_name == JUDGMENT_DOCUMENT_TYPE else "case"


class SummarizeRequest(BaseModel):
    """Request body: a document_id, raw text, or both. With a document_id and no text, the text
    is read out of the stored file; text wins when both are given, so a scanned document can
    still be summarized by pasting it."""
    text: str = ""
    document_id: int | None = None


class SummarizeResponse(BaseModel):
    """Response body for a summarize call. status is "done" when summary is already the
    result (pasted text, or no document_id -- both fast enough to answer inline) and
    "pending" when document_id triggered a background extraction+inference job; poll
    GET /documents/{id}/summary for the result in that case."""
    summary: str = ""
    status: str = "done"


def _run_summarize_job(document_id: int, file_path: str, mime_type: str | None, mode: str) -> None:
    """Background counterpart to summarize_text's inline path: extracts the stored file's
    text (OCR included) and runs the model subprocess, then writes the outcome into
    ai_summaries. There's no request left to raise an HTTPException to by the time this
    runs, so failures land in ai_summaries.status/error_message instead."""
    try:
        text = extract_document_text(file_path, mime_type)
        if not text:
            raise ValueError("This file has no text layer (a scan?) and OCR found nothing.")

        result = run_ml_subprocess(
            [str(FINETUNE_VENV_PYTHON), str(SUMMARIZE_RUNNER)],
            {"text": text, "mode": mode},
            cwd=str(INFERENCE_DIR),
            timeout=600,
        )
        supabase.table("ai_summaries").upsert({
            "document_id": document_id,
            "summary_text": result["summary"],
            "status": "done",
            "error_message": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()
    except Exception as exc:
        message = exc.detail if isinstance(exc, HTTPException) else str(exc)
        logger.exception("Background summarize failed for document %s", document_id)
        supabase.table("ai_summaries").upsert({
            "document_id": document_id,
            "status": "error",
            "error_message": str(message)[:500],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()


@router.post("/summarize", response_model=SummarizeResponse)
def summarize_text(
    data: SummarizeRequest,
    background_tasks: BackgroundTasks,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Summarize text via the LoRA model subprocess. With a document_id and no posted text,
    extracting the stored file's text (OCR included) and running the model is slow enough to
    move off the request thread: this queues a background job and returns status="pending"
    immediately. Posted text (pasted, skipping extraction) is answered inline either way.
    Calls: `ensure_case_access()`, `_run_summarize_job()` (queued) or `extract_document_text()` +
    `run_ml_subprocess()` (inline), `supabase.table("ai_summaries").upsert()`."""
    text = data.text.strip()
    doc_row = None
    if data.document_id is not None:
        doc_rows = (
            supabase.table("documents")
            .select("case_id,file_path,mime_type,document_types(type_name)")
            .eq("document_id", data.document_id)
            .execute()
            .data
        )
        if not doc_rows:
            raise HTTPException(status_code=404, detail="Document not found")
        ensure_case_access(doc_rows[0]["case_id"], profile)
        doc_row = doc_rows[0]

    mode = _mode_for(doc_row["document_types"]["type_name"] if doc_row and doc_row["document_types"] else None)

    if doc_row is not None and not text:
        supabase.table("ai_summaries").upsert({
            "document_id": data.document_id,
            "status": "pending",
            "error_message": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()
        background_tasks.add_task(
            _run_summarize_job, data.document_id, doc_row["file_path"], doc_row["mime_type"], mode
        )
        return SummarizeResponse(status="pending")

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
        {"text": text, "mode": mode},
        cwd=str(INFERENCE_DIR),
        timeout=600,
    )

    if data.document_id is not None:
        # ai_summaries.document_id is unique -- one summary per document.
        supabase.table("ai_summaries").upsert({
            "document_id": data.document_id,
            "summary_text": result["summary"],
            "status": "done",
            "error_message": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()

    return SummarizeResponse(summary=result["summary"], status="done")
