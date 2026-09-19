"""Binds trust-accounting URLs to controllers.trust functions. No logic."""

from fastapi import APIRouter
from app.controllers.trust import (
    create_bank_statement,
    create_trust_transaction,
    get_client_balance,
    get_client_ledger,
    get_reconciliation,
    pay_invoice_from_trust,
)

router = APIRouter(prefix="/trust", tags=["trust-accounting"])

router.post("/transactions")(create_trust_transaction)
router.get("/clients/{client_id}/transactions")(get_client_ledger)
router.get("/clients/{client_id}/balance")(get_client_balance)
router.get("/reconciliation")(get_reconciliation)
router.post("/bank-statements")(create_bank_statement)

# Lives under /invoices rather than /trust -- it's an action on an invoice.
invoice_trust_router = APIRouter(tags=["trust-accounting"])
invoice_trust_router.post("/invoices/{invoice_id}/pay-from-trust")(pay_invoice_from_trust)
