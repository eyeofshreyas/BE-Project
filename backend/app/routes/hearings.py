from fastapi import APIRouter
from app.controllers.hearings import (
    list_hearings,
    get_hearing,
    create_hearing,
    update_hearing,
)
from app.models.hearings import HearingSummary

router = APIRouter(prefix="/hearings", tags=["hearings"])

router.get("", response_model=list[HearingSummary])(list_hearings)
router.get("/{hearing_id}", response_model=HearingSummary)(get_hearing)
router.post("", response_model=HearingSummary)(create_hearing)
router.patch("/{hearing_id}", response_model=HearingSummary)(update_hearing)
