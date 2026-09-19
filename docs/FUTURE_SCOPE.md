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
the hand-entered bank statement. Leg 3 is recomputed from the transaction amounts. Leg 2
is `running_balance` — the firm's control total stamped onto each row by the
`trust_guard_and_stamp()` trigger when it was posted. Editing an amount in the database
moves leg 3 and not leg 2, which is the entire point; derive both from the same amounts
and they agree by construction no matter what has been tampered with.

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
