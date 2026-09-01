"""Binds case URLs to controllers.cases functions. No logic."""

from fastapi import APIRouter
from app.controllers.cases import create_case, list_cases, unassign_lawyer
from app.models.cases import CaseSummary

router = APIRouter(tags=["cases"])

router.get("/cases", response_model=list[CaseSummary])(list_cases)
router.post("/cases", response_model=CaseSummary)(create_case)
router.post("/cases/{case_id}/unassign-lawyer", response_model=CaseSummary)(unassign_lawyer)
