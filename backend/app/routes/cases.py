"""Binds case URLs to controllers.cases functions. No logic."""

from fastapi import APIRouter
from app.controllers.cases import create_case, list_cases, unassign_lawyer
from app.controllers.case_ai_summary import get_case_ai_summary, generate_case_ai_summary, list_similar_own_cases
from app.ml.case_search import CaseSearchResult
from app.models.cases import CaseSummary
from app.models.case_ai_summary import CaseAiSummary

router = APIRouter(tags=["cases"])

router.get("/cases", response_model=list[CaseSummary])(list_cases)
router.post("/cases", response_model=CaseSummary)(create_case)
router.post("/cases/{case_id}/unassign-lawyer", response_model=CaseSummary)(unassign_lawyer)
router.get("/cases/{case_id}/ai-summary", response_model=CaseAiSummary)(get_case_ai_summary)
router.post("/cases/{case_id}/ai-summary", response_model=CaseAiSummary)(generate_case_ai_summary)
router.get("/cases/{case_id}/similar", response_model=list[CaseSearchResult])(list_similar_own_cases)
