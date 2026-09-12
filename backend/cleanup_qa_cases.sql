-- Removes the throwaway cases left behind by QA/API testing, which otherwise sit
-- in every case list and in the corpus /ai/case-search ranks against.
-- Run in the Supabase SQL editor. NOT idempotent in any meaningful sense: it
-- deletes rows, so re-running it after the fact is simply a no-op.
--
-- Split into two parts on purpose -- part 1 is safe, part 2 is not.

-- ---------------------------------------------------------------------------
-- Part 1: five empty probe cases. Nothing references them except a
-- case_lawyers assignment row each -- no hearings, documents, notes, timeline,
-- meetings, invoices or matters. case_lawyers has no ON DELETE CASCADE, so the
-- assignment has to go first or the case delete fails on the foreign key.
-- ---------------------------------------------------------------------------
delete from case_lawyers
where case_id in (
  select case_id from cases where case_number in (
    'PROP2026010', 'CIV2026003', 'COR2026002', 'FAM2026002', 'PRO2026001')
);

delete from cases
where case_number in (
  'PROP2026010',  -- "QA Property Purchase"
  'CIV2026003',   -- "QA probe 1"
  'COR2026002',   -- "QA probe 6"
  'FAM2026002',   -- "QA probe 3"
  'PRO2026001'    -- "QA probe 4"
);

-- ---------------------------------------------------------------------------
-- Part 2: the two test cases that have real dependent rows, INCLUDING PAYMENT
-- RECORDS. Read before running -- this is not just tidying up case rows.
--
--   TEST2026001 "Test Matter"
--     invoice INV-182822, 17,700, marked Paid, with a payment row
--
--   CIV2026002 "Civil matter - API Test client"
--     1 hearing, 3 live documents (+1 soft-deleted) with objects in storage,
--     3 timeline events, 1 meeting, 1 AI summary, 2 notifications,
--     invoice INV-QA-1789148854, 11,800, Partially Paid, with a payment row
--
-- Children are deleted explicitly rather than relying on cascade, since the
-- schema does not declare ON DELETE CASCADE on all of these (case_lawyers in
-- particular does not).
-- The storage objects under case-18/ are NOT removed by this script.
-- ---------------------------------------------------------------------------
-- delete from payments where invoice_id in (
--   select invoice_id from invoices where case_id in (
--     select case_id from cases where case_number in ('TEST2026001', 'CIV2026002')));
--
-- delete from invoices          where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from notifications     where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from case_ai_summaries where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from case_timeline     where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from meetings          where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from documents         where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from hearings          where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from case_lawyers      where case_id in (select case_id from cases where case_number in ('TEST2026001', 'CIV2026002'));
-- delete from cases             where case_number in ('TEST2026001', 'CIV2026002');
