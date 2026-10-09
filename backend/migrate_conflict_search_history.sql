-- Run once in the Supabase SQL editor: adds conflict_searches, a compliance-grade audit log
-- of every conflict-of-interest search run (who, when, what criteria, how many matches) --
-- see app/controllers/conflict_check.py. org_id is nullable because the super-admin's
-- platform-wide search has no single org to attribute the row to.

create table if not exists conflict_searches (
  search_id bigint generated always as identity primary key,
  org_id bigint references organizations(org_id),
  searched_by bigint not null references users(user_id),
  name text,
  case_number text,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists conflict_searches_org_id_idx on conflict_searches(org_id);
create index if not exists conflict_searches_created_at_idx on conflict_searches(created_at desc);

-- Supabase enables row-level security on newly created tables, which blocks every write and
-- silently returns zero rows on read. Every other table in this schema runs with RLS off --
-- the FastAPI layer is the gatekeeper -- so match that here, or history can never be logged.
alter table conflict_searches disable row level security;
