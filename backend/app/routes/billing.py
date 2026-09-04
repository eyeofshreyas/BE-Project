"""Binds billing URLs (invoices, payments, expenses) to controllers.billing functions. No logic."""

from fastapi import APIRouter
from app.controllers.billing import (
    list_invoices,
    get_invoice,
    create_invoice,
    send_invoice_reminder,
    list_invoice_payments,
    create_payment,
    create_razorpay_order,
    verify_razorpay_payment,
    list_expenses,
    create_expense,
)
from app.models.billing import InvoiceSummary, PaymentSummary, ExpenseSummary, RazorpayOrder

router = APIRouter(prefix="/billing", tags=["billing"])

router.get("/invoices", response_model=list[InvoiceSummary])(list_invoices)
router.get("/invoices/{invoice_id}", response_model=InvoiceSummary)(get_invoice)
router.post("/invoices", response_model=InvoiceSummary)(create_invoice)
router.post("/invoices/{invoice_id}/remind")(send_invoice_reminder)
router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentSummary])(list_invoice_payments)
router.post("/payments", response_model=PaymentSummary)(create_payment)
router.post("/invoices/{invoice_id}/razorpay-order", response_model=RazorpayOrder)(create_razorpay_order)
router.post("/invoices/{invoice_id}/razorpay-verify", response_model=PaymentSummary)(verify_razorpay_payment)
router.get("/expenses", response_model=list[ExpenseSummary])(list_expenses)
router.post("/expenses", response_model=ExpenseSummary)(create_expense)
