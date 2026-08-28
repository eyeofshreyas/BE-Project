from fastapi import APIRouter
from app.controllers.meetings import (
    list_meetings,
    MeetingSummary,
    get_meeting,
    create_meeting,
    list_participants,
    ParticipantSummary,
    add_participant,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])

router.get("", response_model=list[MeetingSummary])(list_meetings)
router.get("/{meeting_id}", response_model=MeetingSummary)(get_meeting)
router.post("", response_model=MeetingSummary)(create_meeting)
router.get("/{meeting_id}/participants", response_model=list[ParticipantSummary])(list_participants)
router.post("/{meeting_id}/participants", response_model=ParticipantSummary)(add_participant)
