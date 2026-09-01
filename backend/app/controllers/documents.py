"""Controllers for case documents: list, upload (to Supabase Storage), delete (soft),
download URL, and fetching an AI-generated summary."""

import uuid

from fastapi import Depends, File, Form, HTTPException, UploadFile
from app.db.supabase_client import supabase
from app.middleware.auth import ensure_case_access, get_current_profile, get_scoped_case_ids
from app.models.documents import DocumentSummary, AiSummary

DOCUMENTS_BUCKET = "documents"
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

    content = file.file.read()
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


def get_document_download_url(document_id: int, profile: dict = Depends(get_current_profile)):
    """Return a short-lived signed Supabase Storage URL for a document the caller has access to.
    Calls: `get_scoped_case_ids()`."""
    case_ids = get_scoped_case_ids(profile)
    rows = supabase.table("documents").select("case_id,file_path").eq("document_id", document_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this document")

    signed = supabase.storage.from_(DOCUMENTS_BUCKET).create_signed_url(rows[0]["file_path"], 300)
    return {"url": signed["signedURL"]}


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
