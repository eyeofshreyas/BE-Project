-- Migration: Trust accounting and 3-way reconciliation
-- Issue #5 | eyeofshreyas/BE-Project

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Core ledger table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trust_transactions (
    id               BIGSERIAL     PRIMARY KEY,
    client_id        BIGINT        NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
    case_id          BIGINT                 REFERENCES cases(case_id)     ON DELETE SET NULL,
    type             VARCHAR(20)   NOT NULL
                         CHECK (type IN ('deposit', 'disbursement', 'invoice_payment')),
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    transaction_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    description      TEXT,
    reference_id     BIGINT,
    created_by       BIGINT        NOT NULL REFERENCES users(user_id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. Manual bank balance log (for reconciliation)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trust_bank_statements (
    id               BIGSERIAL     PRIMARY KEY,
    statement_date   DATE          NOT NULL UNIQUE,
    bank_balance     NUMERIC(12,2) NOT NULL CHECK (bank_balance >= 0),
    notes            TEXT,
    recorded_by      BIGINT        NOT NULL REFERENCES users(user_id),
    recorded_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. Performance indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX idx_trust_transactions_client  ON trust_transactions(client_id);
CREATE INDEX idx_trust_transactions_date    ON trust_transactions(transaction_date);
CREATE INDEX idx_trust_transactions_type    ON trust_transactions(type);
CREATE INDEX idx_trust_bank_statements_date ON trust_bank_statements(statement_date);

COMMIT;