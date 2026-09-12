-- Run once in the Supabase SQL editor: gives the admin console's Settings tab
-- somewhere to persist to.
--
-- The tab's platform toggles were local React state -- "Save Changes" showed a
-- toast and forgot everything on reload. These are platform-wide (not per-user)
-- switches, so this is a single pinned row rather than a per-user table; the
-- `id = 1` check makes a second row impossible.

create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  maintenance_mode boolean not null default false,
  new_signup_alerts boolean not null default true,
  weekly_reports boolean not null default true,
  auto_backup boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into platform_settings (id) values (1) on conflict (id) do nothing;
