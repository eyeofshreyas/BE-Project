# LexFlow — Feature List & Rationale

What each feature does and why it exists — the problem it solves for a lawyer, a client, or
the firm, not just what it technically does. For implementation detail see
[`HLD.md`](./HLD.md) / [`LLD.md`](./LLD.md); for what's deliberately not built yet, see
[`FUTURE_SCOPE.md`](./FUTURE_SCOPE.md).

---

## 1. Core practice management

### Case management (cases, notes, timeline, status)
Every matter needs one place that's the source of truth for its status, history, and who's
handling it — without it, "what's the status of this case?" means digging through email,
WhatsApp, and memory. The timeline in particular exists because a case's history (status
changes, hearings, uploads, signatures) needs to be reconstructable later — for the client
asking for an update, or for a lawyer picking up a colleague's matter.

### Scheduling (hearings & meetings)
Litigation runs on dates. A missed hearing or forgotten follow-up damages client trust and
can have real legal consequences (a matter dismissed for non-appearance). Centralizing
hearings and internal meetings means "what's next on this case" is always answerable, and
`next_hearing_date` recomputes automatically so it's never stale.

### Billing & payments (invoices, expenses, Razorpay)
Legal work is professional work, and firms that don't track time/expenses systematically
under-charge — industry research puts this at 20-30% of recoverable revenue lost to
untracked billing. Razorpay checkout exists so a client can pay an invoice in two clicks
instead of a bank transfer with a WhatsApp confirmation.

### Conveyancing matters (due diligence, progress tracking)
LexFlow's actual market differentiator (see the [market brief](https://claude.ai/code/artifact/6bc8dcba-d386-4268-94ec-d4382b712d45)) — none of the researched
competitors (Clio, MyCase, PracticePanther, JuniorLawyer) specialize in property
transactions. Conveyancing has its own workflow (title search, stamp duty, registration)
that generic case management doesn't model well.

### Documents
Every case produces documents, and lawyers lose real time hunting for one order or annexure
across email, WhatsApp, and local folders. A single per-case store with preview/download
means the document is always findable from the case it belongs to.

### Messaging (client ↔ lawyer)
Client communication currently happens over phone, email, and WhatsApp, none of which are
tied to the case record. In-app messaging keeps that conversation attached to the matter
it's about, and gives the client a channel that doesn't depend on having the lawyer's
personal number.

### Notifications
A client checking a portal only when they remember to is the same problem as a missed
hearing — notifications close that gap for things that need their attention (an invoice
due, a message, a status change) without them having to go looking.

### Judgements
Reference case law needs to be searchable independent of any one matter — a lawyer
preparing an argument needs to find precedent by topic, not by remembering which case they
saw it in.

### Admin console & RBAC
An admin needs oversight across the whole firm (every case, every user) without that same
breadth being available to a lawyer who should only see their own assigned cases, or a
client who should only see their own matter. Layered RBAC + per-object case ownership
checks are what make "a lawyer scoped to case 10 can't touch case 20" actually true, not
just a UI convention.

---

## 2. AI capabilities

### Summarization
A long filing or judgment takes real time to read before a lawyer can act on it. A summary
gets them oriented fast — the point isn't to replace reading the document, it's to cut the
blank-page time before deciding whether to read the whole thing.

### Translation (IndicTrans2)
Indian legal work is multilingual by default — District Court matters, police papers, land
records, and client documents routinely arrive in Hindi or another regional language.
Every India-specific competitor researched (JuniorLawyer) treats this as a must-have, not
an extra.

### Similar-case search (InLegalBert)
"Have I handled something like this before?" is a question every lawyer asks and normally
answers from memory or a folder search. Semantic search over the firm's own past cases
surfaces the answer directly, and is more sophisticated than what either researched
India-market competitor advertises.

### Case-level AI summary
A single case accumulates notes, hearings, and document summaries over months — reading
all of it before a client call or hearing prep is slow. This composes those pieces into
one brief instead of a lawyer re-reading the whole case file each time.

### OCR (Tesseract)
Indian legal records routinely arrive as scanned PDFs, photocopies, or images — FIRs,
chargesheets, old orders, handwritten notes. Without OCR, summarize/translate simply
couldn't read them (`extract_document_text()` used to 400 with "paste the text instead").
OCR is what makes the rest of the AI pipeline actually work on the documents lawyers
receive, not just clean digital PDFs.

---

## 3. Third-party integrations

### eCourts CNR sync
The single biggest feature gap identified against India-market competitors — JuniorLawyer
and LexiZ both treat court-status sync as core, and LexFlow had none of it. Before this, a
case's status and hearing dates only changed when a lawyer manually updated them; a lawyer
could easily be out of date with what the court itself has on record. Syncing by CNR number
(via the eCourtsIndia API, since the government's own portal has no public API) pulls the
authoritative status and party/filing details directly from the source.

### E-signature (Leegality)
Conveyancing deeds, lease agreements, POAs, and vakalatnamas all need signatures, and the
manual process (print, sign, scan, re-upload) is slow and produces documents that are easy
to lose track of. Table stakes across every competitor researched (Clio bundles DocuSign,
MyCase has a native eSignature product). Bought rather than built, since only 7
CCA-licensed providers in India can legally perform the underlying Aadhaar-based
cryptographic signing — see `FUTURE_SCOPE.md` §2 for why building this in-house isn't a
real option.
