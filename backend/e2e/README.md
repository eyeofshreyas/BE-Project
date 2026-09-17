# End-to-end checks

These drive the **running** app — a real backend against real Supabase, and for
the UI script a real browser — rather than the mocked units in `backend/tests/`.
Run them before handing a build to QA, or after any change to auth, billing or
documents.

They are plain scripts, not pytest: each prints a PASS/FAIL line per step and a
summary at the end, and exits after printing every failure rather than stopping
at the first.

## Running

Start the stack first (`./start.sh` from the repo root), then, from `backend/`:

```bash
.venv/bin/python e2e/test_api_flows.py            # cases, hearings, billing, messaging
.venv/bin/python e2e/test_documents_and_admin.py  # documents, conveyancing, signup, admin
.venv/bin/python e2e/test_ui_routes.py            # every route, in each role, in headless Chrome
```

`test_ui_routes.py` needs the frontend on :5173 and `google-chrome-stable`; it
talks to Chrome over the DevTools protocol using `websockets`, which the backend
already depends on. Nothing else to install.

## Accounts

They sign in as a seeded demo firm (`backend/seed_demo_firm.py`). After a fresh
seed, point them at the new accounts:

```bash
E2E_ADMIN=seed-admin-ab12c@example.com \
E2E_LAWYER=seed-lawyer1-ab12c@example.com \
E2E_CLIENT=seed-client1-ab12c@example.com \
  .venv/bin/python e2e/test_api_flows.py
```

`E2E_OTHER_CLIENT`, `E2E_OTHER_LAWYER` and `E2E_PASSWORD` override the rest.

## What they write

The API scripts create real rows — cases titled `E2E QA Matter <date>`,
invoices numbered `E2E-<date>-<case>`, a conveyancing matter, an uploaded and
then deleted document, and a signup per run. That is the point (they test the
write paths), but it does accumulate: clear it out periodically the way
`backend/cleanup_qa_cases.sql` does.
