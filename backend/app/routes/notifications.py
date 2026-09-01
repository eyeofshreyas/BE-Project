"""Binds notification URLs to controllers.notifications functions. No logic."""

from fastapi import APIRouter
from app.controllers.notifications import list_notifications, mark_read, mark_all_read
from app.models.notifications import NotificationSummary

router = APIRouter(prefix="/notifications", tags=["notifications"])

router.get("", response_model=list[NotificationSummary])(list_notifications)
router.patch("/{notification_id}/read", response_model=NotificationSummary)(mark_read)
router.post("/read-all")(mark_all_read)
