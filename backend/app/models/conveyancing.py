"""Pydantic request/response schemas for conveyancing matters (property transactions)."""

from pydantic import BaseModel


class Stats(BaseModel):
    """Aggregate conveyancing counts shown on the summary dashboard."""
    active_matters: int
    pending_registrations: int
    completed_registrations: int
    upcoming_appointments: int


class StatusCount(BaseModel):
    """Count of matters grouped by a status label."""
    label: str
    count: int


class MatterSummary(BaseModel):
    """Conveyancing matter row shaped for list responses."""
    matter_id: int
    case_id: int | None
    number: str
    title: str
    client: str | None
    type: str
    property: str | None
    lawyer: str | None
    reg_date: str | None
    status: str


class ConveyancingSummary(BaseModel):
    """Combined dashboard payload: stats, status breakdown, and recent matters."""
    stats: Stats
    status_breakdown: list[StatusCount]
    recent_matters: list[MatterSummary]


class Property(BaseModel):
    """Property details attached to a conveyancing matter."""
    property_id: int
    property_name: str
    address: str
    city: str | None
    state: str | None
    property_type: str | None
    survey_number: str | None
    market_value: float | None
    land_area: float | None
    builtup_area: float | None


class DueDiligence(BaseModel):
    """Due-diligence checklist state for a matter."""
    diligence_id: int
    title_clear: bool | None
    tax_verified: bool | None
    encumbrance_checked: bool | None
    litigation_checked: bool | None
    lawyer_name: str | None
    remarks: str | None
    completed_at: str | None


class DueDiligenceUpdate(BaseModel):
    """Request body for updating a matter's due-diligence checklist."""
    title_clear: bool | None = None
    tax_verified: bool | None = None
    encumbrance_checked: bool | None = None
    litigation_checked: bool | None = None
    remarks: str | None = None


class ProgressStage(BaseModel):
    """One stage in a matter's registration progress pipeline."""
    progress_id: int
    stage_name: str
    stage_order: int
    completed: bool
    completed_at: str | None
    remarks: str | None


class PropertyRegistration(BaseModel):
    """Registration office record for a matter."""
    registration_id: int
    office_name: str | None
    registration_number: str | None
    registration_date: str | None
    deed_number: str | None
    registration_status: str | None
    registered_by: str | None
    remarks: str | None


class MatterDocument(BaseModel):
    """Document attached to a matter, with verification state."""
    matter_document_id: int
    document_id: int
    file_name: str | None
    is_required: bool
    is_verified: bool
    verified_by: str | None


class MatterCreate(BaseModel):
    """Request body for creating a conveyancing matter from the Create New Matter form. `cases`
    requires a client/court/case_type, so `client_id` is mandatory here even though the form's
    other fields are optional -- create_matter() opens a lightweight case under the hood."""
    matter_name: str
    matter_type: str
    client_id: int
    priority: str = "Medium"
    property_address: str | None = None
    property_type: str | None = None
    title_number: str | None = None
    sale_value: float | None = None
    target_settlement_date: str | None = None


class MatterCreated(BaseModel):
    """Response after creating a matter."""
    matter_id: int
    matter_number: str


class MatterDetail(BaseModel):
    """Full matter detail response: property, due diligence, progress, registration, and documents."""
    matter_id: int
    matter_number: str
    matter_type: str | None
    transaction_type: str | None
    registration_status: str | None
    completion_percentage: int
    expected_completion_date: str | None
    property: Property | None
    due_diligence: DueDiligence | None
    progress: list[ProgressStage]
    registration: PropertyRegistration | None
    documents: list[MatterDocument]
