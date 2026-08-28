from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import supabase

router = APIRouter(prefix="/notifications", tags=["notifications"])

NOTIFICATIONS_SELECT = "notification_id,case_id,title,message,notification_type,is_read,created_at,cases(case_number)"


class NotificationSummary(BaseModel):
    id: int
    case_id: int | None
    case_number: str | None
    title: str | None
    message: str | None
    notification_type: str
    is_read: bool
    created_at: str


def _to_notification(row: dict) -> dict:
    case = row.get("cases")
    return {
        "id": row["notification_id"],
        "case_id": row["case_id"],
        "case_number": case["case_number"] if case else None,
        "title": row["title"],
        "message": row["message"],
        "notification_type": row["notification_type"],
        "is_read": row["is_read"],
        "created_at": row["created_at"],
    }


@router.get("", response_model=list[NotificationSummary])
def list_notifications(user_id: int, unread_only: bool = False):
    query = supabase.table("notifications").select(NOTIFICATIONS_SELECT).eq("user_id", user_id)
    if unread_only:
        query = query.eq("is_read", False)
    rows = query.order("created_at", desc=True).execute().data
    return [_to_notification(row) for row in rows]


@router.patch("/{notification_id}/read", response_model=NotificationSummary)
def mark_read(notification_id: int):
    rows = supabase.table("notifications").update({"is_read": True}).eq("notification_id", notification_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Notification not found")
    result = supabase.table("notifications").select(NOTIFICATIONS_SELECT).eq("notification_id", notification_id).execute().data
    return _to_notification(result[0])


@router.post("/read-all")
def mark_all_read(user_id: int):
    supabase.table("notifications").update({"is_read": True}).eq("user_id", user_id).eq("is_read", False).execute()
    return {"message": "All notifications marked as read."}
