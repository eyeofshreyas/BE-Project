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
syncs (`case_timeline`, `add_timeline_event()`). Still open: documented encryption-at-rest
posture and a data-retention/deletion policy — engineering-led, but should be reviewed
against the standard above, not just DPDP minimums.

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

- **Razorpay verify never binds the order to the invoice** —
  `app/controllers/billing.py:219`. The HMAC proves the `order_id|payment_id` pair is
  Razorpay's, and the payment is re-fetched so the amount isn't taken from the caller, but
  nothing checks the order was raised *for this invoice*. A client can pay their smallest
  invoice and POST the result against their largest; the `transaction_reference`
  idempotency check then makes it impossible to ever apply it to the right one.
  **Fix:** `create_razorpay_order()` already puts the invoice number in the order's
  `receipt` (`billing.py:210`) — fetch the order and read it back.

- **Invoice `total_amount` is whatever the client sends** — `app/models/billing.py:26`.
  Each field is validated alone; nothing checks `total_amount == amount + tax`. That
  number decides the outstanding balance, the Paid/Partially Paid status, and what the
  card is actually charged. **Fix:** a Pydantic `@model_validator(mode="after")` on
  `InvoiceCreate`.

### 4.2 Correctness

- **The e-sign webhook isn't idempotent** — `app/controllers/esign.py:134`. The signed PDF
  goes to a fixed `signed-{document_id}.pdf`, Supabase Storage's `upload` rejects an
  existing path, and the call isn't wrapped the way `messages.py:284` is. A redelivery
  500s, and because `esign_status` is written *after* the upload (`esign.py:138`) the
  document is stuck at SENT while Leegality retries a callback that can never succeed.
  **Fix:** `{"upsert": "true"}`, and write the status even when storing the file fails.

- **Org admins can preview a client delete but the delete 404s** —
  `app/controllers/users.py:213`. `get_user_delete_impact()` uses
  `_assert_same_org_or_404()`, which handles a client's `NULL` `org_id` explicitly;
  `_assert_deletable()` compares raw, so `None != org_id` → 404 for a user the impact
  dialog just described. An org admin can never delete a client at all.
  **Fix:** have `_assert_deletable()` delegate scoping to `_assert_same_org_or_404()`.

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
