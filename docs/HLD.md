# LexFlow — High-Level Design

System-level view: who uses it, the major subsystems, how they fit together, and the tech stack. For endpoint-level detail, auth internals, data model, and ML pipeline mechanics, see [`LLD.md`](./LLD.md).

---

## 1. System Context

```mermaid
graph TD
    Admin(["Admin"])
    Lawyer(["Lawyer"])
    Client(["Client"])

    subgraph LexFlow["LexFlow"]
        System["Case & Conveyancing\nManagement System"]
    end

    Supabase[("Supabase\n(Postgres + Auth)")]
    HF["Pretrained/fine-tuned models\n(Llama-3.2 LoRA, InLegalBert, IndicTrans2)"]

    Admin -->|manage users, view all cases| System
    Lawyer -->|manage own cases, billing, hearings| System
    Client -->|view own case status/matters| System
    System -->|store/query data, authenticate| Supabase
    System -->|summarize, translate, find similar cases| HF
```

---

## 2. Major Subsystems

```mermaid
graph LR
    subgraph FE["Frontend (React/Vite)"]
        Auth_FE["Auth & role-based routing"]
        AdminConsole["Admin Console\n(Users, Cases, Documents, Reports, Analytics)"]
        Conveyancing_FE["Conveyancing Dashboard"]
    end

    subgraph BE["Backend API (FastAPI)"]
        AuthRBAC["Auth & RBAC"]
        CaseMgmt["Case Management\n(cases, notes, timeline, status)"]
        Scheduling["Scheduling\n(hearings, meetings)"]
        BillingSvc["Billing\n(invoices, payments, expenses)"]
        ConvSvc["Conveyancing\n(matters, due diligence, progress)"]
        DocSvc["Documents"]
        NotifSvc["Notifications"]
        AISvc["AI Services\n(summarize, translate, similar-case search)"]
    end

    DB[("Supabase\nPostgres + Auth")]
    MLPipeline["Offline ML Pipeline\n(fine-tuning, indexing)"]

    FE -->|REST + Bearer token| BE
    AuthRBAC --> DB
    CaseMgmt --> DB
    Scheduling --> DB
    BillingSvc --> DB
    ConvSvc --> DB
    DocSvc --> DB
    NotifSvc --> DB
    AISvc -->|subprocess| MLPipeline
    AISvc --> DB
```

---

## 3. Capability Overview by Role

```mermaid
graph TD
    subgraph AdminCap["Admin"]
        A1["Manage users\n(activate/suspend)"]
        A2["View all cases & analytics"]
        A3["Full system access"]
    end

    subgraph LawyerCap["Lawyer"]
        L1["Manage assigned cases"]
        L2["Schedule hearings & meetings"]
        L3["Manage billing & conveyancing matters"]
        L4["Request AI summary/translation/similar-cases"]
    end

    subgraph ClientCap["Client"]
        C1["View own case status"]
        C2["View own conveyancing matter progress"]
        C3["Receive notifications"]
    end
```

---

## 4. High-Level Request Flow

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant FE as Frontend
    participant BE as Backend API
    participant DB as Supabase

    U->>FE: Log in
    FE->>BE: POST /login
    BE->>DB: verify credentials
    DB-->>BE: session + profile
    BE-->>FE: token + profile (role_id)
    FE->>FE: store in localStorage, route by role

    U->>FE: Open a feature (e.g. Cases)
    FE->>BE: GET /cases (Bearer token)
    BE->>BE: authenticate, authorize (role + case ownership)
    BE->>DB: query
    DB-->>BE: rows
    BE-->>FE: JSON
    FE-->>U: render
```

---

## 5. Tech Stack

```mermaid
graph TD
    subgraph Frontend
        F1["React 19 + TypeScript"]
        F2["React Router 7"]
        F3["Vite"]
        F4["Plain fetch + useState/useEffect\n(no state library)"]
    end

    subgraph Backend
        B1["FastAPI"]
        B2["Supabase Python client"]
        B3["Pydantic"]
    end

    subgraph DataAuth["Data & Auth"]
        D1["Supabase Postgres"]
        D2["Supabase Auth"]
    end

    subgraph ML["ML (isolated venvs)"]
        M1["unsloth + PEFT/QLoRA\n(Llama-3.2-1B fine-tune)"]
        M2["sentence-transformers + FAISS\n(InLegalBert similar-case search)"]
        M3["IndicTrans2\n(translation)"]
    end
```

---

## 6. Design Principles Observed

- **Thin backend, isolated ML** — the API process has zero ML dependencies; all inference runs out-of-process in dependency-isolated venvs, invoked via subprocess.
- **Two-layer authorization** — role check (what a user is) is separate from object-level ownership check (which cases they may touch), added after an audit found the gap.
- **Supabase as the single source of truth** — no local DB; Postgres + Auth both come from Supabase.
- **No shared frontend state layer** — session and data fetching are handled per-page/per-view rather than through a central store; documented as a current tradeoff, not a constraint of the design.
