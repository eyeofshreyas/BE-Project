"""Binds document URLs to controllers.documents functions. No logic."""

from fastapi import APIRouter
from app.controllers.documents import list_documents, get_document_summary, upload_document, get_document_download_url, delete_document
from app.models.documents import DocumentSummary, AiSummary, DownloadUrl

router = APIRouter(tags=["documents"])

router.get("/documents", response_model=list[DocumentSummary])(list_documents)
router.get("/documents/{document_id}/summary", response_model=AiSummary)(get_document_summary)
router.get("/documents/{document_id}/download", response_model=DownloadUrl)(get_document_download_url)
router.post("/cases/{case_id}/documents", response_model=DocumentSummary)(upload_document)
router.delete("/documents/{document_id}")(delete_document)
