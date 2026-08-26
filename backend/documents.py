from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import supabase

router = APIRouter(tags=["documents"])

DOCUMENTS_SELECT = (
    "document_id,file_name,mime_type,upload_date,"
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


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents():
    rows = supabase.table("documents").select(DOCUMENTS_SELECT).eq("is_deleted", False).order("document_id").execute().data
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


@router.get("/documents/{document_id}/summary", response_model=AiSummary)
def get_document_summary(document_id: int):
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
