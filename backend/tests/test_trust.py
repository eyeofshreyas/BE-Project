"""
Trust accounting test suite — Issue #5
Tests business logic directly without mocking auth.
"""

import pytest
from unittest.mock import patch, MagicMock

MOCK_PROFILE = {"user_id": 7, "role_id": 2, "full_name": "Test Lawyer"}

# ─────────────────────────────────────────────────────────────
# POST /trust/transactions
# ─────────────────────────────────────────────────────────────

class TestCreateTrustTransaction:

    VALID_DEPOSIT = {
        "client_id": 1,
        "type": "deposit",
        "amount": 5000.00,
        "transaction_date": "2026-09-18",
        "description": "Advance retainer",
    }

    @patch("app.controllers.trust._client_exists", return_value=True)
    @patch("app.controllers.trust.supabase")
    def test_deposit_succeeds(self, mock_supabase, mock_exists):
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
            "id": 42, "client_id": 1, "case_id": None,
            "type": "deposit", "amount": 5000.00,
            "transaction_date": "2026-09-18",
            "description": "Advance retainer",
            "created_by": 7, "created_at": "2026-09-18T12:00:00"
        }]
        from datetime import date
        data = TrustTransactionCreate(
            client_id=1, type="deposit", amount=5000.00,
            transaction_date=date(2026, 9, 18), description="Advance retainer"
        )
        result = create_trust_transaction(data, MOCK_PROFILE)
        assert result["type"] == "deposit"
        assert result["amount"] == 5000.00

    @patch("app.controllers.trust._client_exists", return_value=True)
    @patch("app.controllers.trust.supabase")
    def test_invalid_type_raises_400(self, mock_supabase, mock_exists):
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        from fastapi import HTTPException
        from datetime import date
        data = TrustTransactionCreate(
            client_id=1, type="invoice_payment", amount=100.00,
            transaction_date=date(2026, 9, 18)
        )
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(data, MOCK_PROFILE)
        assert exc.value.status_code == 400

    @patch("app.controllers.trust._client_exists", return_value=True)
    @patch("app.controllers.trust.supabase")
    def test_negative_amount_raises_400(self, mock_supabase, mock_exists):
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        from fastapi import HTTPException
        from datetime import date
        data = TrustTransactionCreate(
            client_id=1, type="deposit", amount=-100.00,
            transaction_date=date(2026, 9, 18)
        )
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(data, MOCK_PROFILE)
        assert exc.value.status_code == 400

    @patch("app.controllers.trust._client_exists", return_value=False)
    @patch("app.controllers.trust.supabase")
    def test_unknown_client_raises_404(self, mock_supabase, mock_exists):
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        from fastapi import HTTPException
        from datetime import date
        data = TrustTransactionCreate(
            client_id=999, type="deposit", amount=100.00,
            transaction_date=date(2026, 9, 18)
        )
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(data, MOCK_PROFILE)
        assert exc.value.status_code == 404


# ─────────────────────────────────────────────────────────────
# Overdraft guard — THE critical business rule
# ─────────────────────────────────────────────────────────────

class TestOverdraftGuard:

    @patch("app.controllers.trust._get_balance", return_value=200.00)
    @patch("app.controllers.trust._client_exists", return_value=True)
    @patch("app.controllers.trust.supabase")
    def test_disbursement_exceeding_balance_is_rejected(
        self, mock_supabase, mock_exists, mock_balance
    ):
        """Core rule: client balance can never go negative."""
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        from fastapi import HTTPException
        from datetime import date
        data = TrustTransactionCreate(
            client_id=1, type="disbursement", amount=500.00,
            transaction_date=date(2026, 9, 18), description="Court fee"
        )
        with pytest.raises(HTTPException) as exc:
            create_trust_transaction(data, MOCK_PROFILE)
        assert exc.value.status_code == 422
        assert exc.value.detail["available"] == 200.00
        assert exc.value.detail["requested"] == 500.00

    @patch("app.controllers.trust._get_balance", return_value=300.00)
    @patch("app.controllers.trust._client_exists", return_value=True)
    @patch("app.controllers.trust.supabase")
    def test_disbursement_exactly_equal_to_balance_succeeds(
        self, mock_supabase, mock_exists, mock_balance
    ):
        """Edge case: spending the last rupee is allowed."""
        from app.controllers.trust import create_trust_transaction, TrustTransactionCreate
        from datetime import date
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
            "id": 1, "client_id": 1, "type": "disbursement",
            "amount": 300.00, "transaction_date": "2026-09-18",
            "description": "", "created_by": 7, "created_at": "2026-09-18T12:00:00"
        }]
        data = TrustTransactionCreate(
            client_id=1, type="disbursement", amount=300.00,
            transaction_date=date(2026, 9, 18)
        )
        result = create_trust_transaction(data, MOCK_PROFILE)
        assert result["type"] == "disbursement"

    @patch("app.controllers.trust._get_balance", return_value=400.00)
    @patch("app.controllers.trust.supabase")
    def test_pay_from_trust_overdraft_rejected(self, mock_supabase, mock_balance):
        """Invoice payment also enforces overdraft rule."""
        from app.controllers.trust import pay_invoice_from_trust
        from fastapi import HTTPException
        mock_supabase.table.return_value.select.return_value.eq.return_value\
            .execute.return_value.data = [{
                "invoice_id": 99, "case_id": 1,
                "total_amount": 1000.00, "payment_status": "Pending",
                "cases": {"client_id": 1}
            }]
        with pytest.raises(HTTPException) as exc:
            pay_invoice_from_trust(99, MOCK_PROFILE)
        assert exc.value.status_code == 422
        assert "Insufficient trust funds" in str(exc.value.detail)


# ─────────────────────────────────────────────────────────────
# GET balance
# ─────────────────────────────────────────────────────────────

class TestClientBalance:

    @patch("app.controllers.trust._get_balance", return_value=2750.50)
    @patch("app.controllers.trust._client_exists", return_value=True)
    def test_balance_returned_correctly(self, mock_exists, mock_balance):
        from app.controllers.trust import get_client_balance
        result = get_client_balance(1, MOCK_PROFILE)
        assert result["balance"] == 2750.50

    @patch("app.controllers.trust._client_exists", return_value=False)
    def test_unknown_client_returns_404(self, mock_exists):
        from app.controllers.trust import get_client_balance
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            get_client_balance(999, MOCK_PROFILE)
        assert exc.value.status_code == 404


# ─────────────────────────────────────────────────────────────
# Reconciliation
# ─────────────────────────────────────────────────────────────

class TestReconciliation:

    @patch("app.controllers.trust.supabase")
    def test_clean_dataset_reports_reconciled_true(self, mock_supabase):
        from app.controllers.trust import get_reconciliation
        from datetime import date

        def table_side(name):
            m = MagicMock()
            if name == "trust_bank_statements":
                m.select.return_value.lte.return_value.order.return_value\
                    .limit.return_value.execute.return_value.data = [
                    {"bank_balance": 3000.00, "statement_date": "2026-09-01"}
                ]
            else:
                m.select.return_value.lte.return_value.execute.return_value.data = [
                    {"type": "deposit", "amount": 3000.00, "client_id": 1}
                ]
            return m

        mock_supabase.table.side_effect = table_side
        result = get_reconciliation(date(2026, 9, 18), MOCK_PROFILE)
        assert result["reconciled"] is True
        assert result["bank_balance"] == 3000.00
        assert result["ledger_total"] == 3000.00

    @patch("app.controllers.trust.supabase")
    def test_tampered_transaction_causes_reconciled_false(self, mock_supabase):
        from app.controllers.trust import get_reconciliation
        from datetime import date

        def table_side(name):
            m = MagicMock()
            if name == "trust_bank_statements":
                m.select.return_value.lte.return_value.order.return_value\
                    .limit.return_value.execute.return_value.data = [
                    {"bank_balance": 3000.00, "statement_date": "2026-09-01"}
                ]
            else:
                m.select.return_value.lte.return_value.execute.return_value.data = [
                    {"type": "deposit", "amount": 2500.00, "client_id": 1}
                ]
            return m

        mock_supabase.table.side_effect = table_side
        result = get_reconciliation(date(2026, 9, 18), MOCK_PROFILE)
        assert result["reconciled"] is False

    @patch("app.controllers.trust.supabase")
    def test_no_bank_statement_returns_reconciled_false(self, mock_supabase):
        from app.controllers.trust import get_reconciliation
        from datetime import date

        def table_side(name):
            m = MagicMock()
            if name == "trust_bank_statements":
                m.select.return_value.lte.return_value.order.return_value\
                    .limit.return_value.execute.return_value.data = []
            else:
                m.select.return_value.lte.return_value.execute.return_value.data = []
            return m

        mock_supabase.table.side_effect = table_side
        result = get_reconciliation(date(2026, 9, 18), MOCK_PROFILE)
        assert result["reconciled"] is False
