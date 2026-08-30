from pydantic import BaseModel


class Stats(BaseModel):
    active_matters: int
    pending_registrations: int
    completed_registrations: int
    upcoming_appointments: int


class StatusCount(BaseModel):
    label: str
    count: int


class MatterSummary(BaseModel):
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
    stats: Stats
    status_breakdown: list[StatusCount]
    recent_matters: list[MatterSummary]


class Property(BaseModel):
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
    diligence_id: int
    title_clear: bool | None
    tax_verified: bool | None
    encumbrance_checked: bool | None
    litigation_checked: bool | None
    lawyer_name: str | None
    remarks: str | None
    completed_at: str | None


class DueDiligenceUpdate(BaseModel):
    title_clear: bool | None = None
    tax_verified: bool | None = None
    encumbrance_checked: bool | None = None
    litigation_checked: bool | None = None
    remarks: str | None = None


class ProgressStage(BaseModel):
    progress_id: int
    stage_name: str
    stage_order: int
    completed: bool
    completed_at: str | None
    remarks: str | None


class PropertyRegistration(BaseModel):
    registration_id: int
    office_name: str | None
    registration_number: str | None
    registration_date: str | None
    deed_number: str | None
    registration_status: str | None
    registered_by: str | None
    remarks: str | None


class MatterDocument(BaseModel):
    matter_document_id: int
    document_id: int
    file_name: str | None
    is_required: bool
    is_verified: bool
    verified_by: str | None


class MatterDetail(BaseModel):
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
