-- Run once in the Supabase SQL editor: adds Leegality e-signature tracking to documents.
--
-- esign_document_id is Leegality's own document ID once a signature request is sent
-- (app/controllers/esign.py's request_signature()). esign_status mirrors Leegality's own
-- status vocabulary (SENT/COMPLETED) rather than this app's own workflow status, same
-- reasoning migrate_ecourts_sync.sql used for cases.ecourts_status. esign_signed_file_path
-- is the storage path of the signed PDF once handle_esign_webhook() downloads it back from
-- Leegality's short-lived CDN link. Re-running is safe.

alter table documents add column if not exists esign_document_id text unique;
alter table documents add column if not exists esign_status text;
alter table documents add column if not exists esign_signed_file_path text;
