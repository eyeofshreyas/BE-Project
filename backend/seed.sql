-- Dev-database seed data for manual/UI testing against a live Supabase backend.
-- Run this in the Supabase SQL editor (or `psql`) against your dev project.
--
-- NOTE on login: `users` rows here are plain relational rows, matched to a
-- Supabase Auth session by email in app/middleware/auth.py's
-- get_current_profile() (`.eq("email", current_user.email)`) -- there's no
-- UUID linkage to auth.users. That means these seeded users are enough for
-- every read/relational path (admin views, lists, exports) but can't log in
-- as-is, since plain SQL can't create Supabase Auth accounts. To log in as
-- one of them: call POST /signup with the same email (it inserts into
-- `users`/`lawyers`/`clients` again, so either seed only the *_number/id
-- reference data below and let /signup create the people, or delete the
-- matching seeded `users` row first) -- or create the account in the
-- Supabase Auth dashboard with that email and update this file's users to
-- match, or just use /signup's own flow for anyone you need to click through
-- the app as.
--
-- Gotcha: POST /signup (self-service) rejects @example.com addresses with
-- "email_address_invalid" -- Supabase's signup endpoint blocklists reserved
-- domains like example.com/.org/.net. Dashboard "Add user" and the Admin API
-- are unaffected (they bypass that check), so use one of those for the
-- seeded emails below, not self-service signup.
--
-- Safe to re-run: reference/lookup tables use ON CONFLICT DO NOTHING; people
-- and case data use a WHERE NOT EXISTS guard keyed on a natural unique value
-- (email, case_number, matter_number, invoice_number).
--
-- No schema/migration file exists in this repo (Supabase owns the schema),
-- so column names below were reverse-engineered from every .table()/.select()
-- /.insert() call in backend/app/controllers/*.py and app/main.py. Date/time
-- columns are cast (::date/::time/::timestamptz) on the assumption they're
-- typed that way, per normal schema convention -- drop the casts if your
-- schema stores them as text instead.

-- === Reference data ===

insert into roles (role_id, role_name, description) values
  (1, 'Admin', 'Full system access'),
  (2, 'Lawyer', 'Manages cases, clients and billing'),
  (3, 'Client', 'Views own cases, documents and invoices')
on conflict (role_id) do nothing;

insert into case_types (case_type_name, description)
select * from (values
  ('Civil', 'Civil disputes'),
  ('Criminal', 'Criminal proceedings'),
  ('Family', 'Family and matrimonial matters'),
  ('Corporate', 'Corporate and commercial matters'),
  ('Property', 'Property and conveyancing matters')
) as v(case_type_name, description)
where not exists (select 1 from case_types where case_types.case_type_name = v.case_type_name);

insert into courts (court_name, court_type, city, state, address)
select * from (values
  ('City Civil Court', 'District Court', 'Bengaluru', 'Karnataka', '1 Kempegowda Road, Bengaluru'),
  ('High Court of Karnataka', 'High Court', 'Bengaluru', 'Karnataka', 'Ambedkar Veedhi, Bengaluru'),
  ('Sub-Registrar Office, Indiranagar', 'Registration Office', 'Bengaluru', 'Karnataka', '100 Ft Road, Indiranagar, Bengaluru')
) as v(court_name, court_type, city, state, address)
where not exists (select 1 from courts where courts.court_name = v.court_name);

insert into judges (judge_name, designation, court_id)
select v.judge_name, v.designation, c.court_id
from (values
  ('Justice A. Rangarajan', 'Principal District Judge', 'City Civil Court'),
  ('Justice S. Iyer', 'Judge', 'High Court of Karnataka')
) as v(judge_name, designation, court_name)
join courts c on c.court_name = v.court_name
where not exists (select 1 from judges where judges.judge_name = v.judge_name);

insert into document_types (type_name, description)
select * from (values
  ('Affidavit', 'Sworn written statement'),
  ('Contract', 'Signed agreement'),
  ('Court Order', 'Order issued by a court'),
  ('Identity Proof', 'Government-issued ID')
) as v(type_name, description)
where not exists (select 1 from document_types where document_types.type_name = v.type_name);

-- === People ===
-- password_hash is always 'managed_by_supabase_auth' in this app (see
-- app/main.py signup()) -- it's not read anywhere, Supabase Auth owns the
-- real credential.

insert into users (role_id, full_name, email, phone, is_active, password_hash)
select * from (values
  (1, 'Asha Admin', 'asha.admin@example.com', '9800000001', true, 'managed_by_supabase_auth'),
  (2, 'Rohan Mehta', 'rohan.mehta@example.com', '9800000002', true, 'managed_by_supabase_auth'),
  (2, 'Priya Nair', 'priya.nair@example.com', '9800000003', true, 'managed_by_supabase_auth'),
  (2, 'Karan Verma', 'karan.verma@example.com', '9800000004', true, 'managed_by_supabase_auth'),
  (3, 'Neha Kulkarni', 'neha.kulkarni@example.com', '9800000005', true, 'managed_by_supabase_auth'),
  (3, 'Vikram Shah', 'vikram.shah@example.com', '9800000006', true, 'managed_by_supabase_auth'),
  (3, 'Ritu Desai', 'ritu.desai@example.com', '9800000007', false, 'managed_by_supabase_auth')
) as v(role_id, full_name, email, phone, is_active, password_hash)
where not exists (select 1 from users where users.email = v.email);

insert into lawyers (user_id, bar_council_number, specialization, experience_years)
select u.user_id, v.bar_council_number, v.specialization, v.experience_years
from (values
  ('rohan.mehta@example.com', 'KAR/1234/2012', 'Civil Litigation', 14),
  ('priya.nair@example.com', 'KAR/5678/2016', 'Family Law', 9),
  ('karan.verma@example.com', 'KAR/9012/2019', 'Corporate Law', 6)
) as v(email, bar_council_number, specialization, experience_years)
join users u on u.email = v.email
where not exists (select 1 from lawyers where lawyers.user_id = u.user_id);

insert into clients (user_id, address, preferred_language)
select u.user_id, v.address, v.preferred_language
from (values
  ('neha.kulkarni@example.com', '221 MG Road, Bengaluru', 'English'),
  ('vikram.shah@example.com', '45 Linking Road, Mumbai', 'Hindi'),
  ('ritu.desai@example.com', '9 SG Highway, Ahmedabad', 'Gujarati')
) as v(email, address, preferred_language)
join users u on u.email = v.email
where not exists (select 1 from clients where clients.user_id = u.user_id);

-- === Cases ===

insert into cases (case_number, case_title, client_id, court_id, case_type_id, status, priority, filing_date, next_hearing_date)
select v.case_number, v.case_title, cl.client_id, co.court_id, ct.case_type_id, v.status, v.priority, v.filing_date::date, v.next_hearing_date::date
from (values
  ('CIV2026001', 'Kulkarni vs. Metro Builders', 'neha.kulkarni@example.com', 'City Civil Court', 'Civil', 'Open', 'High', '2026-02-10', '2026-09-15'),
  ('FAM2026001', 'Shah Matrimonial Matter', 'vikram.shah@example.com', 'City Civil Court', 'Family', 'In Progress', 'Medium', '2026-03-05', '2026-09-20'),
  ('COR2026001', 'Desai Enterprises Contract Dispute', 'ritu.desai@example.com', 'High Court of Karnataka', 'Corporate', 'Open', 'Medium', '2026-04-18', null),
  ('PROP2026001', 'Kulkarni Property Registration', 'neha.kulkarni@example.com', 'Sub-Registrar Office, Indiranagar', 'Property', 'Open', 'Low', '2026-05-01', null)
) as v(case_number, case_title, client_email, court_name, case_type_name, status, priority, filing_date, next_hearing_date)
join clients cl on cl.user_id = (select user_id from users where email = v.client_email)
join courts co on co.court_name = v.court_name
join case_types ct on ct.case_type_name = v.case_type_name
where not exists (select 1 from cases where cases.case_number = v.case_number);

insert into case_lawyers (case_id, lawyer_id, assigned_role, is_active)
select ca.case_id, la.lawyer_id, v.assigned_role, true
from (values
  ('CIV2026001', 'rohan.mehta@example.com', 'Primary'),
  ('FAM2026001', 'priya.nair@example.com', 'Primary'),
  ('COR2026001', 'karan.verma@example.com', 'Primary'),
  ('PROP2026001', 'rohan.mehta@example.com', 'Primary')
) as v(case_number, lawyer_email, assigned_role)
join cases ca on ca.case_number = v.case_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (
  select 1 from case_lawyers where case_lawyers.case_id = ca.case_id and case_lawyers.lawyer_id = la.lawyer_id
);

insert into case_notes (case_id, lawyer_id, note)
select ca.case_id, la.lawyer_id, v.note
from (values
  ('CIV2026001', 'rohan.mehta@example.com', 'Initial client consultation completed. Builder agreement reviewed.'),
  ('FAM2026001', 'priya.nair@example.com', 'Filed for mutual consent divorce. Awaiting cooling-off period.'),
  ('COR2026001', 'karan.verma@example.com', 'Sent demand notice to opposing party regarding breach of contract.')
) as v(case_number, lawyer_email, note)
join cases ca on ca.case_number = v.case_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (
  select 1 from case_notes where case_notes.case_id = ca.case_id and case_notes.note = v.note
);

insert into case_timeline (case_id, event_type, event_title, event_description, created_by)
select ca.case_id, v.event_type, v.event_title, v.event_description, u.user_id
from (values
  ('CIV2026001', 'case_created', 'Case filed', 'Case CIV2026001 filed with City Civil Court.', 'rohan.mehta@example.com'),
  ('FAM2026001', 'case_created', 'Case filed', 'Case FAM2026001 filed with City Civil Court.', 'priya.nair@example.com'),
  ('CIV2026001', 'hearing_scheduled', 'Hearing scheduled', 'First hearing scheduled for 2026-09-15.', 'rohan.mehta@example.com'),
  ('COR2026001', 'case_created', 'Case filed', 'Case COR2026001 filed with High Court of Karnataka.', 'karan.verma@example.com')
) as v(case_number, event_type, event_title, event_description, created_by_email)
join cases ca on ca.case_number = v.case_number
join users u on u.email = v.created_by_email
where not exists (
  select 1 from case_timeline where case_timeline.case_id = ca.case_id and case_timeline.event_title = v.event_title
);

insert into case_status_history (case_id, previous_status, current_status, changed_by)
select ca.case_id, v.previous_status, v.current_status, u.user_id
from (values
  ('FAM2026001', 'Open', 'In Progress', 'priya.nair@example.com')
) as v(case_number, previous_status, current_status, changed_by_email)
join cases ca on ca.case_number = v.case_number
join users u on u.email = v.changed_by_email
where not exists (
  select 1 from case_status_history where case_status_history.case_id = ca.case_id and case_status_history.current_status = v.current_status
);

-- === Hearings & judgements ===

insert into hearings (case_id, judge_id, hearing_date, hearing_time, courtroom, hearing_status, hearing_outcome, next_hearing_date, notes)
select ca.case_id, j.judge_id, v.hearing_date::date, v.hearing_time::time, v.courtroom, v.hearing_status, v.hearing_outcome, v.next_hearing_date::date, v.notes
from (values
  ('CIV2026001', 'Justice A. Rangarajan', '2026-09-15', '10:30', 'Courtroom 4', 'Scheduled', null, null, 'First hearing, both parties to appear.'),
  ('FAM2026001', 'Justice A. Rangarajan', '2026-09-20', '11:00', 'Courtroom 2', 'Scheduled', null, null, null),
  ('CIV2026001', 'Justice A. Rangarajan', '2026-07-01', '10:00', 'Courtroom 4', 'Completed', 'Adjourned', '2026-09-15', 'Adjourned at defendant''s request.')
) as v(case_number, judge_name, hearing_date, hearing_time, courtroom, hearing_status, hearing_outcome, next_hearing_date, notes)
join cases ca on ca.case_number = v.case_number
join judges j on j.judge_name = v.judge_name
where not exists (
  select 1 from hearings where hearings.case_id = ca.case_id and hearings.hearing_date = v.hearing_date::date
);

insert into judgements (case_id, citation, court, bench, judgement_date, outcome, summary, relief_text, relief_amount, appeal_status, tags, created_by)
select ca.case_id, v.citation, v.court, v.bench, v.judgement_date::date, v.outcome, v.summary, v.relief_text, v.relief_amount, v.appeal_status, v.tags, u.user_id
from (values
  ('COR2026001', '2026 KAR HC 4521', 'High Court of Karnataka', 'Justice S. Iyer', '2026-06-20', 'Favourable',
   'Court ruled in favour of the plaintiff, finding breach of contract by the defendant.',
   'Defendant ordered to pay damages within 30 days.', 500000.00, 'None', array['contract', 'damages'], 'karan.verma@example.com')
) as v(case_number, citation, court, bench, judgement_date, outcome, summary, relief_text, relief_amount, appeal_status, tags, created_by_email)
join cases ca on ca.case_number = v.case_number
join users u on u.email = v.created_by_email
where not exists (select 1 from judgements where judgements.citation = v.citation);

-- === Billing ===

insert into invoices (case_id, invoice_number, amount, tax, total_amount, issue_date, due_date, payment_status, remarks)
select ca.case_id, v.invoice_number, v.amount, v.tax, v.total_amount, v.issue_date::date, v.due_date::date, v.payment_status, v.remarks
from (values
  ('CIV2026001', 'INV-2026-001', 25000.00, 4500.00, 29500.00, '2026-07-01', '2026-07-31', 'Paid', 'Consultation and filing fees'),
  ('FAM2026001', 'INV-2026-002', 15000.00, 2700.00, 17700.00, '2026-08-01', '2026-08-31', 'Partially Paid', 'Filing fees'),
  ('COR2026001', 'INV-2026-003', 60000.00, 10800.00, 70800.00, '2026-08-15', '2026-09-14', 'Pending', 'Litigation fees')
) as v(case_number, invoice_number, amount, tax, total_amount, issue_date, due_date, payment_status, remarks)
join cases ca on ca.case_number = v.case_number
where not exists (select 1 from invoices where invoices.invoice_number = v.invoice_number);

insert into payments (invoice_id, amount, payment_method, transaction_reference, payment_date, payment_status)
select i.invoice_id, v.amount, v.payment_method, v.transaction_reference, v.payment_date::date, v.payment_status
from (values
  ('INV-2026-001', 29500.00, 'Bank Transfer', 'TXN20260702001', '2026-07-02', 'Completed'),
  ('INV-2026-002', 8000.00, 'UPI', 'TXN20260805002', '2026-08-05', 'Completed')
) as v(invoice_number, amount, payment_method, transaction_reference, payment_date, payment_status)
join invoices i on i.invoice_number = v.invoice_number
where not exists (
  select 1 from payments where payments.invoice_id = i.invoice_id and payments.transaction_reference = v.transaction_reference
);

-- === Documents ===
-- file_path points at storage objects that don't actually exist in the
-- `documents` bucket; fine for list/detail views, download URLs won't
-- resolve unless you also upload matching files to storage.

insert into documents (case_id, document_type_id, uploaded_by, file_name, file_path, file_size, mime_type, is_deleted)
select ca.case_id, dt.document_type_id, u.user_id, v.file_name, v.file_path, v.file_size, v.mime_type, false
from (values
  ('CIV2026001', 'Contract', 'rohan.mehta@example.com', 'builder_agreement.pdf', 'case-seed/builder_agreement.pdf', 245000, 'application/pdf'),
  ('FAM2026001', 'Affidavit', 'priya.nair@example.com', 'mutual_consent_affidavit.pdf', 'case-seed/mutual_consent_affidavit.pdf', 98000, 'application/pdf'),
  ('COR2026001', 'Court Order', 'karan.verma@example.com', 'demand_notice.pdf', 'case-seed/demand_notice.pdf', 51000, 'application/pdf')
) as v(case_number, document_type_name, uploaded_by_email, file_name, file_path, file_size, mime_type)
join cases ca on ca.case_number = v.case_number
join document_types dt on dt.type_name = v.document_type_name
join users u on u.email = v.uploaded_by_email
where not exists (select 1 from documents where documents.file_path = v.file_path);

insert into ai_summaries (document_id, summary_text, translated_text, keywords, important_dates, important_sections)
select d.document_id, v.summary_text, v.translated_text, v.keywords, v.important_dates, v.important_sections
from (values
  ('case-seed/builder_agreement.pdf', 'Agreement between client and Metro Builders for construction of a residential unit, with a possession deadline and penalty clause for delay.', null, 'construction, possession, penalty', '2026-12-31 possession deadline', 'Clause 7: Penalty for delay')
) as v(file_path, summary_text, translated_text, keywords, important_dates, important_sections)
join documents d on d.file_path = v.file_path
where not exists (select 1 from ai_summaries where ai_summaries.document_id = d.document_id);

-- === Meetings ===

insert into meetings (case_id, conducted_by, meeting_title, meeting_type, meeting_date, duration_minutes, agenda, meeting_status)
select ca.case_id, la.lawyer_id, v.meeting_title, v.meeting_type, v.meeting_date::timestamptz, v.duration_minutes, v.agenda, v.meeting_status
from (values
  ('CIV2026001', 'rohan.mehta@example.com', 'Case strategy review', 'In-person', '2026-09-05 15:00+05:30', 45, 'Discuss hearing preparation and evidence.', 'Scheduled'),
  ('FAM2026001', 'priya.nair@example.com', 'Client update call', 'Video Call', '2026-08-20 11:00+05:30', 30, 'Update client on filing status.', 'Completed')
) as v(case_number, lawyer_email, meeting_title, meeting_type, meeting_date, duration_minutes, agenda, meeting_status)
join cases ca on ca.case_number = v.case_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (
  select 1 from meetings where meetings.case_id = ca.case_id and meetings.meeting_title = v.meeting_title
);

insert into meeting_participants (meeting_id, user_id, participant_role)
select m.meeting_id, u.user_id, v.participant_role
from (values
  ('Case strategy review', 'rohan.mehta@example.com', 'Lawyer'),
  ('Case strategy review', 'neha.kulkarni@example.com', 'Client'),
  ('Client update call', 'priya.nair@example.com', 'Lawyer'),
  ('Client update call', 'vikram.shah@example.com', 'Client')
) as v(meeting_title, user_email, participant_role)
join meetings m on m.meeting_title = v.meeting_title
join users u on u.email = v.user_email
where not exists (
  select 1 from meeting_participants where meeting_participants.meeting_id = m.meeting_id and meeting_participants.user_id = u.user_id
);

-- === Notifications ===

insert into notifications (user_id, case_id, title, message, notification_type, is_read)
select u.user_id, ca.case_id, v.title, v.message, v.notification_type, v.is_read
from (values
  ('neha.kulkarni@example.com', 'CIV2026001', 'Hearing scheduled', 'A hearing has been scheduled for 2026-09-15.', 'hearing_scheduled', false),
  ('vikram.shah@example.com', 'FAM2026001', 'Payment reminder', 'Invoice INV-2026-002 for 17700.0 is due. Please arrange payment at your earliest convenience.', 'invoice_reminder', false),
  ('rohan.mehta@example.com', 'CIV2026001', 'New client request', 'Neha Kulkarni accepted your request. Case CIV2026001 was created.', 'client_request', true)
) as v(user_email, case_number, title, message, notification_type, is_read)
join users u on u.email = v.user_email
join cases ca on ca.case_number = v.case_number
where not exists (
  select 1 from notifications where notifications.user_id = u.user_id and notifications.title = v.title and notifications.case_id = ca.case_id
);

-- === Client requests ===
-- one pending request to an existing client, one pending invite to an email
-- with no account yet (exercises the /signup backfill path in app/main.py).

insert into client_requests (lawyer_id, client_id, invite_email, court_id, case_type_id, message, status)
select la.lawyer_id, cl.client_id, null, co.court_id, ct.case_type_id, v.message, 'pending'
from (values
  ('karan.verma@example.com', 'ritu.desai@example.com', 'High Court of Karnataka', 'Corporate', 'Would like to represent you on an upcoming corporate matter.')
) as v(lawyer_email, client_email, court_name, case_type_name, message)
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
join clients cl on cl.user_id = (select user_id from users where email = v.client_email)
join courts co on co.court_name = v.court_name
join case_types ct on ct.case_type_name = v.case_type_name
where not exists (select 1 from client_requests where client_requests.client_id = cl.client_id and client_requests.status = 'pending');

insert into client_requests (lawyer_id, client_id, invite_email, court_id, case_type_id, message, status)
select la.lawyer_id, null, v.invite_email, co.court_id, ct.case_type_id, v.message, 'pending'
from (values
  ('priya.nair@example.com', 'new.client.invite@example.com', 'City Civil Court', 'Family', 'Please sign up on LexFlow to view your case.')
) as v(lawyer_email, invite_email, court_name, case_type_name, message)
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
join courts co on co.court_name = v.court_name
join case_types ct on ct.case_type_name = v.case_type_name
where not exists (select 1 from client_requests where client_requests.invite_email = v.invite_email);

-- === Conveyancing ===
-- due_diligence / registration_progress / property_registrations /
-- matter_documents have no INSERT call anywhere in the app (only
-- select/update), so their FK-to-lawyers column names below (lawyer_id /
-- registered_by / verified_by) are a best-effort guess from the API's output
-- field names, not confirmed against app code -- adjust if your schema
-- differs.

insert into properties (property_name, address, city, state, property_type, survey_number, market_value, land_area, builtup_area)
select * from (values
  ('Kulkarni Residence', '221 MG Road', 'Bengaluru', 'Karnataka', 'Residential', 'SY-114/2', 8500000.00, 2400.00, 1800.00)
) as v(property_name, address, city, state, property_type, survey_number, market_value, land_area, builtup_area)
where not exists (select 1 from properties where properties.property_name = v.property_name);

insert into conveyancing_matters (case_id, property_id, matter_number, matter_type, transaction_type, registration_status, completion_percentage, expected_completion_date)
select ca.case_id, p.property_id, v.matter_number, v.matter_type, v.transaction_type, v.registration_status, v.completion_percentage, v.expected_completion_date::date
from (values
  ('PROP2026001', 'Kulkarni Residence', 'MAT-2026-001', 'Sale Deed', 'Sale', 'Pending', 40, '2026-11-30')
) as v(case_number, property_name, matter_number, matter_type, transaction_type, registration_status, completion_percentage, expected_completion_date)
join cases ca on ca.case_number = v.case_number
join properties p on p.property_name = v.property_name
where not exists (select 1 from conveyancing_matters where conveyancing_matters.matter_number = v.matter_number);

insert into conveyancing_parties (matter_id, party_name, role)
select mt.matter_id, v.party_name, v.role
from (values
  ('MAT-2026-001', 'Neha Kulkarni', 'Buyer'),
  ('MAT-2026-001', 'Metro Builders Pvt Ltd', 'Seller')
) as v(matter_number, party_name, role)
join conveyancing_matters mt on mt.matter_number = v.matter_number
where not exists (
  select 1 from conveyancing_parties where conveyancing_parties.matter_id = mt.matter_id and conveyancing_parties.party_name = v.party_name
);

insert into due_diligence (matter_id, title_clear, tax_verified, encumbrance_checked, litigation_checked, lawyer_id, remarks)
select mt.matter_id, v.title_clear, v.tax_verified, v.encumbrance_checked, v.litigation_checked, la.lawyer_id, v.remarks
from (values
  ('MAT-2026-001', true, true, false, true, 'rohan.mehta@example.com', 'Encumbrance certificate pending from sub-registrar.')
) as v(matter_number, title_clear, tax_verified, encumbrance_checked, litigation_checked, lawyer_email, remarks)
join conveyancing_matters mt on mt.matter_number = v.matter_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (select 1 from due_diligence where due_diligence.matter_id = mt.matter_id);

insert into registration_progress (matter_id, stage_name, stage_order, completed, remarks)
select mt.matter_id, v.stage_name, v.stage_order, v.completed, v.remarks
from (values
  ('MAT-2026-001', 'Due Diligence', 1, true, 'Completed except encumbrance check.'),
  ('MAT-2026-001', 'Stamp Duty Payment', 2, false, null),
  ('MAT-2026-001', 'Deed Execution', 3, false, null),
  ('MAT-2026-001', 'Registration', 4, false, null)
) as v(matter_number, stage_name, stage_order, completed, remarks)
join conveyancing_matters mt on mt.matter_number = v.matter_number
where not exists (
  select 1 from registration_progress where registration_progress.matter_id = mt.matter_id and registration_progress.stage_name = v.stage_name
);

insert into matter_documents (matter_id, document_id, is_required, is_verified, verified_by)
select mt.matter_id, d.document_id, true, false, null
from conveyancing_matters mt
join documents d on d.file_path = 'case-seed/builder_agreement.pdf'
where mt.matter_number = 'MAT-2026-001'
and not exists (
  select 1 from matter_documents where matter_documents.matter_id = mt.matter_id and matter_documents.document_id = d.document_id
);

-- Extra matters (numbered *-101.. to stay clear of app-generated MAT-2026-00N
-- numbers) so the dashboard table/filters have more than one row to page
-- through. conveyancing_matters.case_id and properties.address are NOT
-- NULL, so each gets its own lightweight case, same shape create_matter()
-- opens for a matter created via the "New Matter" form.

insert into properties (property_name, address, city, state, property_type, survey_number, market_value, land_area, builtup_area)
select * from (values
  ('Smith Residence', '12 Baker Street', 'Bengaluru', 'Karnataka', 'Residential', 'SY-201', 6500000.00, 2200.00, 1600.00),
  ('Acme Corp Block B', 'Whitefield Industrial Area', 'Bengaluru', 'Karnataka', 'Commercial', 'SY-330', 22000000.00, 8000.00, 6500.00),
  ('Williams Apartment', '7 Residency Road', 'Bengaluru', 'Karnataka', 'Residential', 'SY-410', 9800000.00, 1500.00, 1200.00),
  ('Chen Off-Plan Unit', 'Sarjapur Road Phase 2', 'Bengaluru', 'Karnataka', 'Residential', 'SY-512', 7200000.00, 1300.00, 1050.00),
  ('Unit 8', '8 Commercial Street', 'Bengaluru', 'Karnataka', 'Commercial', 'SY-88', 4300000.00, 900.00, 750.00),
  ('Smith Family Trust Property', 'Trust Estate, Jayanagar', 'Bengaluru', 'Karnataka', 'Residential', 'SY-777', 15000000.00, 3200.00, 2400.00)
) as v(property_name, address, city, state, property_type, survey_number, market_value, land_area, builtup_area)
where not exists (select 1 from properties where properties.property_name = v.property_name);

insert into cases (case_number, case_title, client_id, court_id, case_type_id, status, priority)
select v.case_number, v.case_title, cl.client_id, co.court_id, ct.case_type_id, 'Open', v.priority
from (values
  ('PROP2026101', 'Smith Residence', 'neha.kulkarni@example.com', 'High'),
  ('PROP2026102', 'Acme Corp Block B', 'vikram.shah@example.com', 'Medium'),
  ('PROP2026103', 'Williams Apartment', 'ritu.desai@example.com', 'Medium'),
  ('PROP2026104', 'Chen Off-Plan Unit', 'neha.kulkarni@example.com', 'Low'),
  ('PROP2026105', 'Unit 8', 'vikram.shah@example.com', 'Medium'),
  ('PROP2026106', 'Smith Family Trust Property', 'ritu.desai@example.com', 'Low')
) as v(case_number, case_title, client_email, priority)
join clients cl on cl.user_id = (select user_id from users where email = v.client_email)
join courts co on co.court_name = 'Sub-Registrar Office, Indiranagar'
join case_types ct on ct.case_type_name = 'Property'
where not exists (select 1 from cases where cases.case_number = v.case_number);

insert into case_lawyers (case_id, lawyer_id, assigned_role, is_active)
select ca.case_id, la.lawyer_id, 'Primary', true
from (values
  ('PROP2026101', 'rohan.mehta@example.com'),
  ('PROP2026102', 'priya.nair@example.com'),
  ('PROP2026103', 'karan.verma@example.com'),
  ('PROP2026104', 'rohan.mehta@example.com'),
  ('PROP2026105', 'priya.nair@example.com'),
  ('PROP2026106', 'karan.verma@example.com')
) as v(case_number, lawyer_email)
join cases ca on ca.case_number = v.case_number
join lawyers la on la.user_id = (select user_id from users where email = v.lawyer_email)
where not exists (
  select 1 from case_lawyers where case_lawyers.case_id = ca.case_id and case_lawyers.lawyer_id = la.lawyer_id
);

insert into conveyancing_matters (case_id, property_id, matter_number, matter_type, transaction_type, registration_status, completion_percentage, expected_completion_date)
select ca.case_id, p.property_id, v.matter_number, v.matter_type, v.transaction_type, v.registration_status, v.completion_percentage, v.expected_completion_date::date
from (values
  ('PROP2026101', 'Smith Residence', 'MAT-2026-101', 'Residential Sale', 'Sale', 'Documents Pending', 20, '2026-11-05'),
  ('PROP2026102', 'Acme Corp Block B', 'MAT-2026-102', 'Commercial Lease', 'Lease', 'Drafting', 10, '2026-11-20'),
  ('PROP2026103', 'Williams Apartment', 'MAT-2026-103', 'Residential Purchase', 'Purchase', 'Lodged', 70, '2026-10-10'),
  ('PROP2026104', 'Chen Off-Plan Unit', 'MAT-2026-104', 'Off-the-Plan Purchase', 'Purchase', 'Drafting', 15, '2027-02-01'),
  ('PROP2026105', 'Unit 8', 'MAT-2026-105', 'Mortgage', 'Mortgage', 'Registered', 100, '2026-08-01'),
  ('PROP2026106', 'Smith Family Trust Property', 'MAT-2026-106', 'Trust Deed', 'Trust Deed', 'Registration Scheduled', 50, null)
) as v(case_number, property_name, matter_number, matter_type, transaction_type, registration_status, completion_percentage, expected_completion_date)
join cases ca on ca.case_number = v.case_number
join properties p on p.property_name = v.property_name
where not exists (select 1 from conveyancing_matters where conveyancing_matters.matter_number = v.matter_number);

insert into conveyancing_parties (matter_id, party_name, role)
select mt.matter_id, v.party_name, v.role
from (values
  ('MAT-2026-101', 'Smith, J. & E.', 'Buyer'),
  ('MAT-2026-102', 'Acme Corp Ltd.', 'Lessee'),
  ('MAT-2026-103', 'Williams, T.', 'Buyer'),
  ('MAT-2026-104', 'Chen, L.', 'Buyer'),
  ('MAT-2026-105', 'David Miller', 'Borrower'),
  ('MAT-2026-106', 'Smith Family Trust', 'Trustee')
) as v(matter_number, party_name, role)
join conveyancing_matters mt on mt.matter_number = v.matter_number
where not exists (
  select 1 from conveyancing_parties where conveyancing_parties.matter_id = mt.matter_id and conveyancing_parties.party_name = v.party_name
);

insert into property_registrations (matter_id, office_name, registration_date, registration_status)
select mt.matter_id, 'Sub-Registrar Office, Indiranagar', v.registration_date::date, v.registration_status
from (values
  ('MAT-2026-101', '2026-10-12', 'Documents Pending'),
  ('MAT-2026-102', '2026-10-15', 'Drafting'),
  ('MAT-2026-103', '2026-10-20', 'Lodged'),
  ('MAT-2026-104', '2026-11-05', 'Drafting'),
  ('MAT-2026-105', '2026-11-10', 'Registered')
) as v(matter_number, registration_date, registration_status)
join conveyancing_matters mt on mt.matter_number = v.matter_number
where not exists (select 1 from property_registrations where property_registrations.matter_id = mt.matter_id);
