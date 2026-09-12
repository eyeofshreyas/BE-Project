-- Run once in the Supabase SQL editor: records *when* a document was soft-deleted.
--
-- delete_document only ever set is_deleted, so a deleted row carried no timestamp and
-- there was no way to tell a file deleted a year ago from one deleted by mistake a minute
-- ago. reap_storage.py needs that distinction: it permanently removes the stored object,
-- and the grace period is what makes that safe.
--
-- Rows already flagged are backfilled to now() rather than to their upload date, so the
-- first reap can't take a file that was deleted before this column existed -- they each
-- get a full grace period starting from this migration.

alter table documents add column if not exists deleted_at timestamptz;

update documents set deleted_at = now()
where is_deleted = true and deleted_at is null;
