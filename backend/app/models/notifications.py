from pydantic import BaseModel


class NotificationSummary(BaseModel):
    id: int
    case_id: int | None
    case_number: str | None
    title: str | None
    message: str | None
    notification_type: str
    is_read: bool
    created_at: str
