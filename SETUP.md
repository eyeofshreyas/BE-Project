# Setup

Getting the whole app running: backend API, frontend, and the AI models behind
the `/ai/*` endpoints (summarize, translate, similar-case search).

The app runs fine **without** the AI models — everything except the four `/ai/*`
endpoints works with just steps 1–3. Do step 4 only if you need AI features.

## Prereqs

- Python 3.13 (backend) and Python 3.11 (translation model only, step 4c)
- Node 20+
- A CUDA GPU for the AI models — 4GB VRAM is enough. CPU works, just slow.

## 1. Clone

```bash
git clone https://github.com/eyeofshreyas/BE-Project.git
cd BE-Project
```

## 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in SUPABASE_URL and SUPABASE_KEY
```

`SUPABASE_URL` / `SUPABASE_KEY` are required — the server refuses to start
without them. Get them from the Supabase project dashboard (Settings → API; use
the **service role** key). SMTP and Razorpay vars are optional; invite emails
are logged instead of sent and "Pay Now" returns 500 until they're set.

If this is a fresh Supabase project, run `backend/seed.sql` and the
`backend/migrate_*.sql` files in the Supabase SQL editor, then
`python3 seed_storage.py` to create the storage buckets.

## 3. Frontend

```bash
cd frontend
npm install
```

No `.env` needed — it defaults to `http://localhost:8000`. Set `VITE_API_URL`
in `frontend/.env` only if the backend runs elsewhere.

### Run both

```bash
./start.sh          # or start.bat on Windows
```

Frontend on http://localhost:5173, API docs on http://localhost:8000/docs.
Logs go to `logs/backend.log` and `logs/frontend.log`.

## 4. AI models

The backend doesn't import the models — it shells out to scripts in
`finetune-summarizer/`, which has **its own two venvs** (unsloth and
IndicTrans2 need conflicting `transformers` versions). Nothing here goes in the
backend venv.

What each endpoint needs:

| Endpoint | Needs |
|---|---|
| `POST /ai/summarize` | main venv + LoRA adapter (4a, 4b) |
| `POST /ai/similar-cases` | main venv + IN-Abs corpus + FAISS index (4a, 4b) |
| `POST /ai/case-search` | main venv (4a) |
| `POST /ai/translate` | translation venv + HF token (4c) |

**Follow [`finetune-summarizer/SETUP.md`](finetune-summarizer/SETUP.md)** — it
has the exact commands. The short version:

- **4a. Main venv** — `finetune-summarizer/.venv`, install torch from the cu126
  index first, then `requirements.txt`.
- **4b. Model weights + data** — the LoRA adapter (223MB) is gitignored; ask me
  for it and drop it at `finetune-summarizer/finetune/lora_adapter/`, don't
  retrain (~5 hours). Then rebuild the dataset and FAISS index (`prepare_in_abs.py`,
  `build_index.py`, ~12 min total) — both are gitignored too.
- **4c. Translation venv** — `finetune-summarizer/translation/.venv`, Python
  3.11 specifically. IndicTrans2 is gated, so each person needs their own free
  Hugging Face account, has to accept the terms on both model repos, and must
  `export HF_TOKEN=...` **in the shell that starts the backend** (the subprocess
  inherits it).

Paths are hardcoded relative to the repo root, so keep the directory layout as
cloned.

### Check it works

Log in as an admin or lawyer, open a case, and use Summarize / Translate on a
document. First call takes tens of seconds — the model is loaded from scratch on
every request.
