from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import supabase

router = APIRouter(prefix="/billing", tags=["billing"])

INVOICES_SELECT = (
    "invoice_id,invoice_number,amount,tax,total_amount,issue_date,due_date,payment_status,remarks,"
    "cases(case_number,clients(users(full_name)))"
)

PAYMENTS_SELECT = "payment_id,invoice_id,amount,payment_method,transaction_reference,payment_date,payment_status"


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


def _to_invoice_summary(row: dict) -> dict:
    case = row.get("cases")
    return {
        "id": row["invoice_id"],
        "invoice_number": row["invoice_number"],
        "case_number": case["case_number"] if case else None,
        "client": case["clients"]["users"]["full_name"] if case and case.get("clients") else None,
        "amount": row["amount"],
        "tax": row["tax"],
        "total_amount": row["total_amount"],
        "issue_date": row["issue_date"],
        "due_date": row["due_date"],
        "payment_status": row["payment_status"],
    }


@router.get("/invoices", response_model=list[InvoiceSummary])
def list_invoices():
    rows = supabase.table("invoices").select(INVOICES_SELECT).order("invoice_id", desc=True).execute().data
    return [_to_invoice_summary(row) for row in rows]


@router.get("/invoices/{invoice_id}", response_model=InvoiceSummary)
def get_invoice(invoice_id: int):
    rows = supabase.table("invoices").select(INVOICES_SELECT).eq("invoice_id", invoice_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _to_invoice_summary(rows[0])


@router.post("/invoices", response_model=InvoiceSummary)
def create_invoice(data: InvoiceCreate):
    row = supabase.table("invoices").insert({
        "case_id": data.case_id,
        "invoice_number": data.invoice_number,
        "amount": data.amount,
        "tax": data.tax,
        "total_amount": data.total_amount,
        "issue_date": data.issue_date,
        "due_date": data.due_date,
        "remarks": data.remarks,
        "payment_status": "Pending",
    }).execute().data[0]
    return get_invoice(row["invoice_id"])


@router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentSummary])
def list_invoice_payments(invoice_id: int):
    return supabase.table("payments").select(PAYMENTS_SELECT).eq("invoice_id", invoice_id).order("payment_date", desc=True).execute().data


@router.post("/payments", response_model=PaymentSummary)
def create_payment(data: PaymentCreate):
    payment = supabase.table("payments").insert(data.model_dump()).execute().data[0]

    invoice = supabase.table("invoices").select("total_amount").eq("invoice_id", data.invoice_id).execute().data
    if invoice:
        paid = supabase.table("payments").select("amount").eq("invoice_id", data.invoice_id).eq("payment_status", "Completed").execute().data
        total_paid = sum(p["amount"] for p in paid)
        new_status = "Paid" if total_paid >= invoice[0]["total_amount"] else "Partially Paid" if total_paid > 0 else "Pending"
        supabase.table("invoices").update({"payment_status": new_status}).eq("invoice_id", data.invoice_id).execute()

    return payment
