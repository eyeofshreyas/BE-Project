-- Run once in the Supabase SQL editor: adds org_clients, a per-(firm, client) suspension
-- flag. A client is global (can have cases with multiple firms); this lets one firm suspend
-- a client without affecting that client's other firms. Absence of a row means active --
-- no backfill needed for existing firm-client pairs. See
-- docs/superpowers/specs/2026-09-13-per-firm-client-suspension-design.md.

create table if not exists org_clients (
  org_id bigint not null references organizations(org_id) on delete cascade,
  client_id bigint not null references clients(client_id) on delete cascade,
  is_active boolean not null default true,
  suspended_at timestamptz,
  primary key (org_id, client_id)
);

-- Supabase enables row-level security on newly created tables, which blocks every write and
-- silently returns zero rows on read. Every other table in this schema runs with RLS off --
-- the FastAPI layer is the gatekeeper -- so match that here.
alter table org_clients disable row level security;
