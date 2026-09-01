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
CLIENT=3). Does NOT        = unrestricted, admin only).  i.e. closes the gap require_roles
check *which* records      A lawyer's set = case_lawyers  leaves open: role-correct but
they may touch.            rows with is_active=True;      not authorized for *this*
                           a client's = cases for their    specific case/invoice/hearing/
                           client_id.                      etc. Use whenever a case_id
                                                            the caller already supplied
                                                            (path param, body field) needs
                                                            a per-record check.
```

Which controllers use which:

- **`require_roles` only** -- routes with no per-record ownership to check,
  just a role gate: `users.py` (admin-only user management),
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
  `change_case_status`, `unassign_lawyer`, `upload_document`,
  `delete_document`. `conveyancing.py`'s `_ensure_matter_access` and
  `documents.py`/`billing.py`/`hearings.py`/`meetings.py`'s internal
  `_get_*` helpers resolve a non-case ID (`matter_id`, `document_id`,
  `invoice_id`, `hearing_id`, `meeting_id`) to its owning `case_id` first,
  then apply the same check.

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

## Domain -> route -> controller -> model map

| Domain | Route file | Controller file | Model file |
|---|---|---|---|
| Cases | `routes/cases.py` | `controllers/cases.py` | `models/cases.py` |
| Case history (notes/timeline/status) | `routes/case_history.py` | `controllers/case_history.py` | `models/case_history.py` |
| Client requests (invite/accept) | `routes/client_requests.py` | `controllers/client_requests.py` | `models/client_requests.py` |
| Clients | `routes/clients.py` | `controllers/clients.py` | `models/clients.py` |
| Conveyancing matters | `routes/conveyancing.py` | `controllers/conveyancing.py` | `models/conveyancing.py` |
| Documents | `routes/documents.py` | `controllers/documents.py` | `models/documents.py` |
| Billing (invoices/payments/expenses) | `routes/billing.py` | `controllers/billing.py` | `models/billing.py` |
| Meetings | `routes/meetings.py` | `controllers/meetings.py` | `models/meetings.py` |
| Hearings | `routes/hearings.py` | `controllers/hearings.py` | `models/hearings.py` |
| Judgements | `routes/judgements.py` | `controllers/judgements.py` | `models/judgements.py` |
| Reference data (courts/case types/judges/roles/document types) | `routes/reference.py` | `controllers/reference.py` | `models/reference.py` |
| Users (admin) | `routes/users.py` | `controllers/users.py` | `models/users.py` |
| Notifications | `routes/notifications.py` | `controllers/notifications.py` | `models/notifications.py` |
| AI: similar cases | mounted in `main.py` from `app/ml/similar_cases.py` | same file (`app/ml/similar_cases.py`) | inline Pydantic models in that file |
| AI: summarize | mounted in `main.py` from `app/ml/summarize.py` | same file | inline models in that file |
| AI: translate | mounted in `main.py` from `app/ml/translate.py` | same file | inline models in that file |
| Auth (signup/login/forgot-password) | defined directly in `main.py` | `main.py` | inline Pydantic models in `main.py` |
