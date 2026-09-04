-- Run once in the Supabase SQL editor: the `judgements` table referenced by
-- app/controllers/judgements.py and seed.sql was never created.

create table if not exists judgements (
  judgement_id bigint generated always as identity primary key,
  case_id bigint not null references cases(case_id) on delete cascade,
  citation text not null,
  court text not null,
  bench text not null,
  judgement_date date not null,
  outcome text not null check (outcome in ('Favourable', 'Partly Favourable', 'Against', 'Settled')),
  summary text not null,
  relief_text text,
  relief_amount numeric,
  appeal_status text,
  tags text[],
  created_by bigint references users(user_id),
  created_at timestamptz not null default now()
);

create index if not exists judgements_case_id_idx on judgements(case_id);

-- seed: same block as seed.sql, repeated here so this migration is self-contained
insert into judgements (case_id, citation, court, bench, judgement_date, outcome, summary, relief_text, relief_amount, appeal_status, tags, created_by)
select ca.case_id, v.citation, v.court, v.bench, v.judgement_date::date, v.outcome, v.summary, v.relief_text, v.relief_amount, v.appeal_status, v.tags, u.user_id
from (values
  ('COR2026001', '2026 KAR HC 4521', 'High Court of Karnataka', 'Justice S. Iyer', '2026-06-20', 'Favourable',
   'Court ruled in favour of the plaintiff, finding breach of contract by the defendant.',
   'Defendant ordered to pay damages within 30 days.', 500000.00, 'None', array['contract', 'damages'], 'karan.verma@example.com'),
  ('COR2026001', '2026 KAR HC 5210', 'High Court of Karnataka', 'Justice S. Iyer', '2026-08-25', 'Favourable',
   'Appellate bench upheld the damages award with interest.',
   'Damages upheld with 8% interest p.a.', 540000.00, 'None', array['contract', 'appeal'], 'karan.verma@example.com'),
  ('CIV2026001', '2026 KAR CC 1187', 'City Civil Court', 'Justice A. Rangarajan', '2026-08-05', 'Partly Favourable',
   'Court granted partial possession to the plaintiff but reduced the claimed damages.',
   'Partial possession granted; damages reduced', 150000.00, 'Appeal filed by defendant', array['possession', 'civil'], 'rohan.mehta@example.com'),
  ('FAM2026001', '2026 KAR FC 342', 'City Civil Court', 'Justice M. Iyer', '2026-07-10', 'Settled',
   'Matter settled via mediation; consent decree recorded.',
   'Consent decree on maintenance and custody', null, 'None', array['family', 'mediation'], 'priya.nair@example.com'),
  ('PROP2026001', '2026 KAR SR 88', 'Sub-Registrar Office, Indiranagar', 'Registrar S. Bhat', '2026-06-01', 'Against',
   'Registration objection upheld against the applicant; deed rejected for defective title.',
   null, null, 'Appeal under consideration', array['property', 'registration'], 'rohan.mehta@example.com')
) as v(case_number, citation, court, bench, judgement_date, outcome, summary, relief_text, relief_amount, appeal_status, tags, created_by_email)
join cases ca on ca.case_number = v.case_number
join users u on u.email = v.created_by_email
where not exists (select 1 from judgements where judgements.citation = v.citation);
