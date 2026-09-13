-- Run once in the Supabase SQL editor: adds eCourts CNR sync to cases.
--
-- cnr_number is the 16-character Case Number Record a lawyer enters once, usually
-- at filing (see set_case_cnr in app/controllers/ecourts.py). ecourts_status and
-- ecourts_raw hold the last-synced snapshot from the eCourtsIndia API
-- (sync_case_from_ecourts) -- ecourts_status is the provider's own vocabulary
-- ("PENDING"/"DISPOSED"), kept separate from this app's own `status` workflow
-- field rather than overwriting it. ecourts_raw keeps the full response so later
-- features (order text, party details) don't need a second migration to read
-- fields this app doesn't parse yet. Re-running is safe.

alter table cases add column if not exists cnr_number text unique;
alter table cases add column if not exists ecourts_status text;
alter table cases add column if not exists ecourts_raw jsonb;
alter table cases add column if not exists ecourts_last_synced_at timestamptz;
