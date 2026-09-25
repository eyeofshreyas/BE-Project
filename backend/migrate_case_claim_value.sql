-- Run once in the Supabase SQL editor, and run it BEFORE deploying the commit that adds
-- this file: CASES_SELECT (app/controllers/cases.py) already requests claim_value and
-- create_case already sends p_claim_value, so against a database that hasn't run this yet,
-- GET /cases and POST /cases 500 for every role, not just the Firm Analytics tab -- this
-- migration widens the whole case list's blast radius, unlike earlier ones that only broke
-- their own feature until applied.
--
-- Adds cases.claim_value (nullable -- every existing case is simply excluded from the Firm
-- Analytics exposure total until someone sets it), and threads it through
-- create_case_with_lawyer so a case can get a claim value at filing time as well as
-- afterward (see app/controllers/cases.py's update_case_claim_value for the "afterward" path).

alter table cases add column if not exists claim_value numeric;

-- create_case_with_lawyer's parameter list is changing (a new trailing param),
-- which Postgres treats as a different function signature -- CREATE OR REPLACE
-- alone would leave the old 10-arg version around as a second overload and make
-- future calls ambiguous, so drop it explicitly first (same pattern used in
-- migrate_trust_accounting.sql).
drop function if exists create_case_with_lawyer(text, text, bigint, bigint, bigint, bigint, text, date, text, bigint);

create or replace function create_case_with_lawyer(
  p_case_number       text,
  p_case_title        text,
  p_client_id         bigint,
  p_court_id          bigint,
  p_case_type_id      bigint,
  p_org_id            bigint,
  p_priority          text,
  p_next_hearing_date date,
  p_description       text,
  p_lawyer_id         bigint,
  p_claim_value       numeric default null
)
returns bigint
language plpgsql
as $$
declare
  v_case_id bigint;
begin
  insert into cases (
    case_number, case_title, client_id, court_id, case_type_id, org_id,
    status, priority, next_hearing_date, description, claim_value
  )
  values (
    p_case_number, p_case_title, p_client_id, p_court_id, p_case_type_id, p_org_id,
    'Open', p_priority, p_next_hearing_date, p_description, p_claim_value
  )
  returning case_id into v_case_id;

  insert into case_lawyers (case_id, lawyer_id, assigned_role, is_active)
  values (v_case_id, p_lawyer_id, 'Primary', true);

  if p_description is not null and length(trim(p_description)) > 0 then
    insert into case_notes (case_id, lawyer_id, note)
    values (v_case_id, p_lawyer_id, p_description);
  end if;

  return v_case_id;
end;
$$;
