# Backend architecture

Reference doc for the FastAPI backend at `backend/app`. Covers the request
lifecycle, the auth/authorization call chain, the ML subprocess design, and
a domain-to-file map. It documents *what calls what and why*; the actual
business logic lives in the code and its inline comments.

## Request lifecycle

`backend/app/main.py` builds one `FastAPI()` app, adds CORS middleware, and
mounts one `APIRouter` per domain (`app.routes.*`, plus the ML routers under
`app.ml.*`). `main.py` itself only defines `/`, `/signup`, `/login`,
`/forgot-password`, and the `/protected` demo route -- everything else lives
in a domain's own router.

Every domain follows the same three-file layering:

```
routes/<domain>.py       APIRouter -- binds URL + method + response_model to
                          a controller function. No logic.
        |
        v
controllers/<domain>.py  Request handling: FastAPI Depends() for auth,
                          Supabase queries, row -> response-model shaping.
        |
        v
models/<domain>.py       Pydantic request/response schemas only.
```

`app/db/supabase_client.py` holds the one shared `supabase` client (built
from `SUPABASE_URL`/`SUPABASE_KEY` in `app/core/config.py`) that every
controller imports directly -- there's no repository/DAO layer in between.
It is constructed with an explicit `httpx.Client(http2=False, timeout=30s)`:
supabase-py's default HTTP/2 client multiplexes every request over one TCP
connection, which these threadpool-run sync controllers intermittently broke
(`httpx.ReadError` -> spurious 500/503s) when a dashboard fired ~6 fetches at
once. Don't remove that option without re-testing concurrent dashboard loads.

## Auth and authorization chain

All of it lives in `backend/app/middleware/auth.py`. Four layers, each
built on the one below:

```
Authorization: Bearer <token>
        |
        v
get_current_user(authorization)          verifies the token against Supabase
        |                                 Auth. 401 if rejected, 503 if Supabase
        |                                 Auth itself was unreachable (so a
        |                                 network blip doesn't look like a bad
        |                                 token). Used directly only by the
        |                                 /protected demo route in main.py.
        v
get_current_profile(current_user)        looks up the LexFlow `users` row for
        |                                 that email, 401 if none, 403 if
        |                                 is_active is false. This is the
        |                                 dependency almost every route uses.
        v
   +----+-------------------+----------------------------+
   |                        |                            |
require_roles(*role_ids)  get_scoped_case_ids(profile)  ensure_case_access(case_id, profile)
checks *what* the caller   returns the set of case_ids   raises 403 if case_id isn't in
is (ADMIN=1/LAWYER=2/      this profile may see (None    get_scoped_case_ids(profile) --
CLIENT=3/SUPER_ADMIN=4).   = unrestricted, super-admin    i.e. closes the gap require_roles
Does NOT check *which*     only). An org admin's set =    leaves open: role-correct but
records they may touch.    cases for their own org_id;    not authorized for *this*
                           a lawyer's = case_lawyers       specific case/invoice/hearing/
                           rows with is_active=True;       etc. Use whenever a case_id
                           a client's = cases for their    the caller already supplied
                           client_id.                      (path param, body field) needs
                                                            a per-record check.
```

Which controllers use which:

- **`require_roles` only** -- routes with no per-record ownership to check,
  just a role gate: `users.py` (admin-only user management; `update_own_profile`
  uses `get_current_profile` alone, since a user editing their own row needs no
  role at all), `admin.py` (stats/activity/analytics/settings -- org-scoped
  for ADMIN, platform-wide for SUPER_ADMIN),
  `client_requests.py`'s `send_client_request`/`respond_client_request`
  (ownership is checked by hand against `lawyer_id`/`client_id` instead,
  since there's no case yet), `clients.py`'s `list_clients`.
- **`get_scoped_case_ids` only** (list/read endpoints) -- `list_cases`,
  `list_invoices`, `list_hearings`, `list_meetings`, `list_judgements`,
  `list_expenses`, `conveyancing_summary`: fetch, then filter to the caller's
  scope, or return `[]` early if their scope is empty.
- **`ensure_case_access`** (write/single-record endpoints where the caller
  already has a `case_id`) -- `create_invoice`, `create_hearing`,
  `create_meeting`, `create_judgement`, `create_expense`, `add_case_note`,
  `update_case_note`, `delete_case_note`, `change_case_status`,
  `add_lawyer_to_case`, `remove_lawyer_from_case`, `list_available_case_lawyers`,
  `upload_document`, `delete_document`, and both
  `case_ai_summary.py` handlers. `conveyancing.py`'s `_ensure_matter_access` and
  `documents.py`/`billing.py`/`hearings.py`/`meetings.py`'s internal
  `_get_*` helpers resolve a non-case ID (`matter_id`, `document_id`,
  `invoice_id`, `hearing_id`, `meeting_id`) to its owning `case_id` first,
  then apply the same check.

- **Neither** -- `controllers/messages.py` has no case to scope to (a
  conversation belongs to a client+lawyer pair). It runs its own guards on
  top of `get_current_profile`: `_relationship_exists(client_id, lawyer_id)`
  before creating a conversation (an active `case_lawyers` row joining that
  lawyer to one of that client's cases -- the same invariant below, expressed
  pair-wise), and `_ensure_participant()` on every read/write of an existing
  thread (the caller must *be* the conversation's client or lawyer, resolved
  via `_own_client_id`/`_own_lawyer_id`; admins are not participants and get
  a 403 too).

The one invariant every other authorization check assumes: a
`case_lawyers` row with `is_active=True` is what grants a lawyer access to a
case (and, via `clients.list_clients`, visibility into that case's client).
Only two code paths are allowed to create that row --
`client_requests.respond_client_request` (client explicitly accepts an
invite) and `cases.create_case` (requires an already-accepted
`client_requests` row for that lawyer+client pair). Keep both in sync if
this invariant ever changes.

## ML subprocess architecture

Three AI features -- summarize, translate, similar-case search -- each need
a Python environment with heavy, mutually incompatible dependencies
(unsloth+LoRA for summarization, a different transformers pin for
translation, faiss+sentence-transformers for search). Rather than install
all of them into the backend's own venv, each feature shells out to a
separate script running in its own venv under `finetune-summarizer/`:

```
app/ml/summarize.py  ---\
app/ml/translate.py  ----+--> subprocess_utils.run_ml_subprocess(cmd, payload, ...)
app/ml/similar_cases.py -/            |
                                       v
                        subprocess.run([<other venv's python>, <runner script>],
                                        input=json.dumps(payload), ...)
                                       |
                                       v
                app/ml/runners/{summarize,translate,search}_runner.py
                  (each: sys.path.insert()s the matching finetune-summarizer/
                   subfolder, imports its load_model()/inference function,
                   reads one JSON payload from stdin, prints one JSON result
                   as the LAST line of stdout)
```

`run_ml_subprocess` (`app/ml/subprocess_utils.py`) is the single chokepoint:
it runs the command, enforces the timeout (504 on expiry), and parses
`stdout.strip().splitlines()[-1]` as JSON -- the *last* line specifically,
because some runners (e.g. unsloth) print a startup banner to stdout before
the actual result. A 0 exit code with no output, or a non-zero exit, both
map to a 500.

Each of the three `app/ml/*.py` callers reloads its model on every request
(a documented, deliberate `ponytail:` tradeoff -- a few seconds for search,
tens of seconds to minutes for summarize/translate); moving to a long-lived
worker process is the noted upgrade path if that latency becomes a problem.

`controllers/case_ai_summary.py` is a fourth caller of that machinery: it
reuses the *same* summarize and search runners (importing their venv/runner
paths from `app/ml/summarize.py` and `app/ml/similar_cases.py`), just fed a
case's notes + timeline text instead of one document, and upserts the result
into `case_ai_summaries`.

## External services and file storage

- **Supabase Storage** -- one bucket, `documents`, shared by three writers:
  case documents (`controllers/documents.py`, which owns the
  `DOCUMENTS_BUCKET` constant), conveyancing matter documents
  (`controllers/conveyancing.py`, which imports it), and message attachments
  (`controllers/messages.py`, under `conversation-{id}/`). Downloads are
  always short-lived signed URLs, never public paths.
- **Razorpay** (`controllers/billing.py`) -- the only outbound third-party
  API. `create_razorpay_order` opens an order for an invoice's outstanding
  balance; `verify_razorpay_payment` re-checks the checkout's HMAC signature
  *and* re-fetches the payment from Razorpay before writing a `payments` row
  (idempotent on `transaction_reference`), so nothing about the amount or
  status is trusted from the browser. Both 500 via `_razorpay_auth()` if
  `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are unset; the rest of the app runs
  fine without them.
- **SMTP** (`app/core/email.py`) -- invoice reminders, password mail, and lawyer/client
  invites. Invite emails (`admin.invite_lawyer`, `client_requests.send_client_request`) send
  via FastAPI `BackgroundTasks` after the response goes out, since the invite row is already
  committed and there's nothing left for the caller to wait on.

## Background jobs (`BackgroundTasks`)

Two request-thread-blocking calls -- eCourts sync and document-triggered `/ai/summarize` --
were moved to FastAPI `BackgroundTasks` jobs: the endpoint validates, writes a pending/syncing
status, queues the task, and returns immediately. The frontend polls the existing read
endpoint for the result. There's no request left to raise an `HTTPException` to once the
background function runs, so failures are written into the same status column instead of
returned to a caller.

- **eCourts sync** (`controllers/ecourts.py`) -- `sync_case_from_ecourts` sets
  `cases.ecourts_sync_status = "syncing"` and queues `_run_ecourts_sync`; poll `GET /cases`
  for `ecourts_sync_status` to flip to `"idle"` (success, see `ecourts_status`/`ecourts_raw`)
  or `"error"` (see `ecourts_sync_error`).
- **Document summarize** (`app/ml/summarize.py`) -- `summarize_text` only queues a job when
  `document_id` is given and no text was posted (text extraction + OCR + model inference is
  the slow path; pasted text is still answered inline). It upserts `ai_summaries.status =
  "pending"` and queues `_run_summarize_job`; poll `GET /documents/{id}/summary` for `status`
  to flip to `"done"` (see `summary_text`) or `"error"` (see `error_message`).
- Both jobs' status columns were added by `migrate_async_jobs.sql`.

## Domain -> route -> controller -> model map

| Domain | Route file | Controller file | Model file |
|---|---|---|---|
| Cases | `routes/cases.py` | `controllers/cases.py` | `models/cases.py` |
| Case AI summary (`/cases/:id/ai-summary`) | `routes/cases.py` | `controllers/case_ai_summary.py` | `models/case_ai_summary.py` |
| Messaging (conversations/messages) | `routes/messages.py` | `controllers/messages.py` | `models/messages.py` |
| Case history (notes/timeline/status) | `routes/case_history.py` | `controllers/case_history.py` | `models/case_history.py` |
| Client requests (invite/accept) | `routes/client_requests.py` | `controllers/client_requests.py` | `models/client_requests.py` |
| Clients | `routes/clients.py` | `controllers/clients.py` | `models/clients.py` |
| Conveyancing matters | `routes/conveyancing.py` | `controllers/conveyancing.py` | `models/conveyancing.py` |
| Documents | `routes/documents.py` | `controllers/documents.py` | `models/documents.py` |
| Billing (invoices/payments/expenses) | `routes/billing.py` | `controllers/billing.py` | `models/billing.py` |
| Trust accounting (client money/reconciliation) | `routes/trust.py` | `controllers/trust.py` | `models/trust.py` |
| Meetings | `routes/meetings.py` | `controllers/meetings.py` | `models/meetings.py` |
| Hearings | `routes/hearings.py` | `controllers/hearings.py` | `models/hearings.py` |
| eCourts CNR sync (`/cases/:id/sync-ecourts`) | `routes/cases.py` | `controllers/ecourts.py` | `models/cases.py` |
| Judgements | `routes/judgements.py` | `controllers/judgements.py` | `models/judgements.py` |
| Reference data (courts/case types/judges/roles/document types) | `routes/reference.py` | `controllers/reference.py` | `models/reference.py` |
| Users (admin roster, edit, hard delete + self-service profile) | `routes/users.py` | `controllers/users.py` | `models/users.py` |
| Admin console (stats/activity/analytics/settings) | `routes/admin.py` | `controllers/admin.py` | `models/admin.py` |
| Notifications | `routes/notifications.py` | `controllers/notifications.py` | `models/notifications.py` |
| AI: similar cases | mounted in `main.py` from `app/ml/similar_cases.py` | same file (`app/ml/similar_cases.py`) | inline Pydantic models in that file |
| AI: case search (own cases) | mounted in `main.py` from `app/ml/case_search.py` | same file | inline models in that file |
| AI: summarize | mounted in `main.py` from `app/ml/summarize.py` | same file | inline models in that file |
| AI: translate | mounted in `main.py` from `app/ml/translate.py` | same file | inline models in that file |
| Auth (signup/login/forgot-password) | defined directly in `main.py` | `main.py` | inline Pydantic models in `main.py` |
