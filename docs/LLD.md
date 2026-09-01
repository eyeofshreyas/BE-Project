# LexFlow — Low-Level Design

A legal-tech case & conveyancing management system: React/Vite frontend, FastAPI backend on Supabase (Postgres + Auth), and an offline-trained ML subsystem (summarization, translation, similar-case search) invoked from the backend via subprocess.

Diagrams are best-effort reconstructions from the current codebase, not a spec — where the code takes a known shortcut, it's called out as a **current tradeoff** rather than presented as intended design.

---

## 1. System Architecture

```mermaid
graph LR
    subgraph Client
        FE["React/Vite Frontend"]
    end

    subgraph Backend["FastAPI Backend (backend/main.py)"]
        API["REST routers\n(cases, billing, hearings, meetings,\nconveyancing, documents, users, ...)"]
        AI["/ai/* routers\n(summarize, translate, similar-cases)"]
    end

    DB[("Supabase\nPostgres + Auth")]

    subgraph MLRunners["ML runners (separate venvs)"]
        R1["summarize_runner.py"]
        R2["translate_runner.py"]
        R3["search_runner.py"]
    end

    subgraph Artifacts["Offline artifacts (finetune-summarizer/)"]
        A1["LoRA adapter\n(Llama-3.2-1B)"]
        A2["FAISS index +\nmetadata.json"]
        A3["IndicTrans2\npretrained models"]
    end

    FE -->|"fetch + Bearer token\n(src/lib/api.ts)"| API
    FE -->|fetch| AI
    API -->|"supabase-py client"| DB
    AI -->|"subprocess: JSON via stdin"| R1
    AI -->|subprocess| R2
    AI -->|subprocess| R3
    AI -->|"upsert ai_summaries"| DB
    R1 --> A1
    R3 --> A2
    R2 --> A3
```

---

## 2. Backend Module Map

```mermaid
graph TD
    subgraph AuthUsers["Auth / Users"]
        auth["auth.py\nget_current_user, get_current_profile,\nrequire_roles, ensure_case_access"]
        users["users.py\nGET /users, PATCH /users/:id/status"]
        mainpy["main.py\nPOST /signup, /login, /forgot-password"]
    end

    subgraph CaseDomain["Cases / Billing / History"]
        cases["cases.py\nGET /cases"]
        billing["billing.py\ninvoices, payments, expenses"]
        history["case_history.py\nnotes, timeline, status-history"]
    end

    subgraph Scheduling["Hearings / Meetings"]
        hearings["hearings.py"]
        meetings["meetings.py"]
    end

    conv["conveyancing.py\nmatters, due-diligence, progress"]
    docs["documents.py\nlist docs, fetch AI summary"]
    notif["notifications.py"]
    ref["reference.py\nroles, case_types, courts, judges"]

    subgraph MLRoutes["ML (/ai/*)"]
        summarize["ml/summarize.py"]
        translate["ml/translate.py"]
        similar["ml/similar_cases.py"]
    end

    DB[("Supabase tables")]

    mainpy --> DB
    auth --> DB
    users --> DB
    cases --> DB
    billing --> DB
    history --> DB
    hearings -->|"syncs cases.next_hearing_date"| DB
    meetings --> DB
    conv --> DB
    docs --> DB
    notif --> DB
    ref --> DB
    summarize -->|"upsert ai_summaries"| DB
    translate -->|"upsert ai_summaries"| DB
    similar -.->|"read-only, no DB write"| DB
```

---

## 3. Auth + RBAC + Object-Level Authorization

Two layers, added in separate commits: role-based gating (`ed64545`) and per-object ownership checks (`57603fa`) — role alone doesn't prove a lawyer/client owns the specific case they're writing to.

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Route handler
    participant SB as Supabase Auth
    participant P as get_current_profile
    participant RR as require_roles(*)
    participant EA as ensure_case_access

    C->>R: request + Bearer token
    R->>SB: auth.get_user(token)
    SB-->>R: auth user (email)
    R->>P: join auth user -> users table
    P->>P: check is_active
    P-->>R: profile (role_id, id)
    R->>RR: check profile.role_id in allowed roles
    alt role not allowed
        RR-->>C: 403 Forbidden
    else role ok
        opt case-scoped write (case_id / matter_id in payload)
            R->>EA: ensure_case_access(case_id, profile)
            EA->>EA: get_scoped_case_ids(profile)\n(via case_lawyers / clients->cases)
            alt case not in scope
                EA-->>C: 403 Forbidden
            end
        end
        R->>SB: table().insert/update/select().execute()
        SB-->>C: 200 + data
    end
```

---

## 4. Data Model (inferred from query field names — not a live schema dump)

```mermaid
erDiagram
    ROLES ||--o{ USERS : "role_id"
    USERS ||--o| LAWYERS : "profile"
    USERS ||--o| CLIENTS : "profile"
    LAWYERS ||--o{ CASE_LAWYERS : assigned
    CLIENTS ||--o{ CASES : owns
    CASES ||--o{ CASE_LAWYERS : "handled by"
    CASE_TYPES ||--o{ CASES : categorizes
    COURTS ||--o{ CASES : "heard at"
    JUDGES ||--o{ HEARINGS : presides
    CASES ||--o{ HEARINGS : has
    CASES ||--o{ MEETINGS : has
    MEETINGS ||--o{ MEETING_PARTICIPANTS : includes
    CASES ||--o{ DOCUMENTS : attached
    DOCUMENT_TYPES ||--o{ DOCUMENTS : categorizes
    DOCUMENTS ||--o| AI_SUMMARIES : "summary/translation"
    CASES ||--o{ INVOICES : billed
    INVOICES ||--o{ PAYMENTS : "paid via"
    CASES ||--o{ MISCELLANEOUS_EXPENSES : incurs
    CASES ||--o{ CASE_NOTES : has
    CASES ||--o{ CASE_TIMELINE : logs
    CASES ||--o{ CASE_STATUS_HISTORY : audits
    USERS ||--o{ NOTIFICATIONS : receives
    CASES ||--o| CONVEYANCING_MATTERS : "linked matter"
    CONVEYANCING_MATTERS ||--o{ CONVEYANCING_PARTIES : involves
    CONVEYANCING_MATTERS ||--o| PROPERTIES : concerns
    CONVEYANCING_MATTERS ||--o{ DUE_DILIGENCE : tracks
    CONVEYANCING_MATTERS ||--o{ REGISTRATION_PROGRESS : tracks
```

---

## 5. Case-Scoped Write Flow (e.g. `PATCH /cases/:id/status`)

```mermaid
sequenceDiagram
    participant C as Client
    participant H as case_history.py handler
    participant Auth as auth.py
    participant DB as Supabase

    C->>H: PATCH /cases/:id/status {status}
    H->>Auth: require_roles(ADMIN, LAWYER)
    H->>Auth: ensure_case_access(case_id, profile)
    Auth-->>H: ok
    H->>DB: update cases.status
    H->>DB: insert case_status_history (audit)
    H->>DB: insert case_timeline (audit)
    DB-->>C: 200 updated case
```

---

## 6. ML Runtime Flows (`/ai/summarize`, `/ai/translate`, `/ai/similar-cases`)

Same shape for all three — one subprocess call into a separate venv, with a **model reload on every request** (noted `ponytail:` in `summarize.py` / `translate.py` / `similar_cases.py` — current tradeoff, upgrade path is a long-lived worker process).

```mermaid
sequenceDiagram
    participant C as Client
    participant AI as /ai/* router
    participant U as subprocess_utils.run_ml_subprocess
    participant P as venv subprocess (runner script)
    participant M as Model / FAISS index
    participant DB as Supabase

    C->>AI: POST /ai/summarize|translate|similar-cases
    AI->>U: run_ml_subprocess(cmd, payload)
    U->>P: spawn subprocess, write JSON to stdin
    P->>M: load model / FAISS index
    M-->>P: result
    P-->>U: stdout (banner lines + final JSON line)
    U->>U: parse last stdout line as JSON
    alt exit code != 0
        U-->>AI: raise HTTPException(500, stderr[-2000:])
    else success
        U-->>AI: parsed result
        AI->>DB: upsert ai_summaries (summarize/translate only)
        AI-->>C: 200 + result
    end
```

---

## 7. Offline ML Pipelines (`finetune-summarizer/`)

```mermaid
flowchart TD
    subgraph Summarization
        d1["data_prep/prepare_in_abs.py\n(IN-Abs judgment/headnote pairs)"] --> f1["finetune/finetune_llama_lora.py\nQLoRA on Llama-3.2-1B"]
        f1 --> ad["finetune/lora_adapter/"]
        ad --> ev["eval/evaluate_rouge.py\nROUGE-L 0.1736 -> 0.2065"]
        ad --> inf["inference/summarize_long.py\n(used by summarize_runner.py)"]
    end

    subgraph SimilarCase["Similar-case search"]
        corpus["IN-Abs corpus\n(200-word chunks)"] --> bi["similar_cases/build_index.py\nInLegalBert embeddings"]
        bi --> idx["index.faiss + metadata.json\n(159,492 vectors)"]
        idx --> search["similar_cases/search.py\n(used by search_runner.py)"]
    end

    subgraph Translation
        pre["ai4bharat/indictrans2-*-dist-200M\n(pretrained, gated HF models)"] --> tr["translation/translate.py\n(used by translate_runner.py)"]
    end
```

---

## 8. Cross-Venv Subprocess Contract

Backend's own venv has none of unsloth/faiss/IndicTrans2 (incompatible with each other and with the backend's deps) — `backend/requirements.txt` has no ML libraries at all. ML always runs out-of-process in a dedicated venv.

```mermaid
sequenceDiagram
    participant Router as /ai/* router
    participant Util as subprocess_utils.run_ml_subprocess
    participant Sub as subprocess (other venv's python)

    Router->>Util: run_ml_subprocess([venv_python, runner.py], payload)
    Util->>Sub: subprocess.run(cmd, input=json.dumps(payload), capture_output=True)
    Note over Sub: model lib (e.g. unsloth) may print\na startup banner to stdout first
    Sub-->>Util: stdout = "<banner lines>\n{...json result...}"
    Util->>Util: take stdout.splitlines()[-1], json.loads(...)
    alt returncode != 0
        Util-->>Router: raise HTTPException(500, stderr[-2000:])
    else
        Util-->>Router: parsed dict
    end
```

Covered by `backend/ml/test_subprocess_utils.py` (bare-JSON, banner-then-JSON, and nonzero-exit cases, via mocked `subprocess.run`).

---

## 9. Frontend Routing & Auth Guard

**Current tradeoff:** session (`token` + `profile`) lives only in `localStorage`, read via a duplicated `loadProfile()`-style helper in both `ProtectedRoute.tsx` and `AdminConsolePage.tsx` — no shared auth context/hook.

```mermaid
flowchart TD
    start(["Navigate to route"]) --> guarded{"Protected route?\n(/admin, /conveyancing, /settings)"}
    guarded -->|no| render["Render page\n(LandingPage/LoginPage/SignUpPage/RoleSelectionPage)"]
    guarded -->|yes| readls["ProtectedRoute reads\nlocalStorage token + profile"]
    readls --> hastoken{"Token present?"}
    hastoken -->|no| loginredirect["Redirect to /login"]
    hastoken -->|yes| isadmin{"Route requires admin\n(requireAdmin=true)?"}
    isadmin -->|no| render2["Render protected page"]
    isadmin -->|yes| checkrole{"profile.role_id === 1?"}
    checkrole -->|no| convredirect["Redirect to /conveyancing"]
    checkrole -->|yes| render2
```

---

## 10. Frontend Data Flow (Admin Console)

```mermaid
flowchart TD
    mount(["AdminConsolePage mounts"]) --> tabstate["activePage state\n(Dashboard/Users/Cases/Documents/Reports/Analytics/Settings)"]
    tabstate --> dash["DashboardView\n(static, no API)"]
    tabstate --> usersv["UsersView\nlistUsers(), setUserStatus()"]
    tabstate --> casesv["CasesView\nlistCases()"]
    tabstate --> docsv["DocumentsView\nlistDocuments(), getDocumentSummary()"]
    tabstate --> reportsv["ReportsView\n(static, no API)"]
    tabstate --> analyticsv["AnalyticsView\n(static, no API)"]
    tabstate --> settingsv["SettingsView\n(local form state only)"]

    usersv --> api["src/lib/api.ts\nfetch + Bearer header from localStorage"]
    casesv --> api
    docsv --> api
    api --> backend["FastAPI backend"]
    backend --> api
    api --> localstate["Component useState"]

    mount --> notif["Notification bell\n(fetched at page level, not per-tab)\nlistNotifications(), markNotificationRead()"]
    notif --> api
```

---

## Known current tradeoffs (called out in code, not fixed here)

- ML models/FAISS index reload on **every** request — no persistent worker (`summarize.py`, `translate.py`, `similar_cases.py`).
- Frontend session state is `localStorage`-only, read via duplicated helpers instead of a shared context/hook.
- `subprocess_utils` trusts the **last line** of stdout as the JSON payload — fragile if a runner script ever prints after its result line.
