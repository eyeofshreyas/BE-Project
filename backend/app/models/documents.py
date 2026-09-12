"""Pydantic request/response schemas for uploaded documents and AI-generated summaries."""

from pydantic import BaseModel


class DocumentSummary(BaseModel):
    """Document row shaped for list responses."""
    id: int
    file_name: str
    mime_type: str
    upload_date: str
    file_size: int | None
    document_type: str | None
    case_number: str | None
    uploaded_by: str | None
    has_summary: bool
    esign_status: str | None


class SignerInfo(BaseModel):
    """One signer to invite for e-signature."""
    name: str
    email: str


class SignatureRequestCreate(BaseModel):
    """Request body for sending a document for e-signature."""
    signers: list[SignerInfo]


class DownloadUrl(BaseModel):
    """Signed URL response for downloading a document."""
    url: str


class AiSummary(BaseModel):
    """AI-generated document summary, translation, and extracted metadata."""
    summary_text: str
    translated_text: str | None
    keywords: str | None
    important_dates: str | None
    important_sections: str | None
