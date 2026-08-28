from fastapi import Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, get_current_profile, require_roles, get_scoped_case_ids, ensure_case_access

INVOICES_SELECT = (
    "invoice_id,invoice_number,amount,tax,total_amount,issue_date,due_date,payment_status,remarks,case_id,"
    "cases(case_number,clients(users(full_name)))"
)

PAYMENTS_SELECT = "payment_id,invoice_id,amount,payment_method,transaction_reference,payment_date,payment_status"

EXPENSES_SELECT = (
    "expense_id,matter_id,expense_type,description,amount,expense_date,receipt_document_id,"
    "conveyancing_matters(matter_number,case_id),users(full_name)"
)


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
    created_by: int


def _to_expense_summary(row: dict) -> dict:
    matter = row.get("conveyancing_matters")
    creator = row.get("users")
    return {
        "id": row["expense_id"],
        "matter_number": matter["matter_number"] if matter else None,
        "expense_type": row["expense_type"],
        "description": row["description"],
        "amount": row["amount"],
        "expense_date": row["expense_date"],
        "receipt_document_id": row["receipt_document_id"],
        "created_by": creator["full_name"] if creator else None,
    }


def _invoice_status_for(total_paid: float, total_amount: float) -> str:
    if total_paid >= total_amount:
        return "Paid"
    if total_paid > 0:
        return "Partially Paid"
    return "Pending"


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


def _get_invoice(invoice_id: int, case_ids: set[int] | None = None) -> dict:
    rows = supabase.table("invoices").select(INVOICES_SELECT).eq("invoice_id", invoice_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if case_ids is not None and rows[0]["case_id"] not in case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this invoice")
    return _to_invoice_summary(rows[0])


def list_invoices(profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("invoices").select(INVOICES_SELECT)
    if case_ids is not None:
        query = query.in_("case_id", list(case_ids))
    rows = query.order("invoice_id", desc=True).execute().data
    return [_to_invoice_summary(row) for row in rows]


def get_invoice(invoice_id: int, profile: dict = Depends(get_current_profile)):
    return _get_invoice(invoice_id, get_scoped_case_ids(profile))


def create_invoice(data: InvoiceCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    ensure_case_access(data.case_id, profile)
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
    return _get_invoice(row["invoice_id"])


def list_invoice_payments(invoice_id: int, profile: dict = Depends(get_current_profile)):
    _get_invoice(invoice_id, get_scoped_case_ids(profile))
    return supabase.table("payments").select(PAYMENTS_SELECT).eq("invoice_id", invoice_id).order("payment_date", desc=True).execute().data


def create_payment(data: PaymentCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    _get_invoice(data.invoice_id, get_scoped_case_ids(profile))
    payment = supabase.table("payments").insert(data.model_dump()).execute().data[0]

    invoice = supabase.table("invoices").select("total_amount").eq("invoice_id", data.invoice_id).execute().data
    if invoice:
        paid = supabase.table("payments").select("amount").eq("invoice_id", data.invoice_id).eq("payment_status", "Completed").execute().data
        total_paid = sum(p["amount"] for p in paid)
        new_status = _invoice_status_for(total_paid, invoice[0]["total_amount"])
        supabase.table("invoices").update({"payment_status": new_status}).eq("invoice_id", data.invoice_id).execute()

    return payment


def list_expenses(matter_id: int | None = None, profile: dict = Depends(get_current_profile)):
    case_ids = get_scoped_case_ids(profile)
    if case_ids is not None and not case_ids:
        return []

    query = supabase.table("miscellaneous_expenses").select(EXPENSES_SELECT)
    if matter_id is not None:
        query = query.eq("matter_id", matter_id)
    rows = query.order("expense_date", desc=True).execute().data
    if case_ids is not None:
        # ponytail: matter->case ownership filtered in Python, same pattern as
        # users.py's role filter; move to a PostgREST embedded filter if this table grows large.
        rows = [r for r in rows if r.get("conveyancing_matters") and r["conveyancing_matters"]["case_id"] in case_ids]
    return [_to_expense_summary(row) for row in rows]


def create_expense(data: ExpenseCreate, profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    matter_rows = supabase.table("conveyancing_matters").select("case_id").eq("matter_id", data.matter_id).execute().data
    if not matter_rows:
        raise HTTPException(status_code=404, detail="Matter not found")
    ensure_case_access(matter_rows[0]["case_id"], profile)

    row = supabase.table("miscellaneous_expenses").insert(data.model_dump()).execute().data[0]
    rows = supabase.table("miscellaneous_expenses").select(EXPENSES_SELECT).eq("expense_id", row["expense_id"]).execute().data
    return _to_expense_summary(rows[0])
