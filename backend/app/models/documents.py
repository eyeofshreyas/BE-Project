from pydantic import BaseModel


class DocumentSummary(BaseModel):
    id: int
    file_name: str
    mime_type: str
    upload_date: str
    file_size: int | None
    document_type: str | None
    case_number: str | None
    uploaded_by: str | None
    has_summary: bool


class DownloadUrl(BaseModel):
    url: str


class AiSummary(BaseModel):
    summary_text: str
    translated_text: str | None
    keywords: str | None
    important_dates: str | None
    important_sections: str | None
