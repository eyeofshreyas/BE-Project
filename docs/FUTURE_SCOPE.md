# LexFlow — Future Scope

Work that's deliberately deferred, with why and what unblocks it. Not a spec for
undecided ideas — everything here has a concrete trigger for when to pick it up.
Prioritization and market context are in the [market/compliance brief](https://claude.ai/code/artifact/6bc8dcba-d386-4268-94ec-d4382b712d45).

---

## 1. eCourts integration follow-ups

CNR-based status sync shipped (`app/controllers/ecourts.py`, `PATCH /cases/{id}/cnr`,
`POST /cases/{id}/sync-ecourts`) — manual, one case at a time, storing the raw response
in `cases.ecourts_raw` for future use. Two things were deliberately left out of v1:

### 1.1 Auto-creating hearing rows from eCourts data

Field shape confirmed from the official docs (`https://ecourtsindia.com/api/docs`, v4.0)
without needing a live API key — no account is provisioned yet. `GET /api/partner/case/{cnr}`
returns `data.courtCaseData.historyOfCaseHearings`, an array of
`{ judge, businessOnDate, hearingDate, purposeOfListing }` (district-court cases; shape may
vary for High Court/Supreme Court CNRs, unconfirmed). Example from the docs:

```json
{ "judge": "Chief Metropolitan Magistrate", "businessOnDate": "2016-04-07",
  "hearingDate": "2016-05-19", "purposeOfListing": "Misc./ Appearance" }
```

Note this whole object sits under `data.courtCaseData`, not directly under `data` —
`sync_case_from_ecourts()` originally read `caseStatus`/`courtCode` off the wrong level
(always `null`/`n/a`); fixed once this was confirmed.

`judge` is a free-text name string, not this app's `judges.judge_id` — there's no lookup
or create endpoint for `judges` today (it's seed-only, see `app/controllers/reference.py`),
so an unmatched name needs either a name-match against existing judges or a way to create
one on the fly.

**Unblocked by:** an eCourtsIndia API key (real account, not just docs) to confirm this
holds for a live response and to see whether High Court/Supreme Court CNRs use the same
field. Once confirmed, extend `sync_case_from_ecourts()` to diff `historyOfCaseHearings`
against existing `hearings` rows for the case and insert any hearing eCourts knows about
that LexFlow doesn't, following the same insert + `add_timeline_event()` pattern
`create_hearing()` already uses in `app/controllers/hearings.py`.

### 1.2 Scheduled bulk sync (no manual click needed)

v1 requires a lawyer to open a case and click "Sync with eCourts." The eCourtsIndia API
has no webhooks — it's a polling model (`POST /api/partner/case/bulk-refresh` with up to
50 CNRs, then poll `bulk-refresh-status`, then re-fetch each case). A daily cron isn't
built yet.

**Unblocked by:** manual sync being used enough to justify it — no sense building a
scheduler for a button nobody's clicked yet. When it's time: a scheduled job (cron,
Supabase Edge Function, or APScheduler in the backend process) batching every case with
a non-null `cnr_number` through the bulk-refresh flow, reusing `sync_case_from_ecourts()`'s
per-case update logic rather than duplicating it.

### 1.3 Auto-filling filing/registration number and acts & sections from eCourts

`cases.filing_number`, `registration_number`, and `acts_sections` shipped as manually
entered fields (`PATCH /cases/{id}/filing-details`) — a case's own court-assigned numbers,
distinct from `cases.case_number` (LexFlow's internal reference) and from
`conveyancing_matters`' registration fields (a property transaction's registration-office
record, a different entity). The real eCourts case-status page shows all three (Filing
Number/Date, Registration Number/Date, Under Acts/Under Sections), so `sync_case_from_ecourts()`
is the obvious place to fill them in automatically instead of by hand once a CNR is linked.

**Not done because the field shape isn't confirmed for this API**, unlike
`historyOfCaseHearings` in §1.1, which was confirmed straight from the docs. Two attempts to
read `https://ecourtsindia.com/api/docs` for this (`WebFetch`, then `curl` with a browser
user-agent) both got HTTP 403 — the site blocks this environment's outbound requests
entirely, docs page included. Guessing at key names (`filingNumber` vs `filing_number` vs
something else `courtCaseData` doesn't even call it) risks the same silent-`null` bug
`caseStatus`/`courtCode` already hit once from reading the wrong nesting level — worse here,
since a wrong guess just writes nothing and looks shipped.

**Unblocked by:** an eCourtsIndia API key (real account) to make one live `GET
/api/partner/case/{cnr}` call and read the actual field names back, the same way §1.1 is
unblocked. Once confirmed, extend `sync_case_from_ecourts()` to read them off `case_data`
alongside `caseStatus`/`courtCode`, additively (only overwrite a field eCourts actually
returned a value for, so a manually-entered value isn't blanked by a case eCourts hasn't
indexed yet).

---

## 2. Feature gaps vs. the market (from the competitive review)

Not started. Ordered by the priority set in the market brief.

| # | Feature | Why it's next | Notes |
|---|---|---|---|
| 1 | ~~eCourts / CNR sync~~ | Done (§1) | Manual sync only — see follow-ups above |
| 2 | ~~Document OCR~~ | Done (§1.1 below) | Scanned PDFs and image uploads now feed the existing summarize/translate pipeline |
| 3 | ~~E-signatures~~ | Done (§4 below) | Leegality, PDF documents only |
| 4 | ~~Conflict-of-interest check~~ | Done (§5 below) | Firm-wide name search, MyCase-style — not Clio's full report/status workflow |
| 5 | ~~Basic trust accounting / reconciliation~~ | Done (below) | Per-firm client ledger and 3-way reconciliation; bank balance entered by hand |

### Document OCR — how it landed

Turned out not to need the subprocess-per-venv treatment guessed at above: Tesseract via
`pytesseract` is a thin wrapper around a system binary, not a torch/GPU model, so it lives
directly in `extract_document_text()` (`app/controllers/documents.py`) next to the
existing pypdf path — same pattern pypdf already used, no new venv. A PDF with no text
layer (a scan) now renders each page via `pdf2image` and OCRs it; `image/*` uploads OCR
directly. Requires the `tesseract-ocr` and `poppler-utils` system packages (see
`SETUP.md`) — missing either degrades to a clear 500, not a crash.

### E-signatures — how it landed

Bought, not built — see the [market brief](https://claude.ai/code/artifact/6bc8dcba-d386-4268-94ec-d4382b712d45) for why. Only 7 CCA-licensed eSign Service Providers
(ESPs) in India can legally perform Aadhaar-based cryptographic signing; Leegality is an
ASP (Application Service Provider) that integrates with one behind its API, the same role
Clio's DocuSign integration and MyCase's native eSignature play for their markets. Chosen
over Digio for self-serve access — Leegality issues API credentials immediately from
account settings, Digio gates its API behind an enterprise sales conversation.

Integrated in `app/controllers/esign.py`: `request_signature()` sends a stored PDF to
Leegality's `POST /v3.0/sign/request` against a pre-configured Workflow (`profileId`,
created once in the Leegality dashboard — not something this app creates via API); the
`documents` table tracks `esign_document_id`/`esign_status` in Leegality's own vocabulary
(same reasoning as `cases.ecourts_status`). `handle_esign_webhook()` receives Leegality's
signing-event callbacks at `POST /webhooks/leegality` — deliberately outside the app's
normal auth, since Leegality (not a logged-in user) calls it; instead it verifies the
payload's `mac` field (`HMAC-SHA1(documentId, privateSalt)`). On a `Completed` document it
downloads the signed PDF from Leegality's CDN link immediately (that link expires in 15
seconds) and stores it in LexFlow's own Storage bucket rather than depending on Leegality
to keep serving it.

**Left out of v1, deliberately:**

- **Multi-signer / countersigning.** The backend already accepts a `signers` list; the
  frontend form sends one signer at a time. Extend the form, not the API, once a document
  genuinely needs more than one signer.
- **Only PDF documents can be signed** — Leegality's API doesn't accept other formats, and
  neither does this integration. A Word doc or scan would need converting to PDF first,
  which isn't wired up.
- **No per-request webhook override.** `customURL.webhookURL`/`errorWebhookURL` (settable
  per invitee in the Create Request payload) aren't sent — the webhook URL comes from
  whatever's configured on the Workflow itself in the Leegality dashboard. Fine for a
  single deployment; would need setting explicitly if LexFlow ever runs multiple
  environments against one Leegality account.
- **~~Rejection/expiry events weren't distinguished from a normal in-progress signature~~ —
  fixed.** Leegality's own rejection *and* expiry payloads leave `documentStatus` as
  `"Sent"`, identical to a document nobody's acted on yet — the real signal is in the
  `request` object: `action == "Rejected"` for a rejection, `expired == true` (with
  `action` left `null`) for an expired invite. The webhook handler checks both before
  falling back to `documentStatus`, sets `esign_status` to `REJECTED`/`EXPIRED`
  distinctly, and the Documents page shows a red pill plus a "Resend" action for either,
  instead of the document looking stuck pending forever.

### Conflict-of-interest check — how it landed

Researched Clio's approach (a full workflow: multi-field search, flex/exact matching,
per-result status marking, a closeable PDF report associated with a matter) against
MyCase's (no dedicated feature at all — "conflict checking" is just their existing global
search bar). Built the MyCase-style version: the ethical requirement is catching the match
*before* opening the file, not generating an audit-ready report on day one.

The real gap this exposed: a `case` only ever recorded **the client** — there was nowhere
to record the **opposing party**, the single most important name a conflict check needs.
Added `case_parties` (`case_id`, `name`, `role`) for that. `GET /conflict-check?name=...`
(`app/controllers/conflict_check.py`) is deliberately **not** scoped to the caller's own
cases the way every other list endpoint in this app is — it fetches every case and every
party firm-wide and matches in Python (plain case-insensitive substring, not fuzzy/
phonetic — fine at a small firm's scale). Scoping it would hide exactly the conflicts that
matter: a colleague's client you'd never otherwise see. Wired into `CreateCasePage` as an
advisory search (doesn't block case creation) and into the case detail page as a "Parties"
card for recording the opposing party, which is what makes that name searchable for the
*next* lawyer's check.

**Left out of v1, deliberately** (Clio's fuller workflow, not needed yet):

- Conflict-status marking (clear / potential / waived) per result.
- A generated, downloadable, shareable report tied to a matter as an audit record.
- Fuzzy/phonetic name matching — a real search index (`pg_trgm`, `similarity()`) is the
  upgrade path if plain substring matching starts missing real matches, or the firm's data
  grows large enough that fetching every case/party per search gets slow.

### Trust accounting — how it landed

Ledger in `trust_transactions`, endpoints in `app/controllers/trust.py`, a Trust account
card on the client detail page and a Trust tab in the admin console.

Two things worth knowing if you touch this:

**Trust money is per firm, not per client.** A client can retain several firms (see
`org_clients`), and each firm has its own trust bank account, so every row carries an
`org_id` and a "balance" always means *with this firm*. The super-admin belongs to no firm
and has to name one via `?org_id=`.

**The three legs have to come from different places or the check is theatre.** Leg 1 is
the hand-entered bank statement. Leg 3 is recomputed from `trust_transactions.amount`.
Leg 2 is the `trust_control_totals` table — the firm's control account, one row per date,
posted to by the `trust_guard_and_post()` trigger and never recomputed afterwards.
Editing an amount in the database, or deleting a row, moves leg 3 and not leg 2, which is
the entire point; derive both from the same amounts and they agree by construction no
matter what has been tampered with.

Both legs are filed under `transaction_date`, never insert order. An earlier revision
stamped the control total onto each ledger row instead, and read leg 2 off the last row
by date — so a deposit that cleared on the 5th but was keyed in on the 12th reported a
gap the size of the deposit against books that were perfectly correct. Anything that
removes ledger rows outside the API (the user-delete cascade is the only one) has to post
a reversing entry to the control account or it reintroduces exactly that false alarm.

That same trigger is where the no-negative-balance rule actually holds: the controller
checks it too, for a clear error message, but a controller check is read-then-write and
two concurrent disbursements both pass it.

Not built: bank-feed import, multi-currency, interest on held funds, and per-client
statements as a downloadable document.

---

## 3. Compliance (not an engineering task)

One-time legal/compliance review before any public launch or paid onboarding — not
blocking continued feature work, per the [market brief](https://claude.ai/code/artifact/6bc8dcba-d386-4268-94ec-d4382b712d45)'s compliance section:

- DPDP Act 2023 registration and consent-capture flow.
- Privacy policy written to the legal-confidentiality standard (attorney-client
  privilege), not just general privacy-law minimums.
- Liability review before shipping any AI *drafting* feature (summarization, already
  shipped, is lower-risk than generating notices/applications a lawyer might file
  with light review).

Technical groundwork already in place: layered RBAC + per-object case ownership checks
(`app/middleware/auth.py`), and an audit trail on case status changes and now eCourts
syncs (`case_timeline`, `add_timeline_event()`).

### Encryption posture

- **In transit** — Supabase's REST, Auth, and Storage APIs are TLS-only; this is Supabase's
  platform guarantee, not app config. The FastAPI backend itself must be served over HTTPS in
  production, but this repo doesn't pin a production host yet (see `SETUP.md`), so that's a
  deployment-time requirement to confirm when one is chosen, not something the app code
  enforces or could enforce on its own.
- **At rest** — Supabase's underlying Postgres database and Storage buckets are encrypted at
  rest by default (AWS-managed keys), as part of the Supabase platform. Not something this
  app configures, and not something it could opt out of.
- **File access control** — documents and message attachments live in private Storage
  buckets, never a public one; every read goes through a short-lived signed URL
  (`documents.py`'s document preview/download, `messages.py`'s `_attachment_url()`) rather
  than a permanent link. Encryption at rest is paired with per-request, time-limited access,
  not a bucket anyone with the URL can read forever.
- **No application-level (field-level) encryption, deliberately.** Supabase's at-rest
  encryption already covers the "disk or backup stolen" threat model, which is what DPDP and
  the confidentiality standard above are actually concerned with. Encrypting specific columns
  ourselves would need key management this app doesn't have, and would break the `ilike`/
  full-text matching the conflict-check and judgment search rely on. Revisit only if a
  specific field (a bank account number, a national ID) needs to stay unreadable even to
  someone with raw database access — nothing currently stored needs that.

### Data retention & deletion policy

- **Active data has no automatic expiry.** Cases, documents, messages, invoices, hearings,
  and everything else persist indefinitely once created — nothing in the app deletes them
  by age on its own. Note: bar associations typically set a minimum retention period for
  closed matters (often several years, varying by matter type), and nothing here encodes
  that yet. That minimum has to come from the legal review below, not an engineering guess.

- **A single document's deletion is soft, then permanent after a grace period.**
  `delete_document()` (`app/controllers/documents.py`) sets `is_deleted`/`deleted_at`; the
  storage object itself is only physically removed by `reap_storage.py`, run manually, after
  a 30-day default grace period (`--days` overridable, dry-run by default). The `documents`
  row is kept forever afterward as a tombstone — what was deleted, by whom, when — even once
  the underlying file is gone. `reap_storage.py` isn't scheduled yet ([#17](https://github.com/eyeofshreyas/BE-Project/issues/17)), so in
  practice the grace period only actually expires when someone runs it by hand.

- **Account deletion — the mechanism behind DPDP's "right to erasure" — is a hard,
  irreversible cascade, not a soft delete.** `delete_user_cascade()`
  (`migrate_delete_user_cascade.sql`), reached through `DELETE /users/{id}` and gated by
  `_assert_deletable()`:
  - Deleting a **client** deletes their entire case tree outright — cases, hearings,
    meetings, invoices, payments, documents (rows and storage objects), notes, timeline,
    AI summaries, conveyancing matters, judgement references, notifications. No grace
    period, no undo. Refused up front while the client's trust balance is above zero.
  - Deleting a **lawyer** leaves cases alone (the client owns them, not the lawyer) — only
    their own case assignments, notes, client-request invites, and conversations are
    removed. Their attribution on records that survive (a case-timeline entry, a document
    upload, a conducted meeting) is anonymized — `created_by`/`uploaded_by`/etc. set to
    null — rather than the record itself being deleted, since it isn't this person's data
    to take with them.
  - A deleted client's trust-ledger detail is removed, but a reversing entry is posted to
    `trust_control_totals` first, so the firm's aggregate books stay correct even though
    that individual's transaction history is gone.
  - **Gap:** the person's Supabase Auth login is *not* removed by this cascade (see the
    correctness backlog, §4.2) — a "deleted" account can still authenticate until someone
    removes it from the Auth dashboard by hand.

- **Not covered here, and not an app-code decision:** Supabase's own backup retention (a
  project setting, not something this codebase configures) doesn't have a stated policy
  either. Worth a line in the same legal review once a production Supabase plan/region is
  chosen.

Still open: confirming the production backend host actually terminates TLS once one is
chosen (a hosting-config item, not an app-code one), and setting the actual minimum
retention period for closed matters — that number has to come from the legal review, not
from this document.

---

## 4. Audit findings (2026-09-18) — queued fixes

A read of the backend and frontend against the open issue list turned up eighteen things
none of the existing issues covered. Unlike everything above, **these are defects, not
deferred features** — they're recorded here because the fix is scheduled for a later
cycle, not because something external unblocks them. The trigger for §4.1–§4.5 is simply
the next fix cycle. Only §4.6 has a real external trigger.

Six are filed: [#20](https://github.com/eyeofshreyas/BE-Project/issues/20)–[#25](https://github.com/eyeofshreyas/BE-Project/issues/25). The rest are recorded here and
not yet filed — §4.1 and §4.2 describe exploitable paths, and this repo is public, so they
should be reported through private vulnerability reporting (§4.5) rather than opened as
public issues.

Step-by-step fixes, with test code, are in
`docs/superpowers/plans/2026-09-18-audit-findings-remediation.md` (gitignored, local only).

### 4.1 Money paths

- ~~**Razorpay verify never binds the order to the invoice**~~ — Done. `verify_razorpay_payment()`
  now fetches the order back and rejects the payment unless its `receipt` matches the
  invoice's `invoice_number`, closing the gap where a captured payment for one invoice
  could be POSTed against a different one.

- ~~**Invoice `total_amount` is whatever the client sends**~~ — Done. `InvoiceCreate` now has
  a `@model_validator(mode="after")` rejecting any `total_amount != amount + tax`.

### 4.2 Correctness

- **The e-sign webhook isn't idempotent** — `app/controllers/esign.py:134`. The signed PDF
  goes to a fixed `signed-{document_id}.pdf`, Supabase Storage's `upload` rejects an
  existing path, and the call isn't wrapped the way `messages.py:284` is. A redelivery
  500s, and because `esign_status` is written *after* the upload (`esign.py:138`) the
  document is stuck at SENT while Leegality retries a callback that can never succeed.
  **Fix:** `{"upsert": "true"}`, and write the status even when storing the file fails.

- ~~**Org admins can preview a client delete but the delete 404s**~~ — Done.
  `_assert_deletable()` now delegates scoping to `_assert_same_org_or_404()` instead of
  comparing `org_id` raw, so a client's `NULL` `org_id` is handled the same way in both the
  preview and the delete.

- **Deleting a user leaves their Supabase Auth account** — `app/controllers/users.py:231`.
  The cascade clears the `users` row and storage; nothing calls the Auth admin API
  (`grep -rn "auth.admin" backend/` finds nothing, and `migrate_delete_user_cascade.sql`
  doesn't touch `auth.users`). The person still authenticates and gets `profile: null`,
  which reads as a broken app rather than a closed account, and their email can't be
  signed up again. **Fix:** `supabase.auth.admin.delete_user()` after the cascade, logged
  but not fatal — same stance as the storage cleanup beside it. Matching is by email;
  there's no UUID column linking the two (see the note at the top of `seed.sql`).

- **`/ai/summarize` reads soft-deleted documents** — `app/ml/summarize.py:46`. Download
  and summary-fetch both filter `is_deleted=False`; this query doesn't, so a deleted
  document is still pulled out of storage and summarized during the reaper's grace window.
  **Fix:** add the filter the other two call sites have.

### 4.3 Resources

- **Message attachments are buffered in full before the size check** —
  `app/controllers/messages.py:279`. `file.file.read()` with no argument reads to EOF;
  the 25 MB check happens after. `documents.read_upload()` reads `MAX + 1` and documents
  why. A 2 GB attachment is rejected — after 2 GB is allocated to decide that.
  **Fix:** `file.file.read(MAX_ATTACHMENT_BYTES + 1)`.

- **Every login and signup leaks an httpx connection pool** —
  `app/db/supabase_client.py:26`, filed as
  [#25](https://github.com/eyeofshreyas/BE-Project/issues/25). `new_auth_client()` builds a
  fresh `httpx.Client` per call and nothing closes it. The reason it exists is sound (see
  its docstring — don't "fix" this by going back to the shared client); only the lifetime
  is wrong. **Fix:** make it a `@contextmanager`. Note this renames the patch target in
  ~6 places in `tests/test_auth.py`.

- **A failed `documents` insert orphans the uploaded file** —
  `app/controllers/documents.py:131`. The object is already in the bucket, and
  `reap_storage.py` only walks rows, so nothing will ever find it. Same shape in
  `messages.py:303`. **Fix:** delete the object if the insert raises. A bucket-side sweep
  would catch what's already orphaned — only worth building if a check shows orphans have
  actually accumulated.

### 4.4 Frontend

- **The refresh token is returned, typed, and never used** — `frontend/src/api/client.ts:88`.
  `/login` hands back `refresh_token` and `types/api.ts:13` declares it, but nothing stores
  it and there's no `/refresh` endpoint. When the access token expires (an hour, by
  Supabase's default) the 401 handler does `window.location.href = '/login'` — a full page
  navigation — so every user is logged out roughly hourly, mid-task, losing whatever was in
  the form they were filling in. The 401 handler is right; treating a routine expiry as the
  end of a session isn't. **Fix:** a `/refresh` route plus single-flight refresh-and-replay
  in `request()`, so six parallel dashboard 401s trigger one refresh, not six. No frontend
  test framework exists yet (#16), so this half is verified by clicking through.

### 4.5 Repo hygiene — all filed

- [#20](https://github.com/eyeofshreyas/BE-Project/issues/20) **No `LICENSE`.** Public repo,
  `licenseInfo: null`. No license means nobody has permission to use the code, and
  contributors have no stated terms — public visibility changes neither.
- [#21](https://github.com/eyeofshreyas/BE-Project/issues/21) **No `SECURITY.md`.** Nowhere
  to report §4.1/§4.2-shaped findings except a public issue. Do this one first: it's what
  makes the rest fileable.
- [#22](https://github.com/eyeofshreyas/BE-Project/issues/22) **No issue or PR templates.**
  `CONTRIBUTING.md` §1 and §6 specify what each must contain; nothing puts that in front of
  the person filling the form in, so `Closes #N` gets forgotten and issues outlive their fix.
- [#23](https://github.com/eyeofshreyas/BE-Project/issues/23) **No `CODE_OF_CONDUCT.md`.**
  A file you adopt, not one you write — the Contributor Covenant, with a genuinely
  monitored enforcement contact.
- [#24](https://github.com/eyeofshreyas/BE-Project/issues/24) **No `frontend/.env.example`.**
  `VITE_API_URL` (`client.ts:57`) is discoverable only by grepping, and its
  `?? 'http://localhost:8000'` fallback keeps it quiet until the first build for somewhere
  that isn't a laptop. Vite inlines `VITE_*` at **build** time, so a wrong value can't be
  corrected on the server afterwards.

### 4.6 Genuinely deferred — these have real triggers

Unlike the rest of §4, these two are correct as written and shouldn't be touched
speculatively. Both rewrites are wide and land on hot paths.

- **Case scoping expands to an unbounded `IN` list.** `get_scoped_case_ids()`
  (`app/middleware/auth.py:58`) materialises every visible case id, and callers pass the
  whole set to `.in_()` (`documents.py:56`, `billing.py:94`, ~6 others). PostgREST puts
  those ids in the query string, so this hits a URL-length limit — as a 414 on every list
  page at once, not a gradual slowdown. The fix is to push scoping into the query: an
  `org_id` filter for admins, a view or RPC for the lawyer/client joins
  (`migrate_delete_user_cascade.sql` is the precedent for that kind of SQL function).
  **Unblocked by:** a firm's case count passing roughly a thousand, or a 414 / oversized-URL
  error actually appearing in logs.

- **Every request costs a Supabase Auth round trip.** `supabase.auth.get_user(token)`
  (`app/middleware/auth.py:26`) validates a *signed* JWT over the network, then a `users`
  select loads the profile. A dashboard mount fires ~6 parallel requests, so that's 12
  extra calls per page load, and it's the reason the 503 branch in that function has to
  exist at all. Verifying locally against the project's JWKS removes them. Keep the profile
  select regardless — `is_active` and `role_id` are LexFlow's own state, and a suspended
  user must stop working immediately. **Unblocked by:** latency actually being complained
  about, or Auth flakiness showing up as 503s in logs. `CONTRIBUTING.md` §3 lists
  `middleware/auth.py` under "don't relax these" — this needs the full suite green and a
  careful review, not a quick patch.
