-- Run once in the Supabase SQL editor. Adds two things to the messaging feature
-- (backend/app/controllers/messages.py):
--   1. per-participant read markers, so the thread list can show unread counts
--   2. a single optional file attachment per message (image / video / document)

-- 1. Unread tracking. One timestamp per side of the conversation rather than a
-- message_reads join table: a conversation only ever has two participants, so
-- "everything after this instant is unread" is the whole state we need.
alter table conversations add column if not exists client_last_read_at timestamptz;
alter table conversations add column if not exists lawyer_last_read_at timestamptz;

-- 2. Attachments. Files live in the existing `documents` storage bucket under
-- conversation-{id}/, so no new bucket has to be provisioned.
alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_name text;
alter table messages add column if not exists attachment_type text;
alter table messages add column if not exists attachment_size bigint;

-- A message may now carry only a file, with no text.
alter table messages alter column body drop not null;

-- Unread counting filters by conversation + sender + time on every list load.
create index if not exists messages_conversation_created_idx
  on messages(conversation_id, created_at);
