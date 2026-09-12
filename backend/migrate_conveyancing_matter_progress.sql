-- Run once in the Supabase SQL editor: seed.sql only gave MAT-2026-001 (and
-- MAT-2026-002) a registration_progress checklist -- the "Extra matters"
-- (MAT-2026-010, 101..106) got a property/case/party row each but no
-- progress stages, so their client-facing Matter Details modal shows
-- "No progress stages yet". This backfills a 4-stage checklist for all of
-- them, with completed/pending flags picked to match each matter's existing
-- registration_status and completion_percentage.

insert into registration_progress (matter_id, stage_name, stage_order, completed, remarks)
select mt.matter_id, v.stage_name, v.stage_order, v.completed, v.remarks
from (values
  ('MAT-2026-002', 'Due Diligence', 1, true, null),
  ('MAT-2026-002', 'Stamp Duty Payment', 2, true, null),
  ('MAT-2026-002', 'Deed Execution', 3, true, null),
  ('MAT-2026-002', 'Registration', 4, false, null),

  ('MAT-2026-010', 'Due Diligence', 1, true, null),
  ('MAT-2026-010', 'Stamp Duty Payment', 2, true, null),
  ('MAT-2026-010', 'Deed Execution', 3, false, null),
  ('MAT-2026-010', 'Registration', 4, false, null),

  ('MAT-2026-101', 'Due Diligence', 1, false, 'Awaiting document verification.'),
  ('MAT-2026-101', 'Stamp Duty Payment', 2, false, null),
  ('MAT-2026-101', 'Deed Execution', 3, false, null),
  ('MAT-2026-101', 'Registration', 4, false, null),

  ('MAT-2026-102', 'Due Diligence', 1, false, null),
  ('MAT-2026-102', 'Stamp Duty Payment', 2, false, null),
  ('MAT-2026-102', 'Deed Execution', 3, false, null),
  ('MAT-2026-102', 'Registration', 4, false, null),

  ('MAT-2026-103', 'Due Diligence', 1, true, null),
  ('MAT-2026-103', 'Stamp Duty Payment', 2, true, null),
  ('MAT-2026-103', 'Deed Execution', 3, true, null),
  ('MAT-2026-103', 'Registration', 4, false, 'Deed lodged, awaiting registration slot.'),

  ('MAT-2026-104', 'Due Diligence', 1, false, null),
  ('MAT-2026-104', 'Stamp Duty Payment', 2, false, null),
  ('MAT-2026-104', 'Deed Execution', 3, false, null),
  ('MAT-2026-104', 'Registration', 4, false, null),

  ('MAT-2026-105', 'Due Diligence', 1, true, null),
  ('MAT-2026-105', 'Stamp Duty Payment', 2, true, null),
  ('MAT-2026-105', 'Deed Execution', 3, true, null),
  ('MAT-2026-105', 'Registration', 4, true, null),

  ('MAT-2026-106', 'Due Diligence', 1, true, null),
  ('MAT-2026-106', 'Stamp Duty Payment', 2, true, null),
  ('MAT-2026-106', 'Deed Execution', 3, false, null),
  ('MAT-2026-106', 'Registration', 4, false, null)
) as v(matter_number, stage_name, stage_order, completed, remarks)
join conveyancing_matters mt on mt.matter_number = v.matter_number
where not exists (
  select 1 from registration_progress where registration_progress.matter_id = mt.matter_id and registration_progress.stage_name = v.stage_name
);

-- MAT-2026-010's case (case_id 9) already has two real uploaded documents --
-- link them in as shared documents for that matter's modal. None of the
-- other extra matters' cases have any documents rows yet, so their Shared
-- Documents section is left genuinely empty rather than pointing at
-- storage paths that don't exist.
insert into matter_documents (matter_id, document_id, is_required, is_verified, verified_by)
select mt.matter_id, d.document_id, true, false, null
from conveyancing_matters mt
join documents d on d.case_id = mt.case_id
where mt.matter_number = 'MAT-2026-010'
and not exists (
  select 1 from matter_documents where matter_documents.matter_id = mt.matter_id and matter_documents.document_id = d.document_id
);
