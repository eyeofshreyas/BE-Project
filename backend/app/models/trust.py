"""Pydantic request/response schemas for trust accounting: the client-money ledger,
balances, and 3-way reconciliation."""

from datetime import date

from pydantic import BaseModel, Field


class TrustTransactionCreate(BaseModel):
    """Request body for recording a deposit or disbursement against a client's trust account."""
    client_id: int
    case_id: int | None = None
    type: str                   # "deposit" or "disbursement"
    amount: float = Field(gt=0)
    transaction_date: date
    description: str | None = None
    # Only the super-admin sends this: they belong to no firm, and trust accounts are
    # held per firm. Everyone else posts to their own and this is ignored.
    org_id: int | None = None


class TrustTransactionSummary(BaseModel):
    """A trust_transactions row shaped for ledger responses."""
    id: int
    client_id: int
    case_id: int | None
    type: str                   # "deposit" | "disbursement" | "invoice_payment"
    amount: float
    transaction_date: str
    description: str | None
    created_at: str


class TrustLedger(BaseModel):
    """One client's trust ledger at one firm."""
    client_id: int
    org_id: int
    transactions: list[TrustTransactionSummary]


class TrustBalance(BaseModel):
    """What one client currently has held at one firm."""
    client_id: int
    org_id: int
    balance: float


class TrustPayment(BaseModel):
    """Result of settling an invoice out of the client's held funds."""
    invoice_id: int
    client_id: int
    amount_paid: float
    remaining_trust_balance: float


class BankStatementCreate(BaseModel):
    """Request body for recording what the bank says the trust account held on a date."""
    statement_date: date
    bank_balance: float = Field(ge=0)
    notes: str | None = None
    org_id: int | None = None   # super-admin only, as above


class BankStatementSummary(BaseModel):
    """A trust_bank_statements row shaped for responses."""
    id: int
    org_id: int
    statement_date: str
    bank_balance: float
    notes: str | None


class ClientTrustBalance(BaseModel):
    """One client's share of the firm's trust total, as of the reconciliation date."""
    client_id: int
    balance: float


class TrustReconciliation(BaseModel):
    """The three totals that have to agree, for one firm as of one date. `ledger_total` and
    `client_total` are derived from different places on purpose -- see
    `controllers.trust.get_reconciliation()`."""
    as_of: str
    org_id: int
    bank_balance: float | None
    bank_statement_date: str | None
    ledger_total: float
    client_total: float
    reconciled: bool
    client_balances: list[ClientTrustBalance]
