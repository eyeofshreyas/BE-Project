"""Pydantic response schemas for the admin console: overview stats, the platform-wide
activity feed, analytics, and platform settings."""

from pydantic import BaseModel, EmailStr


class AdminStats(BaseModel):
    """Counts behind the admin dashboard's overview cards."""
    total_users: int
    active_lawyers: int
    registered_clients: int
    active_cases: int
    documents_uploaded: int
    ai_summaries: int
    revenue_this_month: float
    pending_hearings: int


class ActivityEvent(BaseModel):
    """One platform-wide `case_timeline` row, shaped for the recent-activity feed."""
    id: int
    event_type: str
    event_title: str
    event_description: str | None
    case_number: str | None
    actor: str | None
    created_at: str


class LabelCount(BaseModel):
    """A single labelled bucket in a chart (status slice, month, week)."""
    label: str
    count: int


class DocumentInsights(BaseModel):
    """Document totals for the analytics tab's insight cards."""
    total: int
    summarized: int
    awaiting_summary: int
    deleted: int


class StorageUsage(BaseModel):
    """Bytes stored across live documents, against the configured quota."""
    used_bytes: int
    quota_bytes: int


class AdminAnalytics(BaseModel):
    """Everything the analytics tab charts."""
    total_cases: int
    case_status: list[LabelCount]
    case_growth: list[LabelCount]
    ai_usage: list[LabelCount]
    documents: DocumentInsights
    storage: StorageUsage


class LawyerInviteCreate(BaseModel):
    """Request body for inviting a lawyer into the caller's organization."""
    email: EmailStr


class FirmAnalyticsCase(BaseModel):
    """One case row shaped for the Firm Analytics tab's exposure filters and sum."""
    case_id: int
    case_title: str | None
    client: str | None
    client_id: int | None
    case_type: str | None
    status: str
    claim_value: float | None
    lawyer_ids: list[int]
    lawyers: list[str]


class LawyerWorkload(BaseModel):
    """One lawyer's row in the Counsel Workload table."""
    lawyer_id: int
    lawyer_name: str
    active_cases: int
    upcoming_hearings: int
    conflict_dates: list[str]


class FirmAnalytics(BaseModel):
    """Everything the Firm Analytics tab renders."""
    cases: list[FirmAnalyticsCase]
    workload: list[LawyerWorkload]
