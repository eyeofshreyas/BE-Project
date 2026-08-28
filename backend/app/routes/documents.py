from fastapi import APIRouter
from app.controllers.documents import list_documents, get_document_summary
from app.models.documents import DocumentSummary, AiSummary

router = APIRouter(tags=["documents"])

router.get("/documents", response_model=list[DocumentSummary])(list_documents)
router.get("/documents/{document_id}/summary", response_model=AiSummary)(get_document_summary)
