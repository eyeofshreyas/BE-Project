"""FastAPI router for trust accounting endpoints — mounted in main.py."""

from datetime import date
from fastapi import APIRouter
from app.controllers.trust import (
    create_trust_transaction,
    get_client_ledger,
    get_client_balance,
    pay_invoice_from_trust,
    get_reconciliation,
    create_bank_statement,
)

router = APIRouter(prefix="/trust", tags=["Trust Accounting"])

router.add_api_route("/transactions",                         create_trust_transaction, methods=["POST"])
router.add_api_route("/clients/{client_id}/transactions",     get_client_ledger,        methods=["GET"])
router.add_api_route("/clients/{client_id}/balance",          get_client_balance,       methods=["GET"])
router.add_api_route("/reconciliation",                       get_reconciliation,       methods=["GET"])
router.add_api_route("/bank-statements",                      create_bank_statement,    methods=["POST"])

# This one lives under /invoices to match the issue spec
invoice_trust_router = APIRouter(tags=["Trust Accounting"])
invoice_trust_router.add_api_route(
    "/invoices/{invoice_id}/pay-from-trust",
    pay_invoice_from_trust,
    methods=["POST"],
)
