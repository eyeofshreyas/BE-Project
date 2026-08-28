# ponytail self-check for _invoice_status_for (the payment-status math
# create_payment relies on to keep invoices in sync) and for the case-scoping
# fix on billing writes -- a lawyer scoped to case 10 must not be able to
# invoice, pay, or expense against case 20.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.billing import (
    _invoice_status_for,
    create_invoice,
    create_payment,
    create_expense,
    InvoiceCreate,
    PaymentCreate,
    ExpenseCreate,
)


def _fake_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        return m

    fake.table.side_effect = table
    return fake


LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}


def test_create_invoice_rejects_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)):
        try:
            create_invoice(
                InvoiceCreate(case_id=20, invoice_number="INV-1", amount=100, total_amount=100, issue_date="2026-01-01"),
                profile,
            )
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_create_payment_rejects_invoice_on_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    invoice_row = {"invoice_id": 7, "case_id": 20}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.billing.supabase", _fake_supabase({"invoices": [invoice_row]})):
        try:
            create_payment(PaymentCreate(invoice_id=7, amount=100, payment_date="2026-01-01"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_create_expense_rejects_matter_on_out_of_scope_case():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    matter_row = {"matter_id": 3, "case_id": 20}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.billing.supabase", _fake_supabase({"conveyancing_matters": [matter_row]})):
        try:
            create_expense(
                ExpenseCreate(matter_id=3, expense_type="Filing Fee", amount=50, expense_date="2026-01-01", created_by=1),
                profile,
            )
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_no_payments_is_pending():
    assert _invoice_status_for(0, 1000) == "Pending"


def test_partial_payment_is_partially_paid():
    assert _invoice_status_for(400, 1000) == "Partially Paid"


def test_full_payment_is_paid():
    assert _invoice_status_for(1000, 1000) == "Paid"


def test_overpayment_is_paid():
    assert _invoice_status_for(1200, 1000) == "Paid"


if __name__ == "__main__":
    test_create_invoice_rejects_out_of_scope_case()
    test_create_payment_rejects_invoice_on_out_of_scope_case()
    test_create_expense_rejects_matter_on_out_of_scope_case()
    test_no_payments_is_pending()
    test_partial_payment_is_partially_paid()
    test_full_payment_is_paid()
    test_overpayment_is_paid()
    print("ok")
