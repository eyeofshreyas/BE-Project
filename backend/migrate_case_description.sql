-- Run once in the Supabase SQL editor: adds the "description" field shown in
-- the client's case detail modal, and backfills it for the cases already
-- seeded by seed.sql. New cases populate this column directly at creation
-- (see create_case in app/controllers/cases.py) instead of only going into
-- a case_note.

alter table cases add column if not exists description text;

update cases set description = v.description
from (values
  ('CIV2026001', 'Boundary dispute with Metro Builders over encroachment on the Kulkarni residential plot. Currently gathering survey and title evidence.'),
  ('FAM2026001', 'Matrimonial dispute involving maintenance and custody terms for the Shah family, in progress before the City Civil Court.'),
  ('COR2026001', 'Contract dispute with Desai Enterprises over an alleged breach of a supply agreement, currently at the pleadings stage.'),
  ('PROP2026001', 'Registration of a property transfer for the Kulkarni residence at the Sub-Registrar Office, Indiranagar.')
) as v(case_number, description)
where cases.case_number = v.case_number;
