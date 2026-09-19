"""Trust accounting: money the firm holds on a client's behalf, that client's ledger, and the
3-way reconciliation that proves none of it has moved where it shouldn't.

Trust money is held per firm. A client can retain several firms (see `org_clients` and
`auth.get_scoped_case_ids`) and each firm has its own trust bank account, so every figure
here is org-scoped -- a client's "balance" is always their balance *with this firm*."""

from datetime import date

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from app.controllers.billing import _amount_due, _recompute_invoice_status
from app.db.supabase_client import supabase
from app.middleware.auth import (
    ADMIN,
    SUPER_ADMIN,
    LAWYER,
    ensure_case_access,
    get_scoped_case_ids,
    require_roles,
)

# ─────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────

class TrustTransactionCreate(BaseModel):
    client_id: int
    case_id: int | None = None
    type: str                   # "deposit" or "disbursement"
    amount: float = Field(gt=0)
    transaction_date: date
    description: str | None = None
    org_id: int | None = None   # super-admin only; everyone else posts to their own firm


class BankStatementCreate(BaseModel):
    statement_date: date
    bank_balance: float = Field(ge=0)
    notes: str | None = None
    org_id: int | None = None


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

WRITE_TYPES = {"deposit", "disbursement"}

# Postgres raises this from the trust_guard_and_stamp trigger when an insert would take a
# client's balance below zero -- the backstop for the controller's own check, which is
# read-then-write and so can be raced by a concurrent disbursement.
_NEGATIVE_BALANCE_SQLSTATE = "23514"


def _scope_org(profile: dict, org_id: int | None) -> int:
    """The firm whose trust account this request acts on. Everyone but the super-admin acts
    as their own firm; the super-admin belongs to none and has to name one."""
    if profile["role_id"] == SUPER_ADMIN:
        if org_id is None:
            raise HTTPException(status_code=400, detail="Pass org_id: trust accounts are held per firm.")
        return org_id
    if profile.get("org_id") is None:
        raise HTTPException(status_code=500, detail="This account isn't linked to a firm. Contact support.")
    return profile["org_id"]


def _ensure_client_access(client_id: int, org_id: int, profile: dict) -> None:
    """403 unless the caller can see a case for this client. `require_roles()` checks *what*
    the caller is, not *whose* money they may touch -- without this any lawyer at any firm
    could read or draw down any client's trust balance. Calls: `get_scoped_case_ids()`."""
    case_ids = get_scoped_case_ids(profile)
    if case_ids is None:          # super-admin
        return
    if not case_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this client")
    rows = (
        supabase.table("cases")
        .select("case_id")
        .eq("client_id", client_id)
        .eq("org_id", org_id)
        .in_("case_id", list(case_ids))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=403, detail="You don't have access to this client")


def _balance_of(rows: list[dict]) -> float:
    """Deposits minus everything that left the account, over the rows given."""
    return round(
        sum(r["amount"] if r["type"] == "deposit" else -r["amount"] for r in rows), 2
    )


def _get_balance(client_id: int, org_id: int) -> float:
    """Current trust balance for a client at one firm. Derived from the ledger every time --
    never stored -- so it can't drift out of sync with the transactions behind it."""
    rows = (
        supabase.table("trust_transactions")
        .select("type,amount")
        .eq("client_id", client_id)
        .eq("org_id", org_id)
        .execute()
        .data
    )
    return _balance_of(rows)


def _insert_transaction(row: dict) -> dict:
    """Insert a ledger entry, turning the DB's negative-balance guard into the same 422 the
    controller's own check raises. See `trust_guard_and_stamp()` in
    migrate_trust_accounting.sql."""
    try:
        return supabase.table("trust_transactions").insert(row).execute().data[0]
    except Exception as exc:
        if _NEGATIVE_BALANCE_SQLSTATE in str(exc):
            raise HTTPException(
                status_code=422,
                detail={"error": "Insufficient trust funds", "requested": row["amount"]},
            )
        raise


# ─────────────────────────────────────────────────────────────
# POST /trust/transactions
# ─────────────────────────────────────────────────────────────

def create_trust_transaction(
    data: TrustTransactionCreate,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Record a deposit or disbursement against a client's trust account at the caller's
    firm. `invoice_payment` entries are not accepted here -- those only ever come from
    `pay_invoice_from_trust()`, so the ledger can't claim an invoice was settled when it
    wasn't. Calls: `_scope_org()`, `_ensure_client_access()`, `_get_balance()`."""

    if data.type not in WRITE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of: {', '.join(sorted(WRITE_TYPES))}")

    org_id = _scope_org(profile, data.org_id)
    _ensure_client_access(data.client_id, org_id, profile)

    if data.case_id is not None:
        ensure_case_access(data.case_id, profile)

    # ── Overdraft guard ──────────────────────────────────────
    # Paying one client's bill with another client's money is the violation this whole
    # system exists to prevent. Checked here for a clear error, and again in the DB (which
    # is the one that holds under concurrency).
    if data.type == "disbursement":
        balance = _get_balance(data.client_id, org_id)
        if data.amount > balance:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "Insufficient trust funds",
                    "available": balance,
                    "requested": data.amount,
                },
            )

    return _insert_transaction({
        "org_id": org_id,
        "client_id": data.client_id,
        "case_id": data.case_id,
        "type": data.type,
        "amount": data.amount,
        "transaction_date": data.transaction_date.isoformat(),
        "description": data.description,
        "created_by": profile["user_id"],
    })


# ─────────────────────────────────────────────────────────────
# GET /trust/clients/{client_id}/transactions
# ─────────────────────────────────────────────────────────────

def get_client_ledger(
    client_id: int,
    org_id: int | None = None,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """This client's trust ledger at the caller's firm, newest first. Calls: `_scope_org()`,
    `_ensure_client_access()`."""
    org = _scope_org(profile, org_id)
    _ensure_client_access(client_id, org, profile)

    rows = (
        supabase.table("trust_transactions")
        .select("*")
        .eq("client_id", client_id)
        .eq("org_id", org)
        .order("transaction_date", desc=True)
        .order("id", desc=True)
        .execute()
        .data
    )
    return {"client_id": client_id, "org_id": org, "transactions": rows}


# ─────────────────────────────────────────────────────────────
# GET /trust/clients/{client_id}/balance
# ─────────────────────────────────────────────────────────────

def get_client_balance(
    client_id: int,
    org_id: int | None = None,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """This client's current trust balance at the caller's firm. Calls: `_scope_org()`,
    `_ensure_client_access()`, `_get_balance()`."""
    org = _scope_org(profile, org_id)
    _ensure_client_access(client_id, org, profile)
    return {"client_id": client_id, "org_id": org, "balance": _get_balance(client_id, org)}


# ─────────────────────────────────────────────────────────────
# POST /invoices/{invoice_id}/pay-from-trust
# ─────────────────────────────────────────────────────────────

def pay_invoice_from_trust(
    invoice_id: int,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Settle an invoice's outstanding balance out of the client's held funds. The firm is
    taken from the invoice's case, not from a parameter -- money can only move between a
    case and the firm running it. Calls: `ensure_case_access()`, `_amount_due()`,
    `_get_balance()`, `_recompute_invoice_status()`."""
    invoice_rows = (
        supabase.table("invoices")
        .select("invoice_id,case_id,total_amount,payment_status,cases(client_id,org_id)")
        .eq("invoice_id", invoice_id)
        .execute()
        .data
    )
    if not invoice_rows:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice = invoice_rows[0]
    ensure_case_access(invoice["case_id"], profile)

    case = invoice["cases"]
    client_id, org_id = case["client_id"], case["org_id"]

    # What's left after any Razorpay or manually recorded payments -- charging
    # total_amount here would bill the client twice for the part already settled.
    due = _amount_due(invoice_id, invoice["total_amount"])
    if due <= 0:
        raise HTTPException(status_code=422, detail="This invoice is already paid.")

    balance = _get_balance(client_id, org_id)
    if due > balance:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Insufficient trust funds to pay this invoice",
                "available": balance,
                "amount_due": due,
            },
        )

    # Debit trust first: if the payments insert below fails, the client is left holding
    # money the firm hasn't taken, which is the safe side of the error to be on.
    trust_row = _insert_transaction({
        "org_id": org_id,
        "client_id": client_id,
        "case_id": invoice["case_id"],
        "type": "invoice_payment",
        "amount": due,
        "transaction_date": date.today().isoformat(),
        "description": f"Payment for invoice #{invoice_id}",
        "reference_id": invoice_id,
        "created_by": profile["user_id"],
    })

    # Record it as a payment like any other rather than writing payment_status directly:
    # billing derives that status from the payments table, so an invoice marked Paid with
    # no payment row reverts to Pending the next time anything recomputes it.
    supabase.table("payments").insert({
        "invoice_id": invoice_id,
        "amount": due,
        "payment_method": "Trust Account",
        "transaction_reference": f"trust:{trust_row['id']}",
        "payment_date": date.today().isoformat(),
        "payment_status": "Completed",
    }).execute()
    _recompute_invoice_status(invoice_id)

    return {
        "invoice_id": invoice_id,
        "client_id": client_id,
        "amount_paid": due,
        "remaining_trust_balance": _get_balance(client_id, org_id),
    }


# ─────────────────────────────────────────────────────────────
# GET /trust/reconciliation
# ─────────────────────────────────────────────────────────────

def get_reconciliation(
    as_of: date | None = None,
    org_id: int | None = None,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN)),
):
    """The monthly check that three numbers agree, for one firm as of one date:

    1. `bank_balance`  -- the trust account per the bank, hand-entered via POST /trust/bank-statements
    2. `ledger_total`  -- the firm's control total, read back from the `running_balance`
       stamped on the last entry posted
    3. `client_total`  -- the sum of every client's balance, recomputed from the amounts

    Legs 2 and 3 come from different places on purpose: 3 is derived from the transaction
    amounts, 2 is the figure recorded when each entry was posted. Editing an amount in the
    database moves one and not the other, which is the whole point of the exercise. They
    also diverge if an entry is backdated into an already-reconciled period -- also worth
    seeing.

    Calls: `_scope_org()`, `_balance_of()`."""
    as_of = as_of or date.today()
    org = _scope_org(profile, org_id)

    # ── Leg 1: bank balance (most recent statement on or before as_of) ──
    bank_rows = (
        supabase.table("trust_bank_statements")
        .select("bank_balance,statement_date")
        .eq("org_id", org)
        .lte("statement_date", as_of.isoformat())
        .order("statement_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    bank_balance = bank_rows[0]["bank_balance"] if bank_rows else None
    bank_statement_date = bank_rows[0]["statement_date"] if bank_rows else None

    tx_rows = (
        supabase.table("trust_transactions")
        .select("id,type,amount,client_id,running_balance,transaction_date")
        .eq("org_id", org)
        .lte("transaction_date", as_of.isoformat())
        .order("transaction_date")
        .order("id")
        .execute()
        .data
    )

    # ── Leg 2: control total as recorded when the last entry was posted ──
    ledger_total = round(tx_rows[-1]["running_balance"], 2) if tx_rows else 0.0

    # ── Leg 3: sum of the client subledgers, recomputed from the amounts ──
    by_client: dict[int, list[dict]] = {}
    for r in tx_rows:
        by_client.setdefault(r["client_id"], []).append(r)
    client_balances = {cid: _balance_of(rows) for cid, rows in by_client.items()}
    client_total = round(sum(client_balances.values()), 2)

    reconciled = (
        bank_balance is not None
        and round(bank_balance, 2) == ledger_total
        and client_total == ledger_total
    )

    return {
        "as_of": as_of.isoformat(),
        "org_id": org,
        "bank_balance": bank_balance,
        "bank_statement_date": bank_statement_date,
        "ledger_total": ledger_total,
        "client_total": client_total,
        "reconciled": reconciled,
        "client_balances": [
            {"client_id": cid, "balance": bal} for cid, bal in sorted(client_balances.items())
        ],
    }


# ─────────────────────────────────────────────────────────────
# POST /trust/bank-statements  (admin enters the monthly bank figure)
# ─────────────────────────────────────────────────────────────

def create_bank_statement(
    data: BankStatementCreate,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN)),
):
    """Record what the bank says the firm's trust account held on a date -- leg 1 of the
    reconciliation, entered by hand until there's a bank feed. Calls: `_scope_org()`."""
    org = _scope_org(profile, data.org_id)
    return supabase.table("trust_bank_statements").insert({
        "org_id": org,
        "statement_date": data.statement_date.isoformat(),
        "bank_balance": data.bank_balance,
        "notes": data.notes,
        "recorded_by": profile["user_id"],
    }).execute().data[0]
