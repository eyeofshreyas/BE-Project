from fastapi import Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_profile, get_scoped_case_ids

DOCUMENTS_SELECT = (
    "document_id,file_name,mime_type,upload_date,case_id,"
    "document_types(type_name),cases(case_number),users(full_name)"
)


class DocumentSummary(BaseModel):
    id: int
    file_name: str
    mime_type: str
    upload_date: str
    document_type: str | None
    case_number: str | None
    uploaded_by: str | None


class AiSummary(BaseModel):
    summary_text: str
    translated_text: str | None
    keywords: str | None
    important_dates: str | None
    important_sections: str | None


def list_documents(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("documents").select(DOCUMENTS_SELECT).eq("is_deleted", False)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("document_id").execute().data
    return [
        {
            "id": row["document_id"],
            "file_name": row["file_name"],
            "mime_type": row["mime_type"],
            "upload_date": row["upload_date"],
            "document_type": row["document_types"]["type_name"] if row["document_types"] else None,
            "case_number": row["cases"]["case_number"] if row["cases"] else None,
            "uploaded_by": row["users"]["full_name"] if row["users"] else None,
        }
        for row in rows
    ]


def get_document_summary(document_id: int, profile: dict = Depends(get_current_profile)):
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
