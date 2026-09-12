"""Controllers for case documents: list, upload (to Supabase Storage), delete (soft),
download URL, extracting a stored file's text, and fetching an AI-generated summary."""

import io
import uuid

from fastapi import Depends, File, Form, HTTPException, UploadFile
from storage3.exceptions import StorageApiError
from app.db.supabase_client import supabase
from app.middleware.auth import ensure_case_access, get_current_profile, get_scoped_case_ids
from app.models.documents import DocumentSummary, AiSummary

DOCUMENTS_BUCKET = "documents"
TEXT_MIME_PREFIX = "text/"
# Same ceiling message attachments use (see messages.MAX_ATTACHMENT_BYTES).
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
DOCUMENTS_SELECT = (
    "document_id,file_name,mime_type,upload_date,file_size,case_id,file_path,"
    "document_types(type_name),cases(case_number),users(full_name)"
)


def _to_document_summary(row: dict, has_summary: bool = False) -> dict:
    """Shape a raw `documents` row (joined with document_types/cases/users) into the DocumentSummary dict."""
    return {
        "id": row["document_id"],
        "file_name": row["file_name"],
        "mime_type": row["mime_type"],
        "upload_date": row["upload_date"],
        "file_size": row["file_size"],
        "document_type": row["document_types"]["type_name"] if row["document_types"] else None,
        "case_number": row["cases"]["case_number"] if row["cases"] else None,
        "uploaded_by": row["users"]["full_name"] if row["users"] else None,
        "has_summary": has_summary,
    }


def list_documents(profile: dict = Depends(get_current_profile)):
    """List non-deleted documents visible to the caller, flagging which already have an AI summary.
    Calls: `get_scoped_case_ids()`, `_to_document_summary()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("documents").select(DOCUMENTS_SELECT).eq("is_deleted", False)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("document_id").execute().data

    summarized_ids: set[int] = set()
    if rows:
        summary_rows = supabase.table("ai_summaries").select("document_id").in_(
            "document_id", [r["document_id"] for r in rows]
        ).execute().data
        summarized_ids = {r["document_id"] for r in summary_rows}

    return [_to_document_summary(row, row["document_id"] in summarized_ids) for row in rows]


def delete_document(document_id: int, profile: dict = Depends(get_current_profile)):
    """Soft-delete a document (sets is_deleted=True) the caller has access to. Calls: `ensure_case_access()`."""
    rows = supabase.table("documents").select("case_id").eq("document_id", document_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    ensure_case_access(rows[0]["case_id"], profile)
    supabase.table("documents").update({"is_deleted": True}).eq("document_id", document_id).execute()
    return {"message": "Document deleted"}


def read_upload(file: UploadFile) -> bytes:
    """Read an upload into memory, refusing an empty file or one over MAX_DOCUMENT_BYTES.

    Reads one byte past the cap rather than the whole file, so an oversized upload never
    gets fully buffered in the API process. Starlette has already spooled the request body
    by the time a handler runs, so this bounds memory and stops the storage write -- it
    does not stop the bytes arriving. A Content-Length check in middleware would, if
    someone uploading 2 GB of video becomes a real problem."""
    content = file.file.read(MAX_DOCUMENT_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="That file is empty")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="Documents are limited to 25 MB")
    return content


def upload_document(
    case_id: int,
    document_type_id: int = Form(...),
    file: UploadFile = File(...),
    profile: dict = Depends(get_current_profile),
):
    """Upload a file to Supabase Storage under case-{case_id}/ and record it in `documents`.
    case_id is bound from the URL path (routes/documents.py's /cases/{case_id}/documents), not
    the multipart body. Calls: `ensure_case_access()`, `_to_document_summary()`."""
    ensure_case_access(case_id, profile)

    content = read_upload(file)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    storage_path = f"case-{case_id}/{uuid.uuid4().hex}.{ext}"
    supabase.storage.from_(DOCUMENTS_BUCKET).upload(
        storage_path, content, {"content-type": file.content_type or "application/octet-stream"}
    )

    row = supabase.table("documents").insert({
        "case_id": case_id,
        "document_type_id": document_type_id,
        "uploaded_by": profile["user_id"],
        "file_name": file.filename or storage_path,
        "file_path": storage_path,
        "file_size": len(content),
        "mime_type": file.content_type,
    }).execute().data[0]

    result = supabase.table("documents").select(DOCUMENTS_SELECT).eq("document_id", row["document_id"]).execute().data[0]
    return _to_document_summary(result)


def get_document_download_url(document_id: int, download: bool = False, profile: dict = Depends(get_current_profile)):
    """Return a short-lived signed Supabase Storage URL for a document the caller has access to.
    `download=true` marks the URL as an attachment so the browser saves instead of opening it inline.
    Calls: `get_scoped_case_ids()`."""
    case_ids = get_scoped_case_ids(profile)
    rows = supabase.table("documents").select("case_id,file_path").eq("document_id", document_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this document")

    options = {"download": True} if download else None
    try:
        signed = supabase.storage.from_(DOCUMENTS_BUCKET).create_signed_url(rows[0]["file_path"], 300, options)
    except StorageApiError:
        # The documents row outlived its stored object (seed rows that were never
        # uploaded, a file cleared from the bucket). Say so instead of 500ing --
        # every preview/open/download button routes through here.
        raise HTTPException(status_code=404, detail="This document's file is no longer in storage.")
    return {"url": signed["signedURL"]}


def extract_document_text(file_path: str, mime_type: str | None) -> str:
    """Download a stored document and return its text, for feeding to the summarizer.

    Handles the two kinds that carry a text layer: PDFs (via pypdf) and text/* files. A scanned
    PDF is all image, so pypdf returns nothing -- the caller reports that rather than summarizing
    an empty string.
    ponytail: no OCR, and no Word/image support -- pasting the text still works for those. Add
    an OCR pass if scanned uploads turn out to be common."""
    try:
        content = supabase.storage.from_(DOCUMENTS_BUCKET).download(file_path)
    except StorageApiError:
        raise HTTPException(status_code=404, detail="This document's file is no longer in storage.")

    if (mime_type or "").startswith(TEXT_MIME_PREFIX):
        return content.decode("utf-8", "replace").strip()

    if mime_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Text can only be read from PDF and text files. Paste the text to summarize it.",
        )

    from pypdf import PdfReader  # local import: only the summarize path pays for it

    try:
        pages = PdfReader(io.BytesIO(content)).pages
    except Exception:
        raise HTTPException(status_code=400, detail="This PDF could not be read. Paste the text instead.")
    return "\n".join(page.extract_text() or "" for page in pages).strip()


def get_document_summary(document_id: int, profile: dict = Depends(get_current_profile)):
    """Return the latest AI-generated summary/translation for a document the caller has access to;
    404 if none exists yet. Calls: `get_scoped_case_ids()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None:
        doc_rows = supabase.table("documents").select("case_id").eq("document_id", document_id).execute().data
        if not doc_rows or doc_rows[0]["case_id"] not in case_ids:
            raise HTTPException(status_code=403, detail="You don't have access to this document")

    rows = (
        supabase.table("ai_summaries")
        .select("summary_text,translated_text,keywords,important_dates,important_sections")
        .eq("document_id", document_id)
        .order("summary_id", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No AI summary for this document yet.")
    return rows[0]
