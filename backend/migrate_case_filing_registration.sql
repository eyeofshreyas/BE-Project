-- Run once in the Supabase SQL editor: adds the court's own filing/registration
-- identifiers and acts/sections to cases, distinct from cases.case_number (LexFlow's
-- own internal reference, e.g. "CIV2026001") and from conveyancing_matters' registration
-- fields (a property transaction's registration office record, a different entity
-- entirely). Manually entered for now via PATCH /cases/{id}/filing-details -- see
-- docs/FUTURE_SCOPE.md for why auto-filling these from eCourts sync is deferred.
-- Re-running is safe.

alter table cases add column if not exists filing_number text;
alter table cases add column if not exists registration_number text;
alter table cases add column if not exists acts_sections text;
