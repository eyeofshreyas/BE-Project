"""Binds reference/lookup-data URLs to controllers.reference functions. No logic."""

from fastapi import APIRouter
from app.controllers.reference import list_roles, list_case_types, list_courts, list_judges, create_judge, list_document_types
from app.models.reference import Role, CaseType, Court, Judge, JudgeCreate, DocumentType

router = APIRouter(prefix="/reference", tags=["reference"])

router.get("/roles", response_model=list[Role])(list_roles)
router.get("/case-types", response_model=list[CaseType])(list_case_types)
router.get("/courts", response_model=list[Court])(list_courts)
router.get("/judges", response_model=list[Judge])(list_judges)
router.post("/judges", response_model=Judge)(create_judge)
router.get("/document-types", response_model=list[DocumentType])(list_document_types)
