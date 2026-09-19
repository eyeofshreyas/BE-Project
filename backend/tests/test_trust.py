"""Trust accounting -- issue #5. Controllers are called directly with a profile dict in
place of the `Depends(...)` default, the same way the rest of this suite does it."""

import pytest
from datetime import date
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.controllers.trust import (
    create_bank_statement,
    create_trust_transaction,
    get_client_balance,
    get_client_ledger,
    get_reconciliation,
    pay_invoice_from_trust,
)
from app.models.trust import (
    BankStatementCreate,
    BankStatementSummary,
    TrustBalance,
    TrustLedger,
    TrustPayment,
    TrustReconciliation,
    TrustTransactionCreate,
    TrustTransactionSummary,
)

LAWYER_PROFILE = {"user_id": 7, "role_id": 2, "full_name": "Test Lawyer", "org_id": 10}
ADMIN_PROFILE = {"user_id": 3, "role_id": 1, "full_name": "Test Admin", "org_id": 10}
SUPER_ADMIN_PROFILE = {"user_id": 1, "role_id": 4, "full_name": "Root", "org_id": None}


def deposit(**kw):
    return TrustTransactionCreate(**{
        "client_id": 1, "type": "deposit", "amount": 5000.00,
        "transaction_date": date(2026, 9, 18), "description": "Advance retainer", **kw
    })


# ─────────────────────────────────────────────────────────────
# POST /trust/transactions
# ─────────────────────────────────────────────────────────────

class TestCreateTrustTransaction:

    @patch("app.controllers.trust._ensure_client_access")
    @patch("app.controllers.trust.supabase")
    def test_deposit_succeeds_and_is_stamped_with_the_callers_firm(self, mock_supabase, _access):
        inserted = {}
        mock_supabase.table.return_value.insert.side_effect = lambda row: (
            inserted.update(row)
            or MagicMock(execute=lambda: MagicMock(data=[{"id": 42, "created_at": "2026-09-18T12:00:00Z", **row}]))
        )
        result = create_trust_transaction(deposit(), LAWYER_PROFILE)
        TrustTransactionSummary(**result)     # the shape routes/trust.py declares
        assert result["type"] == "deposit"
        assert inserted["org_id"] == 10
        assert inserted["created_by"] == 7

    def test_invoice_payment_type_is_rejected(self):
        """Only pay_invoice_from_trust may write that type, so the ledger can't claim an
        invoice was settled when it wasn't."""
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(type="invoice_payment"), LAWYER_PROFILE)
        assert exc.value.status_code == 400

    def test_non_positive_amount_is_rejected_by_the_schema(self):
        with pytest.raises(ValueError):
            deposit(amount=-100.00)

    @patch("app.controllers.trust.get_scoped_case_ids", return_value=set())
    def test_client_outside_the_callers_scope_is_403(self, _scoped):
        """require_roles() checks what the caller is, not whose money they may touch."""
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(client_id=999), LAWYER_PROFILE)
        assert exc.value.status_code == 403

    @patch("app.controllers.trust.get_scoped_case_ids", return_value={5})
    @patch("app.controllers.trust.supabase")
    def test_client_at_another_firm_is_403(self, mock_supabase, _scoped):
        """A client can retain several firms; a lawyer at one may not touch the funds
        that client has deposited with another."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value\
            .in_.return_value.limit.return_value.execute.return_value.data = []
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(), LAWYER_PROFILE)
        assert exc.value.status_code == 403

    def test_super_admin_must_name_a_firm(self):
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(), SUPER_ADMIN_PROFILE)
        assert exc.value.status_code == 400


# ─────────────────────────────────────────────────────────────
# Overdraft guard -- THE critical business rule
# ─────────────────────────────────────────────────────────────

class TestOverdraftGuard:

    @patch("app.controllers.trust._get_balance", return_value=200.00)
    @patch("app.controllers.trust._ensure_client_access")
    @patch("app.controllers.trust.supabase")
    def test_disbursement_exceeding_balance_is_rejected(self, _sb, _access, _balance):
        """Core rule: a client's balance can never go negative."""
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(type="disbursement", amount=500.00), LAWYER_PROFILE)
        assert exc.value.status_code == 422
        assert exc.value.detail["available"] == 200.00
        assert exc.value.detail["requested"] == 500.00

    @patch("app.controllers.trust._get_balance", return_value=300.00)
    @patch("app.controllers.trust._ensure_client_access")
    @patch("app.controllers.trust.supabase")
    def test_disbursement_exactly_equal_to_balance_succeeds(self, mock_supabase, _access, _balance):
        """Edge case: spending the last rupee is allowed."""
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
            "id": 1, "client_id": 1, "case_id": None, "type": "disbursement", "amount": 300.00,
            "transaction_date": "2026-09-18", "description": None, "created_at": "2026-09-18T12:00:00Z",
        }]
        result = create_trust_transaction(deposit(type="disbursement", amount=300.00), LAWYER_PROFILE)
        assert result["type"] == "disbursement"

    @patch("app.controllers.trust._get_balance", return_value=1_000_000.00)
    @patch("app.controllers.trust._ensure_client_access")
    @patch("app.controllers.trust.supabase")
    def test_db_guard_rejection_surfaces_as_422(self, mock_supabase, _access, _balance):
        """The controller check is read-then-write and can be raced, so the DB trigger is
        the one that actually holds. Its error must not surface as a 500."""
        mock_supabase.table.return_value.insert.return_value.execute.side_effect = Exception(
            '{"code":"23514","message":"Trust balance for client 1 would go negative"}'
        )
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(deposit(type="disbursement", amount=50.00), LAWYER_PROFILE)
        assert exc.value.status_code == 422


# ─────────────────────────────────────────────────────────────
# GET balance / ledger
# ─────────────────────────────────────────────────────────────

class TestClientBalance:

    @patch("app.controllers.trust._get_balance", return_value=2750.50)
    @patch("app.controllers.trust._ensure_client_access")
    def test_balance_returned_for_the_callers_firm(self, _access, _balance):
        result = get_client_balance(1, None, LAWYER_PROFILE)
        TrustBalance(**result)
        assert result == {"client_id": 1, "org_id": 10, "balance": 2750.50}

    @patch("app.controllers.trust.get_scoped_case_ids", return_value=set())
    def test_unscoped_client_is_403(self, _scoped):
        with pytest.raises(HTTPException) as exc:
            get_client_balance(999, None, LAWYER_PROFILE)
        assert exc.value.status_code == 403

    @patch("app.controllers.trust._ensure_client_access")
    @patch("app.controllers.trust.supabase")
    def test_ledger_is_filtered_to_the_callers_firm(self, mock_supabase, _access):
        chain = mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value
        chain.order.return_value.order.return_value.execute.return_value.data = []
        TrustLedger(**get_client_ledger(1, None, LAWYER_PROFILE))
        # client_id then org_id
        eq_calls = mock_supabase.table.return_value.select.return_value.eq.call_args_list
        assert eq_calls[0].args == ("client_id", 1)


# ─────────────────────────────────────────────────────────────
# POST /invoices/{id}/pay-from-trust
# ─────────────────────────────────────────────────────────────

def _invoice_table(mock_supabase, *, total_amount, payment_status="Pending"):
    """Wire `supabase.table(...)` so the invoices lookup returns one invoice and the
    payments insert is recordable."""
    tables = {}

    def table(name):
        m = tables.setdefault(name, MagicMock())
        if name == "invoices":
            m.select.return_value.eq.return_value.execute.return_value.data = [{
                "invoice_id": 99, "case_id": 5, "total_amount": total_amount,
                "payment_status": payment_status, "cases": {"client_id": 1, "org_id": 10},
            }]
        elif name == "trust_transactions":
            m.insert.return_value.execute.return_value.data = [{"id": 77}]
        return m

    mock_supabase.table.side_effect = table
    return tables


class TestPayInvoiceFromTrust:

    @patch("app.controllers.trust.ensure_case_access")
    @patch("app.controllers.trust._recompute_invoice_status")
    @patch("app.controllers.trust._amount_due", return_value=400.00)
    @patch("app.controllers.trust._get_balance", return_value=1000.00)
    @patch("app.controllers.trust.supabase")
    def test_charges_only_what_is_outstanding(self, mock_supabase, _bal, _due, _recompute, _access):
        """An invoice part-paid by Razorpay must not be charged in full again from trust."""
        tables = _invoice_table(mock_supabase, total_amount=1000.00, payment_status="Partially Paid")
        result = pay_invoice_from_trust(99, LAWYER_PROFILE)
        TrustPayment(**result)
        assert result["amount_paid"] == 400.00
        assert tables["trust_transactions"].insert.call_args.args[0]["amount"] == 400.00

    @patch("app.controllers.trust.ensure_case_access")
    @patch("app.controllers.trust._recompute_invoice_status")
    @patch("app.controllers.trust._amount_due", return_value=400.00)
    @patch("app.controllers.trust._get_balance", return_value=1000.00)
    @patch("app.controllers.trust.supabase")
    def test_records_a_payment_row_rather_than_writing_status(self, mock_supabase, _b, _d, mock_recompute, _a):
        """billing derives payment_status from the payments table -- an invoice marked Paid
        with no payment row reverts to Pending the next time anything recomputes it."""
        tables = _invoice_table(mock_supabase, total_amount=1000.00)
        pay_invoice_from_trust(99, LAWYER_PROFILE)

        payment = tables["payments"].insert.call_args.args[0]
        assert payment["amount"] == 400.00
        assert payment["payment_method"] == "Trust Account"
        assert payment["payment_status"] == "Completed"
        assert payment["transaction_reference"] == "trust:77"
        mock_recompute.assert_called_once_with(99)
        tables["invoices"].update.assert_not_called()

    @patch("app.controllers.trust.ensure_case_access")
    @patch("app.controllers.trust._amount_due", return_value=1000.00)
    @patch("app.controllers.trust._get_balance", return_value=400.00)
    @patch("app.controllers.trust.supabase")
    def test_overdraft_rejected(self, mock_supabase, _bal, _due, _access):
        _invoice_table(mock_supabase, total_amount=1000.00)
        with pytest.raises(HTTPException) as exc:
            pay_invoice_from_trust(99, LAWYER_PROFILE)
        assert exc.value.status_code == 422
        assert "Insufficient trust funds" in str(exc.value.detail)

    @patch("app.controllers.trust.ensure_case_access")
    @patch("app.controllers.trust._amount_due", return_value=0.0)
    @patch("app.controllers.trust.supabase")
    def test_fully_paid_invoice_is_rejected(self, mock_supabase, _due, _access):
        _invoice_table(mock_supabase, total_amount=1000.00, payment_status="Paid")
        with pytest.raises(HTTPException) as exc:
            pay_invoice_from_trust(99, LAWYER_PROFILE)
        assert exc.value.status_code == 422

    @patch("app.controllers.trust.ensure_case_access", side_effect=HTTPException(403, "nope"))
    @patch("app.controllers.trust.supabase")
    def test_invoice_outside_the_callers_scope_is_403(self, mock_supabase, _access):
        _invoice_table(mock_supabase, total_amount=1000.00)
        with pytest.raises(HTTPException) as exc:
            pay_invoice_from_trust(99, LAWYER_PROFILE)
        assert exc.value.status_code == 403


# ─────────────────────────────────────────────────────────────
# Reconciliation
# ─────────────────────────────────────────────────────────────

def _recon_tables(mock_supabase, *, bank, transactions):
    def table(name):
        m = MagicMock()
        if name == "trust_bank_statements":
            m.select.return_value.eq.return_value.lte.return_value.order.return_value\
                .limit.return_value.execute.return_value.data = (
                    [{"bank_balance": bank, "statement_date": "2026-09-01"}] if bank is not None else []
                )
        else:
            m.select.return_value.eq.return_value.lte.return_value.order.return_value\
                .order.return_value.execute.return_value.data = transactions
        return m
    mock_supabase.table.side_effect = table


class TestReconciliation:

    @patch("app.controllers.trust.supabase")
    def test_clean_dataset_reports_all_three_totals_agreeing(self, mock_supabase):
        _recon_tables(mock_supabase, bank=3000.00, transactions=[
            {"id": 1, "type": "deposit", "amount": 2000.00, "client_id": 1, "running_balance": 2000.00, "transaction_date": "2026-09-02"},
            {"id": 2, "type": "deposit", "amount": 1000.00, "client_id": 2, "running_balance": 3000.00, "transaction_date": "2026-09-03"},
        ])
        result = get_reconciliation(date(2026, 9, 18), None, ADMIN_PROFILE)
        TrustReconciliation(**result)
        assert result["bank_balance"] == 3000.00
        assert result["ledger_total"] == 3000.00
        assert result["client_total"] == 3000.00
        assert result["reconciled"] is True
        assert result["client_balances"] == [
            {"client_id": 1, "balance": 2000.00}, {"client_id": 2, "balance": 1000.00}
        ]

    @patch("app.controllers.trust.supabase")
    def test_tampered_amount_splits_the_ledger_from_the_client_balances(self, mock_supabase):
        """The point of a *three*-way check: someone edits an amount in the database, the
        recomputed client balances move and the control total stamped at posting time does
        not. A two-way bank-vs-ledger check would not see this at all."""
        _recon_tables(mock_supabase, bank=3000.00, transactions=[
            {"id": 1, "type": "deposit", "amount": 2000.00, "client_id": 1, "running_balance": 2000.00, "transaction_date": "2026-09-02"},
            # amount edited by hand from 1000 to 500; running_balance left behind
            {"id": 2, "type": "deposit", "amount": 500.00, "client_id": 2, "running_balance": 3000.00, "transaction_date": "2026-09-03"},
        ])
        result = get_reconciliation(date(2026, 9, 18), None, ADMIN_PROFILE)
        assert result["ledger_total"] == 3000.00
        assert result["client_total"] == 2500.00
        assert result["reconciled"] is False

    @patch("app.controllers.trust.supabase")
    def test_bank_balance_disagreeing_is_not_reconciled(self, mock_supabase):
        _recon_tables(mock_supabase, bank=3000.00, transactions=[
            {"id": 1, "type": "deposit", "amount": 2500.00, "client_id": 1, "running_balance": 2500.00, "transaction_date": "2026-09-02"},
        ])
        assert get_reconciliation(date(2026, 9, 18), None, ADMIN_PROFILE)["reconciled"] is False

    @patch("app.controllers.trust.supabase")
    def test_no_bank_statement_is_not_reconciled(self, mock_supabase):
        _recon_tables(mock_supabase, bank=None, transactions=[])
        assert get_reconciliation(date(2026, 9, 18), None, ADMIN_PROFILE)["reconciled"] is False

    @patch("app.controllers.trust.supabase")
    def test_defaults_to_today_rather_than_the_date_the_server_booted(self, mock_supabase):
        _recon_tables(mock_supabase, bank=None, transactions=[])
        assert get_reconciliation(None, None, ADMIN_PROFILE)["as_of"] == date.today().isoformat()

    def test_super_admin_must_name_a_firm(self):
        with pytest.raises(HTTPException) as exc:
            get_reconciliation(date(2026, 9, 18), None, SUPER_ADMIN_PROFILE)
        assert exc.value.status_code == 400


class TestBankStatement:

    @patch("app.controllers.trust.supabase")
    def test_statement_is_stamped_with_the_callers_firm(self, mock_supabase):
        inserted = {}
        mock_supabase.table.return_value.insert.side_effect = lambda row: (
            inserted.update(row) or MagicMock(execute=lambda: MagicMock(data=[{"id": 9, **row}]))
        )
        result = create_bank_statement(
            BankStatementCreate(statement_date=date(2026, 9, 1), bank_balance=3000.00),
            ADMIN_PROFILE,
        )
        BankStatementSummary(**result)
        assert inserted["org_id"] == 10
        assert inserted["recorded_by"] == 3

    def test_negative_bank_balance_rejected_by_the_schema(self):
        with pytest.raises(ValueError):
            BankStatementCreate(statement_date=date(2026, 9, 1), bank_balance=-1)
