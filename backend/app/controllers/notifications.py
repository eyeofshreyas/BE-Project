from fastapi import Depends, HTTPException
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, get_current_profile
from app.models.notifications import NotificationSummary

NOTIFICATIONS_SELECT = "notification_id,case_id,title,message,notification_type,is_read,created_at,cases(case_number)"


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


def list_notifications(unread_only: bool = False, profile: dict = Depends(get_current_profile)):
    query = supabase.table("notifications").select(NOTIFICATIONS_SELECT).eq("user_id", profile["user_id"])
    if unread_only:
        query = query.eq("is_read", False)
    rows = query.order("created_at", desc=True).execute().data
    return [_to_notification(row) for row in rows]


def mark_read(notification_id: int, profile: dict = Depends(get_current_profile)):
    rows = supabase.table("notifications").select("user_id").eq("notification_id", notification_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Notification not found")
    if rows[0]["user_id"] != profile["user_id"] and profile["role_id"] != ADMIN:
        raise HTTPException(status_code=403, detail="This notification doesn't belong to you")

    supabase.table("notifications").update({"is_read": True}).eq("notification_id", notification_id).execute()
    result = supabase.table("notifications").select(NOTIFICATIONS_SELECT).eq("notification_id", notification_id).execute().data
    return _to_notification(result[0])


def mark_all_read(profile: dict = Depends(get_current_profile)):
    supabase.table("notifications").update({"is_read": True}).eq("user_id", profile["user_id"]).eq("is_read", False).execute()
    return {"message": "All notifications marked as read."}
