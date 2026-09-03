"""Binds conveyancing matter URLs to controllers.conveyancing functions. No logic."""

from fastapi import APIRouter
from app.controllers.conveyancing import (
    conveyancing_summary,
    create_matter,
    get_matter_detail,
    update_due_diligence,
    complete_progress_stage,
)
from app.models.conveyancing import ConveyancingSummary, MatterDetail, MatterCreate, MatterCreated, DueDiligence, ProgressStage

router = APIRouter(prefix="/conveyancing", tags=["conveyancing"])

router.get("/summary", response_model=ConveyancingSummary)(conveyancing_summary)
router.post("/matters", response_model=MatterCreated)(create_matter)
router.get("/matters/{matter_id}", response_model=MatterDetail)(get_matter_detail)
router.patch("/matters/{matter_id}/due-diligence", response_model=DueDiligence)(update_due_diligence)
router.patch("/matters/{matter_id}/progress/{progress_id}", response_model=ProgressStage)(complete_progress_stage)
