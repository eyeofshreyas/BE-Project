# LexFlow

Case & conveyancing management system for a law practice — admins manage users
and see everything, lawyers manage their assigned cases (billing, hearings,
documents, messaging), and clients track their own case/matter status, pay
invoices, and message their lawyer.

Full system design is in [`docs/HLD.md`](docs/HLD.md) (subsystems, tech stack,
design principles) and [`docs/LLD.md`](docs/LLD.md) (endpoints, data model, ML
pipeline internals). What each feature does and why it exists is in
[`docs/FEATURE_LIST.md`](docs/FEATURE_LIST.md); deferred work and what
unblocks it is in [`docs/FUTURE_SCOPE.md`](docs/FUTURE_SCOPE.md).

## Stack

- **Frontend** — React 19 + TypeScript, React Router 7, Vite, plain
  `fetch`/`useState` (no state library)
- **Backend** — FastAPI + Pydantic, talking to Supabase over the Python client
- **Data & Auth** — Supabase (Postgres + Auth + Storage)
- **Payments** — Razorpay, verified server-side (HMAC + re-fetch)
- **AI** (optional, isolated venvs, invoked via subprocess) — Llama-3.2 LoRA
  fine-tune for summarization, InLegalBert + FAISS for similar-case search,
  IndicTrans2 for translation

## Setup

See [`SETUP.md`](SETUP.md) for the full walkthrough. Quick version:

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_KEY

# frontend
cd frontend
npm install

# run both
./start.sh   # or start.bat on Windows
```

Frontend on http://localhost:5173, API docs on http://localhost:8000/docs.

The app runs fully without the AI models — they're only needed for the four
`/ai/*` endpoints (summarize, translate, similar-case search, case summary).
Setting those up is a separate step in `SETUP.md`.

## Repo layout

| Path | What |
|---|---|
| `backend/` | FastAPI API |
| `frontend/` | React app |
| `finetune-summarizer/` | Offline ML pipeline (fine-tuning, indexing) and the venvs the backend shells out to for AI endpoints |
| `docs/` | Architecture docs (HLD, LLD) |
| `design-concepts/` | UI design explorations |
