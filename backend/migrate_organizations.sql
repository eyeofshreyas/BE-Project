-- Run once in the Supabase SQL editor: introduces multi-firm tenancy
-- (organizations) and lawyer-invite-by-email, alongside the case-team feature
-- in cases.py. See docs/superpowers/specs/2026-09-13-org-scoped-case-teams-design.md.

-- users.role_id has a foreign key into roles -- seed SUPER_ADMIN (4) before
-- anything below tries to set a user's role_id to it.
insert into roles (role_id, role_name, description) values
  (4, 'Super Admin', 'Platform-wide operator, unrestricted across all organizations')
on conflict (role_id) do nothing;

create table if not exists organizations (
  org_id      bigint generated always as identity primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);
-- Supabase enables RLS by default on tables created via the SQL editor. This
-- app has no RLS policies anywhere -- every access check happens in Python
-- against a single service-keyed client (see app/db/supabase_client.py) --
-- so an RLS-enabled table with no policies blocks every insert/select.
alter table organizations disable row level security;

alter table users add column if not exists org_id bigint references organizations(org_id);
-- NULL for clients and the super-admin; set for every ADMIN (org admin) and LAWYER row.

-- Exactly one admin per org. role_id 1 = ADMIN (see app/middleware/auth.py);
-- ADMIN rows are always org-scoped now, SUPER_ADMIN (4) never matches this index.
create unique index if not exists one_admin_per_org
  on users (org_id)
  where role_id = 1;

alter table cases add column if not exists org_id bigint references organizations(org_id);
-- Backfill (see backfill block below) before making this NOT NULL.

create table if not exists lawyer_invites (
  invite_id   bigint generated always as identity primary key,
  org_id      bigint not null references organizations(org_id),
  email       text not null,
  status      text not null default 'pending', -- pending | accepted
  created_at  timestamptz not null default now()
);
alter table lawyer_invites disable row level security;

-- platform_settings: one row per org instead of the fixed id=1 singleton.
-- Wrap the rename in a guard to make it idempotent: only run if id exists and org_id doesn't yet.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'platform_settings' and column_name = 'id')
     and not exists (select 1 from information_schema.columns where table_name = 'platform_settings' and column_name = 'org_id') then
    alter table platform_settings rename column id to org_id;
  end if;
end $$;

alter table platform_settings drop constraint if exists platform_settings_id_check;

-- Backfill existing single-tenant data into one "Legacy Firm" organization.
-- Run this block once, then make cases.org_id NOT NULL.
do $$
declare
  legacy_org_id bigint;
begin
  if not exists (select 1 from organizations where name = 'Legacy Firm') then
    insert into organizations (name) values ('Legacy Firm') returning org_id into legacy_org_id;
  else
    select org_id into legacy_org_id from organizations where name = 'Legacy Firm';
  end if;

  update users set org_id = legacy_org_id where role_id in (1, 2) and org_id is null;
  -- After this UPDATE runs, check whether more than one pre-existing user has role_id = 1 (ADMIN).
  -- If so, pick which one should become the platform super-admin and run by hand:
  --   update users set role_id = 4, org_id = null where user_id = <that user's id>;
  -- (role_id 4 = SUPER_ADMIN, added in app/middleware/auth.py by Task 2.)
  -- If the unique index one_admin_per_org aborts this whole block (due to conflicting pre-existing ADMINs),
  -- resolve the conflict by hand, then re-run this file.

  update cases set org_id = legacy_org_id where org_id is null;
  -- No platform_settings backfill needed here: the column rename above already
  -- carried the old singleton row (id=1) forward as org_id=1, and legacy_org_id
  -- is 1 too -- organizations was empty before this statement, so its identity
  -- sequence starts at 1. If that assumption doesn't hold (a prior partial run,
  -- pre-seeded organizations rows), reconcile platform_settings.org_id by hand.
end $$;

-- Add the FK constraint to platform_settings AFTER the backfill block runs (now that organizations exists).
-- Drop and re-add to make this idempotent: safe to re-run without "constraint already exists" error.
alter table platform_settings drop constraint if exists platform_settings_org_id_fkey;
alter table platform_settings add constraint platform_settings_org_id_fkey
  foreign key (org_id) references organizations(org_id);

alter table cases alter column org_id set not null;
