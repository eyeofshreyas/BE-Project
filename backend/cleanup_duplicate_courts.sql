-- Merges duplicate `courts` rows (same court_name, different court_id) left behind by
-- stale seed data -- old seed.sql versions inserted courts the current one doesn't, and
-- got re-run without ever being deduped. This let a lawyer pick two different court_ids
-- for what reads as the same court in the "Add judge" picker, and let the same judge
-- exist "twice" under the same-name-same-court duplicate check (app/controllers/reference.py).
-- Run in the Supabase SQL editor. Idempotent: once there are no duplicate names left,
-- every statement here matches zero rows.

-- Repoint any judges/cases/client_requests row on a duplicate court_id to the lowest
-- court_id sharing that court_name, before the duplicate rows are removed.
with canonical as (
  select court_name, min(court_id) as keep_id
  from courts
  group by court_name
),
dupes as (
  select c.court_id as dupe_id, k.keep_id
  from courts c
  join canonical k on k.court_name = c.court_name
  where c.court_id <> k.keep_id
)
update judges set court_id = dupes.keep_id
from dupes where judges.court_id = dupes.dupe_id;

with canonical as (
  select court_name, min(court_id) as keep_id
  from courts
  group by court_name
),
dupes as (
  select c.court_id as dupe_id, k.keep_id
  from courts c
  join canonical k on k.court_name = c.court_name
  where c.court_id <> k.keep_id
)
update cases set court_id = dupes.keep_id
from dupes where cases.court_id = dupes.dupe_id;

with canonical as (
  select court_name, min(court_id) as keep_id
  from courts
  group by court_name
),
dupes as (
  select c.court_id as dupe_id, k.keep_id
  from courts c
  join canonical k on k.court_name = c.court_name
  where c.court_id <> k.keep_id
)
update client_requests set court_id = dupes.keep_id
from dupes where client_requests.court_id = dupes.dupe_id;

-- Now nothing references a duplicate court_id -- safe to delete.
delete from courts c
using (
  select court_name, min(court_id) as keep_id
  from courts
  group by court_name
) k
where c.court_name = k.court_name and c.court_id <> k.keep_id;
