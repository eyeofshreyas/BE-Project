-- Run once in the Supabase SQL editor: client-money (trust) ledger and the figures
-- behind 3-way reconciliation. See issue #5.
--
-- Client money is held PER FIRM: a client can retain several firms (see org_clients and
-- auth.get_scoped_case_ids), and each firm has its own trust bank account, so every row
-- here is org-scoped and reconciliation runs per org.

-- ─────────────────────────────────────────────────────────────
-- 1. Core ledger
-- ─────────────────────────────────────────────────────────────
create table if not exists trust_transactions (
    id               bigint        generated always as identity primary key,
    org_id           bigint        not null references organizations(org_id),
    client_id        bigint        not null references clients(client_id) on delete restrict,
    case_id          bigint                 references cases(case_id)     on delete set null,
    type             varchar(20)   not null
                         check (type in ('deposit', 'disbursement', 'invoice_payment')),
    amount           numeric(12,2) not null check (amount > 0),
    transaction_date date          not null default current_date,
    description      text,
    reference_id     bigint,
    -- The firm's ledger control total as it stood when this entry was posted, stamped by
    -- the trigger below. This is what makes reconciliation genuinely 3-way: leg 3 is
    -- recomputed from the amounts, leg 2 is this recorded figure, so editing a historical
    -- amount by hand moves one and not the other.
    running_balance  numeric(12,2) not null default 0,
    created_by       bigint                 references users(user_id),
    created_at       timestamptz   not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. Manual bank balance log (leg 1 of the reconciliation)
-- ─────────────────────────────────────────────────────────────
create table if not exists trust_bank_statements (
    id               bigint        generated always as identity primary key,
    org_id           bigint        not null references organizations(org_id),
    statement_date   date          not null,
    bank_balance     numeric(12,2) not null check (bank_balance >= 0),
    notes            text,
    recorded_by      bigint                 references users(user_id),
    recorded_at      timestamptz   not null default now(),
    unique (org_id, statement_date)
);

-- ─────────────────────────────────────────────────────────────
-- 3. The rule that must not be skipped: no client's balance goes negative.
--
-- The controller checks this too, but a controller check is read-then-write: two
-- concurrent disbursements both read the same balance and both pass. This trigger is
-- the serialization point, so the rule holds no matter who writes. It can't be a plain
-- CHECK constraint -- the balance is a sum over other rows, not a property of this one.
-- ─────────────────────────────────────────────────────────────
create or replace function trust_guard_and_stamp() returns trigger as $$
declare
  delta            numeric(12,2);
  client_balance   numeric(12,2);
  firm_balance     numeric(12,2);
begin
  delta := case when new.type = 'deposit' then new.amount else -new.amount end;

  -- Held until this transaction commits, so concurrent inserts for the same firm queue
  -- up rather than racing each other's balance reads.
  perform pg_advisory_xact_lock(hashtext('trust_transactions'), new.org_id::int);

  select coalesce(sum(case when type = 'deposit' then amount else -amount end), 0)
    into client_balance
    from trust_transactions
   where org_id = new.org_id and client_id = new.client_id;

  if client_balance + delta < 0 then
    raise exception 'Trust balance for client % would go negative (held %, requested %)',
      new.client_id, client_balance, new.amount
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(case when type = 'deposit' then amount else -amount end), 0)
    into firm_balance
    from trust_transactions
   where org_id = new.org_id;

  new.running_balance := firm_balance + delta;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trust_guard_and_stamp_trg on trust_transactions;
create trigger trust_guard_and_stamp_trg
  before insert on trust_transactions
  for each row execute function trust_guard_and_stamp();

-- ─────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_trust_transactions_org_client on trust_transactions(org_id, client_id);
create index if not exists idx_trust_transactions_org_date   on trust_transactions(org_id, transaction_date);
create index if not exists idx_trust_bank_statements_org     on trust_bank_statements(org_id, statement_date);

-- Supabase enables row-level security on tables created via the SQL editor, which blocks
-- every write and silently returns zero rows on read. This app has no RLS policies
-- anywhere -- the FastAPI layer is the gatekeeper -- so match every other table here.
alter table trust_transactions   disable row level security;
alter table trust_bank_statements disable row level security;
