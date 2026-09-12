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

The eCourtsIndia single-CNR response is documented to include "per-case process,
interim-application, transfer, and hearing-history arrays" on the district-court side,
but the exact field names and shape weren't confirmed against a live response at
implementation time — no API key was available yet. Guessing at a field name in a
correctness-sensitive domain (a wrong date silently written to `hearings`) was worse
than shipping without it.

**Unblocked by:** getting `ECOURTS_API_KEY` configured and making one real
`GET /api/partner/case/{cnr}` call to see the actual `hearingHistory` (or equivalently
named) field. Once confirmed, extend `sync_case_from_ecourts()` to diff that array
against existing `hearings` rows for the case and insert any hearing eCourts knows
about that LexFlow doesn't, following the same insert + `add_timeline_event()` pattern
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
| 3 | E-signatures | Table stakes across every competitor researched (Clio, MyCase, PracticePanther, JuniorLawyer); conveyancing work depends on it directly | Needs a vendor decision (e.g. Leegality, DocuSign) — not researched yet |
| 4 | Conflict-of-interest check | Ethics-adjacent, expected by bar associations | Lower urgency than 3 |
| 5 | Basic trust accounting / reconciliation | Table stakes at every competitor; MyCase's automated 3-way reconciliation is the bar | Lower urgency than 3 |

### Document OCR — how it landed

Turned out not to need the subprocess-per-venv treatment guessed at above: Tesseract via
`pytesseract` is a thin wrapper around a system binary, not a torch/GPU model, so it lives
directly in `extract_document_text()` (`app/controllers/documents.py`) next to the
existing pypdf path — same pattern pypdf already used, no new venv. A PDF with no text
layer (a scan) now renders each page via `pdf2image` and OCRs it; `image/*` uploads OCR
directly. Requires the `tesseract-ocr` and `poppler-utils` system packages (see
`SETUP.md`) — missing either degrades to a clear 500, not a crash.

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
