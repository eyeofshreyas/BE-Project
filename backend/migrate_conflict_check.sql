-- Run once in the Supabase SQL editor: adds case_parties, the non-client parties on a case
-- (opposing party, co-party, etc.) that a conflict-of-interest check searches against.
-- Cases previously only recorded the client -- there was nowhere to record who's on the
-- other side, which is the single most important name a conflict check needs. See
-- app/controllers/conflict_check.py.

create table if not exists case_parties (
  party_id bigint generated always as identity primary key,
  case_id bigint not null references cases(case_id) on delete cascade,
  name text not null,
  role text not null default 'Opposing Party',
  created_at timestamptz not null default now()
);

create index if not exists case_parties_case_id_idx on case_parties(case_id);

-- Supabase enables row-level security on newly created tables, which blocks every write and
-- silently returns zero rows on read. Every other table in this schema runs with RLS off --
-- the FastAPI layer is the gatekeeper -- so match that here, or parties can never be added.
alter table case_parties disable row level security;
