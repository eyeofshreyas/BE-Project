-- Run once in the Supabase SQL editor: atomic case creation.
--
-- cases.create_case() used to insert into cases, then case_lawyers, then (optionally)
-- case_notes as three separate REST calls. If the process died or the network dropped
-- between any two of them, the case survived with no Primary lawyer attached, or with a
-- Primary lawyer but no opening note -- and nothing rolled the first insert back, unlike a
-- real transaction. One plpgsql function makes the three inserts atomic: PostgREST already
-- runs each request (including an RPC call) in its own transaction, so if any insert here
-- raises, the whole call rolls back and no case is left half-created.

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
  p_lawyer_id         bigint
)
returns bigint
language plpgsql
as $$
declare
  v_case_id bigint;
begin
  insert into cases (
    case_number, case_title, client_id, court_id, case_type_id, org_id,
    status, priority, next_hearing_date, description
  )
  values (
    p_case_number, p_case_title, p_client_id, p_court_id, p_case_type_id, p_org_id,
    'Open', p_priority, p_next_hearing_date, p_description
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
