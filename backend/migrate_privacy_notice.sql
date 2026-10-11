-- Run once in the Supabase SQL editor: records *when* a user consented to the privacy
-- notice, for DPDP Act 2023 §5 (notice) / §6 (consent) evidence.
--
-- SignUpPage.tsx already has a required "I agree to the Privacy Policy" checkbox that
-- gates submission (canSubmit), so by the time /signup is called, consent has already
-- been given -- this just makes the backend stamp when, instead of only the frontend
-- enforcing that it happened.
--
-- Existing rows are left NULL rather than backfilled to now(): they signed up before this
-- column existed, so we have no real consent timestamp for them, and claiming one would be
-- inaccurate. NULL here means "predates consent-timestamp tracking", not "never consented".

alter table users add column if not exists privacy_notice_accepted_at timestamptz;

create or replace function complete_signup(
  p_role               text,
  p_email              text,
  p_full_name          text,
  p_phone              text,
  p_org_name           text,
  p_invite_id          bigint,
  p_bar_council_number text,
  p_specialization     text,
  p_experience_years   int,
  p_address            text,
  p_preferred_language text
)
returns bigint
language plpgsql
as $$
declare
  v_org_id    bigint;
  v_user_id   bigint;
  v_client_id bigint;
  v_role_id   int;
begin
  if p_role = 'admin' then
    v_role_id := 1;
    insert into organizations (name) values (trim(p_org_name))
    returning org_id into v_org_id;
    insert into platform_settings (org_id) values (v_org_id);

  elsif p_role = 'lawyer' then
    v_role_id := 2;
    select org_id into v_org_id from lawyer_invites
      where invite_id = p_invite_id and status = 'pending';
    if not found then
      raise exception 'invite_not_pending';
    end if;

  elsif p_role = 'client' then
    v_role_id := 3;

  else
    raise exception 'unknown_role: %', p_role;
  end if;

  begin
    insert into users (role_id, full_name, email, password_hash, phone, org_id, privacy_notice_accepted_at)
    values (v_role_id, p_full_name, p_email, 'managed_by_supabase_auth', p_phone, v_org_id, now())
    returning user_id into v_user_id;
  exception when unique_violation then
    raise exception 'duplicate_email';
  end;

  if p_role = 'lawyer' then
    begin
      insert into lawyers (user_id, bar_council_number, specialization, experience_years)
      values (v_user_id, p_bar_council_number, p_specialization, p_experience_years);
    exception when unique_violation then
      raise exception 'duplicate_bar_council_number';
    end;
    update lawyer_invites set status = 'accepted' where invite_id = p_invite_id;

  elsif p_role = 'client' then
    insert into clients (user_id, address, preferred_language)
    values (v_user_id, p_address, p_preferred_language)
    returning client_id into v_client_id;

    -- A lawyer may have invited this email before the account existed; attach any such
    -- pending requests now that a client_id exists.
    update client_requests set client_id = v_client_id
      where invite_email = p_email and client_id is null and status = 'pending';

    if found then
      insert into notifications (user_id, case_id, title, message, notification_type, is_read)
      values (v_user_id, null, 'New client request',
              'You have a pending request from a lawyer on LexFlow.', 'client_request', false);
    end if;
  end if;
  -- role = 'admin': no lawyers/clients row -- an org admin isn't a lawyer profile.

  return v_user_id;
end;
$$;
