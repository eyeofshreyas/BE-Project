"""Binds trust-accounting URLs (ledger, balances, reconciliation) to controllers.trust
functions. No logic."""

from fastapi import APIRouter
from app.controllers.trust import (
    create_bank_statement,
    create_trust_transaction,
    get_client_balance,
    get_client_ledger,
    get_reconciliation,
    pay_invoice_from_trust,
)
from app.models.trust import (
    BankStatementSummary,
    TrustBalance,
    TrustLedger,
    TrustPayment,
    TrustReconciliation,
    TrustTransactionSummary,
)

router = APIRouter(prefix="/trust", tags=["trust-accounting"])

router.post("/transactions", response_model=TrustTransactionSummary)(create_trust_transaction)
router.get("/clients/{client_id}/transactions", response_model=TrustLedger)(get_client_ledger)
router.get("/clients/{client_id}/balance", response_model=TrustBalance)(get_client_balance)
router.get("/reconciliation", response_model=TrustReconciliation)(get_reconciliation)
router.post("/bank-statements", response_model=BankStatementSummary)(create_bank_statement)

# Lives under /invoices rather than /trust -- it's an action on an invoice.
invoice_trust_router = APIRouter(tags=["trust-accounting"])
invoice_trust_router.post("/invoices/{invoice_id}/pay-from-trust", response_model=TrustPayment)(pay_invoice_from_trust)
