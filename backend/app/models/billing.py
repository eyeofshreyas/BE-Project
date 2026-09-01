from pydantic import BaseModel


class InvoiceSummary(BaseModel):
    id: int
    invoice_number: str
    case_number: str | None
    client: str | None
    amount: float
    tax: float | None
    total_amount: float
    issue_date: str
    due_date: str | None
    payment_status: str


class InvoiceCreate(BaseModel):
    case_id: int
    invoice_number: str
    amount: float
    tax: float = 0
    total_amount: float
    issue_date: str
    due_date: str | None = None
    remarks: str | None = None


class PaymentSummary(BaseModel):
    payment_id: int
    invoice_id: int
    amount: float
    payment_method: str | None
    transaction_reference: str | None
    payment_date: str
    payment_status: str


class PaymentCreate(BaseModel):
    invoice_id: int
    amount: float
    payment_method: str | None = None
    transaction_reference: str | None = None
    payment_date: str
    payment_status: str = "Completed"


class ExpenseSummary(BaseModel):
    id: int
    matter_number: str | None
    expense_type: str
    description: str | None
    amount: float
    expense_date: str
    receipt_document_id: int | None
    created_by: str | None


class ExpenseCreate(BaseModel):
    matter_id: int
    expense_type: str
    description: str | None = None
    amount: float
    expense_date: str
    receipt_document_id: int | None = None
    # ignored server-side (set from the authenticated profile) -- kept
    # optional so old clients that still send it don't break.
    created_by: int | None = None
