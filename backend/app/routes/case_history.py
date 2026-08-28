from fastapi import APIRouter
from app.controllers.case_history import (
    list_case_notes,
    NoteSummary,
    add_case_note,
    list_case_timeline,
    TimelineEvent,
    list_status_history,
    StatusHistoryEntry,
    change_case_status,
)

router = APIRouter(tags=["case-history"])

router.get("/cases/{case_id}/notes", response_model=list[NoteSummary])(list_case_notes)
router.post("/cases/{case_id}/notes", response_model=NoteSummary)(add_case_note)
router.get("/cases/{case_id}/timeline", response_model=list[TimelineEvent])(list_case_timeline)
router.get("/cases/{case_id}/status-history", response_model=list[StatusHistoryEntry])(list_status_history)
router.patch("/cases/{case_id}/status", response_model=StatusHistoryEntry)(change_case_status)
