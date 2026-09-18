"""Trust accounting: client money held by the firm, ledger, balance, and 3-way reconciliation."""

from datetime import date
from decimal import Decimal

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, SUPER_ADMIN, LAWYER, get_current_profile, require_roles

# ─────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────

class TrustTransactionCreate(BaseModel):
    client_id: int
    case_id: int | None = None
    type: str                   # "deposit" or "disbursement"
    amount: float
    transaction_date: date
    description: str | None = None


class BankStatementCreate(BaseModel):
    statement_date: date
    bank_balance: float
    notes: str | None = None


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

WRITE_TYPES = {"deposit", "disbursement"}


def _get_balance(client_id: int) -> float:
    """Return current trust balance for a client (deposits minus outflows)."""
    rows = supabase.table("trust_transactions") \
        .select("type,amount") \
        .eq("client_id", client_id) \
        .execute().data

    deposits = sum(r["amount"] for r in rows if r["type"] == "deposit")
    outflows = sum(r["amount"] for r in rows if r["type"] in ("disbursement", "invoice_payment"))
    return round(deposits - outflows, 2)


def _client_exists(client_id: int) -> bool:
    rows = supabase.table("clients").select("client_id").eq("client_id", client_id).execute().data
    return len(rows) > 0


# ─────────────────────────────────────────────────────────────
# POST /trust/transactions
# ─────────────────────────────────────────────────────────────

def create_trust_transaction(
    data: TrustTransactionCreate,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Record a deposit or disbursement against a client trust account."""

    if data.type not in WRITE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of: {', '.join(sorted(WRITE_TYPES))}")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be a positive number")

    if not _client_exists(data.client_id):
        raise HTTPException(status_code=404, detail="Client not found")

    # ── Overdraft guard ──────────────────────────────────────
    if data.type == "disbursement":
        balance = _get_balance(data.client_id)
        if data.amount > balance:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "Insufficient trust funds",
                    "available": balance,
                    "requested": data.amount,
                },
            )

    row = supabase.table("trust_transactions").insert({
        "client_id": data.client_id,
        "case_id": data.case_id,
        "type": data.type,
        "amount": data.amount,
        "transaction_date": data.transaction_date.isoformat(),
        "description": data.description,
        "created_by": profile["user_id"],
    }).execute().data[0]

    return row


# ─────────────────────────────────────────────────────────────
# GET /trust/clients/{client_id}/transactions
# ─────────────────────────────────────────────────────────────

def get_client_ledger(
    client_id: int,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Return all trust transactions for a client, newest first."""
    if not _client_exists(client_id):
        raise HTTPException(status_code=404, detail="Client not found")

    rows = supabase.table("trust_transactions") \
        .select("*") \
        .eq("client_id", client_id) \
        .order("transaction_date", desc=True) \
        .execute().data

    return {"client_id": client_id, "transactions": rows}


# ─────────────────────────────────────────────────────────────
# GET /trust/clients/{client_id}/balance
# ─────────────────────────────────────────────────────────────

def get_client_balance(
    client_id: int,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Return the current trust balance for a client."""
    if not _client_exists(client_id):
        raise HTTPException(status_code=404, detail="Client not found")

    return {"client_id": client_id, "balance": _get_balance(client_id)}


# ─────────────────────────────────────────────────────────────
# POST /invoices/{invoice_id}/pay-from-trust
# ─────────────────────────────────────────────────────────────

def pay_invoice_from_trust(
    invoice_id: int,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Settle an invoice by transferring the owed amount from the client's trust account."""
    invoice_rows = supabase.table("invoices") \
        .select("invoice_id,case_id,total_amount,payment_status,cases(client_id)") \
        .eq("invoice_id", invoice_id) \
        .execute().data

    if not invoice_rows:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice = invoice_rows[0]

    if invoice["payment_status"] == "Paid":
        raise HTTPException(status_code=422, detail="Invoice is already paid")

    client_id = invoice["cases"]["client_id"]
    invoice_amount = invoice["total_amount"]
    balance = _get_balance(client_id)

    if invoice_amount > balance:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Insufficient trust funds to pay this invoice",
                "available": balance,
                "invoice_amount": invoice_amount,
            },
        )

    # Record the debit on trust ledger
    supabase.table("trust_transactions").insert({
        "client_id": client_id,
        "case_id": invoice["case_id"],
        "type": "invoice_payment",
        "amount": invoice_amount,
        "transaction_date": date.today().isoformat(),
        "description": f"Payment for invoice #{invoice_id}",
        "reference_id": invoice_id,
        "created_by": profile["user_id"],
    }).execute()

    # Mark invoice as Paid
    supabase.table("invoices").update({
        "payment_status": "Paid"
    }).eq("invoice_id", invoice_id).execute()

    return {
        "invoice_id": invoice_id,
        "client_id": client_id,
        "amount_paid": invoice_amount,
        "remaining_trust_balance": _get_balance(client_id),
    }


# ─────────────────────────────────────────────────────────────
# GET /trust/reconciliation
# ─────────────────────────────────────────────────────────────

def get_reconciliation(
    as_of: date = date.today(),
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN)),
):
    """3-way reconciliation: bank balance vs ledger total vs sum of all client balances."""

    # ── Bank balance (most recent statement on or before as_of) ──
    bank_rows = supabase.table("trust_bank_statements") \
        .select("bank_balance,statement_date") \
        .lte("statement_date", as_of.isoformat()) \
        .order("statement_date", desc=True) \
        .limit(1) \
        .execute().data

    bank_balance = bank_rows[0]["bank_balance"] if bank_rows else None
    bank_statement_date = bank_rows[0]["statement_date"] if bank_rows else None

    # ── Ledger total (all transactions up to as_of) ───────────
    tx_rows = supabase.table("trust_transactions") \
        .select("type,amount,client_id") \
        .lte("transaction_date", as_of.isoformat()) \
        .execute().data

    deposits = sum(r["amount"] for r in tx_rows if r["type"] == "deposit")
    outflows = sum(r["amount"] for r in tx_rows if r["type"] in ("disbursement", "invoice_payment"))
    ledger_total = round(deposits - outflows, 2)

    # ── Per-client balances ───────────────────────────────────
    client_balances: dict[int, float] = {}
    for r in tx_rows:
        cid = r["client_id"]
        if cid not in client_balances:
            client_balances[cid] = 0.0
        if r["type"] == "deposit":
            client_balances[cid] += r["amount"]
        else:
            client_balances[cid] -= r["amount"]

    client_total = round(sum(client_balances.values()), 2)

    reconciled = (
        bank_balance is not None
        and round(bank_balance, 2) == ledger_total
        and client_total == ledger_total
    )

    return {
        "as_of": as_of.isoformat(),
        "bank_balance": bank_balance,
        "bank_statement_date": bank_statement_date,
        "ledger_total": ledger_total,
        "client_total": client_total,
        "reconciled": reconciled,
        "client_balances": [
            {"client_id": cid, "balance": round(bal, 2)}
            for cid, bal in sorted(client_balances.items())
        ],
    }


# ─────────────────────────────────────────────────────────────
# POST /trust/bank-statements  (admin enters monthly bank figure)
# ─────────────────────────────────────────────────────────────

def create_bank_statement(
    data: BankStatementCreate,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN)),
):
    """Record the bank's trust account balance for a given date (used in reconciliation)."""
    if data.bank_balance < 0:
        raise HTTPException(status_code=400, detail="bank_balance cannot be negative")

    row = supabase.table("trust_bank_statements").insert({
        "statement_date": data.statement_date.isoformat(),
        "bank_balance": data.bank_balance,
        "notes": data.notes,
        "recorded_by": profile["user_id"],
    }).execute().data[0]

    return row
