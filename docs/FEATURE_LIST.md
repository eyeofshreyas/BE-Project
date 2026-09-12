# LexFlow — Feature List & Rationale

What each feature does, how it actually works, and why it exists — the problem it solves
for a lawyer, a client, or the firm, not just what it technically does. For deeper
implementation detail see [`HLD.md`](./HLD.md) / [`LLD.md`](./LLD.md); for what's
deliberately not built yet, see [`FUTURE_SCOPE.md`](./FUTURE_SCOPE.md).

---

## 1. Core practice management

### Case management (cases, notes, timeline, status)
**How it works:** each case gets an auto-generated number (`CIV2026001`, prefix from case
type + year + sequence), a status, priority, and next-hearing date. Access is layered two
ways: a role check (is this user a lawyer/admin/client at all) and a separate per-object
check (`ensure_case_access()`) confirming *this specific case* is one they're scoped to —
a lawyer's scope is their active `case_lawyers` assignments, a client's is the cases
matching their `client_id`. Every significant thing that happens on a case — status
change, hearing scheduled, document uploaded, eCourts synced, sent for signature — writes
one line to `case_timeline` via a single shared function, so the history is built once,
not re-implemented per feature.

**Why it matters:** every matter needs one place that's the source of truth for its
status, history, and who's handling it — without it, "what's the status of this case?"
means digging through email, WhatsApp, and memory. The timeline exists because that
history needs to be reconstructable later, for a client update or a colleague picking up
the file.

### Scheduling (hearings & meetings)
**How it works:** a hearing is tied to a case and a judge; booking one recomputes
`cases.next_hearing_date` by querying the *nearest future Scheduled hearing* rather than
trusting whatever was just created — so backfilling a past hearing out of order can't
overwrite a genuinely later "next" date with a stale one. A double-submitted form is
caught before insert (same case, date, time, judge) and refused unless the caller
explicitly says the repeat listing is deliberate. Internal meetings are a separate table,
same "record what happened afterward" outcome pattern.

**Why it matters:** litigation runs on dates. A missed hearing or forgotten follow-up
damages client trust and can have real legal consequences. Centralizing hearings means
"what's next on this case" is always answerable, and it stays correct automatically.

### Billing & payments (invoices, expenses, Razorpay)
**How it works:** an invoice's `payment_status` (Pending/Partially Paid/Paid) is derived,
not stored by hand — it's recomputed from the sum of that invoice's Completed payments
every time a payment is recorded. Online payment goes through Razorpay: the backend
creates an order server-side (amount, currency), the browser opens Razorpay's checkout
against that order, and on completion the backend re-verifies the payment two ways before
recording it — an HMAC signature check, and a direct re-fetch of the payment from
Razorpay's API (never trusting the amount the browser reports back).

**Why it matters:** firms that don't track time/expenses systematically under-charge —
industry estimates put it at 20-30% of recoverable revenue lost to untracked billing.
Razorpay checkout exists so a client can pay in two clicks instead of a bank transfer and
a WhatsApp confirmation.

### Conveyancing matters (due diligence, progress tracking)
**How it works:** a conveyancing matter hangs off a case and carries its own workflow —
property details, a due-diligence checklist (title clear, tax verified, encumbrance
checked), and matter-specific expenses — instead of forcing property transactions through
the same shape as a litigation case.

**Why it matters:** LexFlow's actual market differentiator (see the
[market brief](https://claude.ai/code/artifact/6bc8dcba-d386-4268-94ec-d4382b712d45)) — none of the researched competitors (Clio, MyCase, PracticePanther,
JuniorLawyer) specialize in property transactions, and conveyancing genuinely needs its
own data shape.

### Documents
**How it works:** files land in Supabase Storage under a `case-{id}/` path, with a
`documents` row tracking the file's metadata. Deletion is soft (an `is_deleted` flag and
timestamp) — the stored object itself is only purged later, by a separate reaper job,
after a grace period, so an accidental delete isn't immediately unrecoverable. Preview and
download both go through short-lived signed URLs rather than exposing the bucket directly.

**Why it matters:** every case produces documents, and lawyers lose real time hunting for
one order or annexure across email, WhatsApp, and local folders. A single per-case store
means the document is always findable from the case it belongs to.

### Messaging (client ↔ lawyer)
**How it works:** a conversation is scoped to one client-lawyer pair; unread state is
tracked with a `*_last_read_at` timestamp per side, compared against each message's
`created_at` rather than a per-message read flag — cheaper to compute, and the frontend
polls periodically so a new message shows up without a manual reload.

**Why it matters:** client communication currently happens over phone, email, and
WhatsApp, none of which are tied to the case record. In-app messaging keeps that
conversation attached to the matter it's about.

### Notifications
**How it works:** a notification is a row (`user_id`, optional `case_id`, title, message,
type, read flag) inserted by whichever flow triggers it — an invoice reminder, an accepted
client request, and so on — and the frontend polls for new ones.

**Why it matters:** a client who only checks a portal when they remember to has the same
problem as a missed hearing. Notifications close that gap for things that need attention
without the person having to go looking for them.

### Judgements
**How it works:** reference judgments are stored independently of any one case, so they're
searchable by topic — and they're what `/ai/similar-case` search actually searches against
when surfacing related precedent for a case's AI summary.

**Why it matters:** a lawyer preparing an argument needs to find precedent by topic, not
by remembering which past case they first saw it in.

### Admin console & RBAC
**How it works:** three roles (Admin/Lawyer/Client) gate *what* an endpoint allows; a
second, independent check (`ensure_case_access()` / `get_scoped_case_ids()`) gates *which*
specific cases that user can touch — added after an audit found that a role check alone
didn't stop a lawyer from writing to a case they weren't assigned to. Messaging, which has
no case to scope to, adds a third check: a verified client-lawyer relationship plus
per-conversation participant membership.

**Why it matters:** an admin needs oversight across the whole firm without that same
breadth being available to a lawyer who should only see their own cases, or a client who
should only see their own matter — and that needs to be enforced, not just assumed by the UI.

---

## 2. AI capabilities

### Summarization
**How it works:** the backend extracts the document's text (see OCR below for scans), then
shells out to a subprocess running in an isolated venv with a fine-tuned Llama-3.2 1B
model — a LoRA adapter trained specifically on judgment summarization. Case-level
summaries skip that adapter (it only knows judgments, not case-shaped text) and fall back
to the base model. The model reloads from scratch on every call — a known latency
tradeoff, not yet worth a long-lived worker.

**Why it matters:** a long filing or judgment takes real time to read before a lawyer can
act on it. A summary gets them oriented fast — the point is cutting blank-page time before
deciding whether to read the whole thing, not replacing reading it.

### Translation (IndicTrans2)
**How it works:** a friendly language name ("Hindi") maps to its FLORES-200 code
(`hin_Deva`) before being sent to a separate subprocess running IndicTrans2 in its own
venv (it needs a `transformers` version that conflicts with the summarizer's). The
frontend currently translates a document's *summary*, not its raw text — generate a
summary first.

**Why it matters:** Indian legal work is multilingual by default — District Court matters,
police papers, land records, and client documents routinely arrive in Hindi or another
regional language. Every India-specific competitor researched treats this as a must-have.

### Similar-case search (InLegalBert)
**How it works:** the firm's own past cases are embedded offline with InLegalBert and
indexed with FAISS; a search embeds the query case's text the same way and returns the
nearest matches by similarity score, each with a short excerpt showing why it matched.

**Why it matters:** "have I handled something like this before?" is a question every
lawyer asks and normally answers from memory or a folder search. Semantic search answers
it directly.

### Case-level AI summary
**How it works:** rather than re-reading a whole case, this composes what's already
structured — case facts, a line per hearing (date, judge, outcome, notes), and the AI
summaries already generated for the case's individual documents — into one prompt, and
separately runs the similar-case search against the firm's own cases to attach related
judgments.

**Why it matters:** a case accumulates notes, hearings, and documents over months; reading
all of it before a client call or hearing prep is slow. This gives a lawyer the composed
version instead.

### OCR (Tesseract)
**How it works:** for a PDF, `pypdf` is tried first (fast, works when there's a real text
layer); if that comes back empty — a scan — each page is rendered to an image via
`pdf2image` (which shells out to `poppler`'s `pdftoppm`) and read with Tesseract.
`image/*` uploads OCR directly. A missing `tesseract-ocr` install degrades to a clear 500,
not a crash.

**Why it matters:** Indian legal records routinely arrive as scanned PDFs, photocopies, or
images — FIRs, chargesheets, old orders, handwritten notes. Without this, summarize and
translate simply couldn't read them at all.

---

## 3. Third-party integrations

### eCourts CNR sync
**How it works:** a lawyer attaches a case's 16-character CNR (Case Number Record) once;
"Sync with eCourts" calls the eCourtsIndia API (a third-party layer over the government's
own CAPTCHA-gated portal, which has no public API) to fetch that case's live status and
party/court details, storing the provider's own status string separately from LexFlow's
own workflow status — and logs what changed to the case timeline. Auto-creating hearing
rows from the response is deferred until its exact field shape is confirmed against a live
call (see `FUTURE_SCOPE.md`).

**Why it matters:** the single biggest feature gap identified against India-market
competitors (JuniorLawyer, LexiZ both treat this as core). Before this, a case's status
only changed when a lawyer manually updated it — easy to drift out of sync with what the
court itself has on record.

### E-signature (Leegality)
**How it works:** a lawyer picks a stored PDF and a signer; the backend base64-encodes the
file and sends it to Leegality's API against a pre-configured Workflow (which defines the
signature type — Aadhaar OTP, biometric, etc.). Leegality emails the signer a link; they
verify their identity and sign entirely on Leegality's side, not LexFlow's. The moment
they sign, Leegality calls a webhook back with the result — verified via an HMAC signature
computed from a private key, since it's Leegality calling in, not a logged-in user — and
LexFlow immediately downloads the completed PDF from Leegality's short-lived link before
it expires.

**Why it matters:** conveyancing deeds, lease agreements, POAs, and vakalatnamas all need
signatures, and the manual process (print, sign, scan, re-upload) is slow and easy to lose
track of. Bought rather than built, since only 7 CCA-licensed providers in India can
legally perform the underlying Aadhaar-based cryptographic signing.
