# LexFlow — System Diagrams

Six standard views of the platform: React frontend, FastAPI backend, Supabase, and the
Razorpay / Leegality / eCourtsIndia integrations.

## 1. Flowchart — case lifecycle

```mermaid
flowchart TD
    A(["Client invite or signup"]) --> B{"Conflict check clear?"}
    B -- "No" --> B1["Flag conflict / decline intake"]
    B -- "Yes" --> C["Create case<br/>case type, client, court"]
    C --> D["Assign lawyer team"]
    D --> E{"Hearing needed?"}
    E -- "Yes" --> F["Schedule hearing"]
    F --> G["Conduct hearing"]
    G --> H["Record outcome + next date"]
    H --> E
    E -- "No" --> I["Upload / manage documents"]
    I --> J{"Needs signature?"}
    J -- "Yes" --> K["Send for e-sign (Leegality)"]
    K --> L["Signed doc returned via webhook"]
    J -- "No" --> M["Generate invoice"]
    L --> M
    M --> N{"Settle from trust<br/>or direct payment?"}
    N -- "Trust balance" --> O["Settle invoice from client trust account"]
    N -- "Direct" --> P["Collect payment (Razorpay)"]
    O --> Q["Update case status + timeline"]
    P --> Q
    Q --> R{"Case resolved?"}
    R -- "No" --> E
    R -- "Yes" --> S(["Close case"])
```

## 2. Use case diagram — actors and capabilities

```mermaid
flowchart LR
    Admin(["Admin"])
    Lawyer(["Lawyer"])
    Client(["Client"])
    SuperAdmin(["Super Admin"])

    subgraph SYS["LexFlow"]
        UC1(("Manage users & orgs"))
        UC2(("Onboard client"))
        UC3(("Manage case"))
        UC4(("Conflict check"))
        UC5(("Manage hearings"))
        UC6(("Documents & e-sign"))
        UC7(("Billing & payments"))
        UC8(("Trust ledger"))
        UC9(("Messaging & meetings"))
        UC10(("Case timeline"))
    end

    Admin --- UC1
    Admin --- UC3
    Admin --- UC7

    SuperAdmin --- UC1
    SuperAdmin --- UC8

    Lawyer --- UC2
    Lawyer --- UC3
    Lawyer --- UC4
    Lawyer --- UC5
    Lawyer --- UC6
    Lawyer --- UC7
    Lawyer --- UC8
    Lawyer --- UC9
    Lawyer --- UC10

    Client --- UC2
    Client --- UC6
    Client --- UC9
    Client --- UC10
```

## 3. Class diagram — core domain model

```mermaid
%%{init: {"theme": "default", "themeVariables": {"fontSize": "18px"}, "class": {"useMaxWidth": false}}}%%
classDiagram
    class Organization {
        +int org_id
        +string name
    }
    class User {
        +int user_id
        +string full_name
        +string email
        +string phone
        +int role_id
        +bool is_active
        +int org_id
    }
    class Case {
        +int case_id
        +string case_title
        +string status
        +string priority
        +date filing_date
        +date next_hearing_date
        +float claim_value
    }
    class CaseLawyer {
        +int case_id
        +int lawyer_id
        +string assigned_role
    }
    class CaseParty {
        +int id
        +int case_id
        +string name
        +string role
    }
    class Hearing {
        +int id
        +int case_id
        +int judge_id
        +date hearing_date
        +string hearing_status
        +string hearing_outcome
    }
    class Document {
        +int id
        +int case_id
        +string file_name
        +string esign_status
    }
    class Invoice {
        +int id
        +int case_id
        +float amount
        +float total_amount
        +string payment_status
    }
    class Payment {
        +int payment_id
        +int invoice_id
        +float amount
        +string payment_method
    }
    class TrustTransaction {
        +int id
        +int client_id
        +int case_id
        +string type
        +float amount
    }
    class Meeting {
        +int id
        +int case_id
        +string meeting_status
    }
    class Conversation {
        +int id
        +int lawyer_id
        +int client_id
    }
    class Message {
        +int id
        +int conversation_id
        +string body
    }
    class Notification {
        +int id
        +int user_id
        +string notification_type
        +bool is_read
    }

    Organization "1" --> "0..*" User : employs
    User "1" --> "0..*" CaseLawyer : assigned as
    Case "1" --> "0..*" CaseLawyer : staffed by
    Case "1" --> "1" User : client
    Case "1" --> "0..*" CaseParty
    Case "1" --> "0..*" Hearing
    Case "1" --> "0..*" Document
    Case "1" --> "0..*" Invoice
    Case "1" --> "0..*" Meeting
    Invoice "1" --> "0..*" Payment
    User "1" --> "0..*" TrustTransaction : client ledger
    Case "0..1" --> "0..*" TrustTransaction
    User "1" --> "0..*" Conversation : as lawyer
    User "1" --> "0..*" Conversation : as client
    Conversation "1" --> "0..*" Message
    User "1" --> "0..*" Notification
```

## 4. Activity diagram — schedule & conduct a hearing

```mermaid
flowchart TD
    subgraph L1["Lawyer"]
        A1(["Open case"]) --> A2["Pick judge, date, time, courtroom"]
    end
    subgraph SYS2["LexFlow backend"]
        A2 --> B1{"Same case + judge + time<br/>already booked?"}
        B1 -- "Yes, not confirmed" --> B2["Reject: ask to confirm re-listing"]
        B1 -- "No / confirmed duplicate" --> B3["Create hearing row"]
        B3 --> B4["Log case timeline event"]
        B4 --> B5["Notify client + case team"]
    end
    B2 -.-> A2
    subgraph C1["Client"]
        B5 --> C2(["Receives notification"])
    end
    subgraph D1["Hearing day"]
        C2 --> D2["Hearing takes place"]
        D2 --> D3{"Outcome?"}
    end
    subgraph L2["Lawyer"]
        D3 -- "Adjourned" --> E1["Set next_hearing_date"]
        D3 -- "Decided / Disposed" --> E2["Record outcome, close hearing"]
        E2 --> E3(["Update case status"])
    end
    E1 -.-> A2
```

## 5. Sequence diagram — schedule hearing request

```mermaid
sequenceDiagram
    actor Lawyer
    participant FE as Frontend (React)
    participant API as FastAPI /hearings
    participant Auth as Auth middleware
    participant DB as Supabase Postgres

    Lawyer->>FE: Fill hearing form, submit
    FE->>API: POST /cases/{case_id}/hearings
    API->>Auth: get_current_profile(token)
    Auth->>DB: look up users row by email
    DB-->>Auth: profile (role_id, org_id)
    API->>DB: ensure_case_access(case_id, profile)
    DB-->>API: access OK
    API->>DB: find existing hearing (case, judge, date, time)
    alt duplicate found and allow_duplicate is false
        DB-->>API: existing row
        API-->>FE: 409 Conflict
        FE-->>Lawyer: "Already scheduled - confirm re-listing?"
    else no conflicting hearing
        DB-->>API: none found
        API->>DB: insert hearings row
        API->>DB: insert case_timeline_events row
        API->>DB: insert notifications row (client + team)
        API-->>FE: 201 HearingSummary
        FE-->>Lawyer: Hearing scheduled
    end
```

## 6. Component diagram — system architecture

```mermaid
flowchart LR
    WEB["React SPA<br/>Admin / Lawyer / Client"] -->|"HTTPS + Bearer token"| MAIN["FastAPI app"]

    subgraph BACKEND["Backend"]
        direction TB
        MAIN --> MW["Auth middleware"]
        MAIN --> ROUTERS["Routers: cases, hearings, clients, users,<br/>admin, billing, trust, documents, esign,<br/>conflict_check, messages, meetings,<br/>notifications, case_history, judgements"]
        MAIN --> ML["ML services"]
    end

    subgraph SUPABASE["Supabase"]
        direction TB
        SAUTH["Auth"]
        SDB["Postgres DB"]
        SSTORE["Storage"]
    end

    subgraph EXTERNAL["Third-party"]
        direction TB
        RAZOR["Razorpay"]
        LEEG["Leegality"]
        ECRT["eCourtsIndia"]
    end

    MW -->|"verify token"| SAUTH
    ROUTERS -->|"CRUD"| SDB
    ML -->|"read"| SDB
    ROUTERS -->|"upload / signed URL"| SSTORE
    ROUTERS -->|"payments"| RAZOR
    ROUTERS -->|"e-sign"| LEEG
    ROUTERS -->|"CNR sync"| ECRT
    WEB -.-> SSTORE
```
