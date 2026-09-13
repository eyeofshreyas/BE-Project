"""Binds case URLs to controllers.cases functions. No logic."""

from fastapi import APIRouter
from app.controllers.cases import add_lawyer_to_case, create_case, list_available_case_lawyers, list_cases, remove_lawyer_from_case
from app.controllers.case_ai_summary import get_case_ai_summary, generate_case_ai_summary, list_similar_own_cases
from app.controllers.ecourts import set_case_cnr, sync_case_from_ecourts
from app.ml.case_search import CaseSearchResult
from app.models.cases import AvailableLawyer, CaseSummary
from app.models.case_ai_summary import CaseAiSummary

router = APIRouter(tags=["cases"])

router.get("/cases", response_model=list[CaseSummary])(list_cases)
router.post("/cases", response_model=CaseSummary)(create_case)
router.post("/cases/{case_id}/lawyers", response_model=CaseSummary)(add_lawyer_to_case)
router.delete("/cases/{case_id}/lawyers/{lawyer_id}", response_model=CaseSummary)(remove_lawyer_from_case)
router.get("/cases/{case_id}/available-lawyers", response_model=list[AvailableLawyer])(list_available_case_lawyers)
router.patch("/cases/{case_id}/cnr", response_model=CaseSummary)(set_case_cnr)
router.post("/cases/{case_id}/sync-ecourts", response_model=CaseSummary)(sync_case_from_ecourts)
router.get("/cases/{case_id}/ai-summary", response_model=CaseAiSummary)(get_case_ai_summary)
router.post("/cases/{case_id}/ai-summary", response_model=CaseAiSummary)(generate_case_ai_summary)
router.get("/cases/{case_id}/similar", response_model=list[CaseSearchResult])(list_similar_own_cases)
