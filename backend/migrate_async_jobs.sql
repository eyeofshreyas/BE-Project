-- Run once in the Supabase SQL editor: adds job status tracking for the two operations that
-- moved off the request thread and into a FastAPI BackgroundTasks job -- document
-- summarization (app/ml/summarize.py) and eCourts sync (app/controllers/ecourts.py).
--
-- Both endpoints now return immediately and the frontend polls the row for a result, so each
-- needs a status the poller can watch: 'pending' while the background task runs, then 'done'
-- or 'error'. ai_summaries.summary_text becomes nullable because a 'pending' row has no
-- summary yet. ecourts_status already holds the *provider's* case status vocabulary
-- (PENDING/DISPOSED) so sync progress gets its own column rather than overloading that one.

alter table ai_summaries alter column summary_text drop not null;
alter table ai_summaries add column if not exists status text not null default 'done';
alter table ai_summaries add column if not exists error_message text;
update ai_summaries set status = 'done' where status is null;

alter table cases add column if not exists ecourts_sync_status text not null default 'idle';
alter table cases add column if not exists ecourts_sync_error text;
update cases set ecourts_sync_status = 'idle' where ecourts_sync_status is null;
