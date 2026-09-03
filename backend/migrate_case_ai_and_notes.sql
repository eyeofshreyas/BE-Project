-- Run once in the Supabase SQL editor before using the new case-detail-page
-- features (checklist notes + case-level AI summary).

alter table case_notes add column if not exists title text;
alter table case_notes add column if not exists checklist jsonb;
alter table case_notes add column if not exists pinned boolean not null default false;

create table if not exists case_ai_summaries (
  case_id bigint primary key references cases(case_id) on delete cascade,
  summary_text text not null,
  related_cases jsonb not null default '[]',
  generated_at timestamptz not null default now()
);

-- seed: one checklist-style note per case that doesn't have one yet
insert into case_notes (case_id, lawyer_id, title, note, checklist)
select ca.case_id, la.lawyer_id, v.title, v.note, v.checklist::jsonb
from (values
  ('CIV2026001', 'rohan.mehta@example.com', 'Deed Verification',
   'Confirmed the 1998 sale deed is registered but missing the notarized transfer affidavit. Need this before the next hearing.',
   '[{"text":"Request certified copy of 1998 deed","checked":true},{"text":"Cross-check succession certificate","checked":false},{"text":"File objection to third-party sale deed","checked":false}]'),
  ('FAM2026001', 'priya.nair@example.com', 'Client Call Notes',
   'Client confirmed no further heirs exist. Awaiting notarized affidavit.',
   '[{"text":"Collect notarized affidavit","checked":false}]')
) as v(case_number, lawyer_email, title, note, checklist)
join cases ca on ca.case_number = v.case_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (
  select 1 from case_notes where case_notes.case_id = ca.case_id and case_notes.title = v.title
);
