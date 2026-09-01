# Frontend architecture

React + Vite + TypeScript SPA (`frontend/src`). Talks to the FastAPI backend
only through `api/client.ts` — no component calls `fetch` directly.

## 1. Routing (`App.tsx`)

Single `<Routes>` table, no nested routers.

| Path | Page | Wrapper |
|---|---|---|
| `/` | `LandingPage` | none (public marketing page) |
| `/login` | `LoginPage` | none |
| `/signup` | `SignUpPage` | none |
| `/role-selection` | `RoleSelectionPage` | none |
| `/admin` | `AdminConsolePage` | `ProtectedRoute requireAdmin` (no `AppLayout` — admin has its own shell) |
| `/dashboard` | `DashboardPage` | `ProtectedRoute` + `AppLayout` |
| `/conveyancing` | `ConveyancingDashboardPage` | `ProtectedRoute` + `AppLayout` |
| `/cases`, `/cases/new`, `/cases/:caseId` | `CasesListPage`, `CreateCasePage`, `CaseDetailPage` | `ProtectedRoute` + `AppLayout` |
| `/documents` | `DocumentsListPage` | `ProtectedRoute` + `AppLayout` |
| `/billing` | `BillingPage` | `ProtectedRoute` + `AppLayout` |
| `/hearings` | `HearingsPage` | `ProtectedRoute` + `AppLayout` |
| `/clients`, `/clients/new` | `ClientsPage`, `CreateClientPage` | `ProtectedRoute` + `AppLayout` |
| `/judgements` | `JudgementsPage` | `ProtectedRoute` + `AppLayout` |
| `/settings` | `SettingsPage` | `ProtectedRoute` only (has its own header/sidebar, not `AppLayout`'s) |

`AppLayout` renders the sidebar nav + topbar (notification bell, profile
menu) around whatever page it wraps. `/admin` and `/settings` opt out of it
because they render a complete shell of their own.

## 2. Auth / session flow

There is no auth context or store — session state is two `localStorage`
keys, read independently wherever needed:

- `lexflow_token` — the bearer token.
- `lexflow_profile` — the logged-in user's `UserProfile` JSON (`user_id`,
  `role_id`, `full_name`, …).

**Write side:** `LoginPage.handleSubmit` is the only place both keys get
written, right after `login()` succeeds (`pages/auth/LoginPage.tsx`).
`SignUpPage` does not auto-login; it redirects to `/login`.

**Read side:** every gated page/component re-implements the same
`loadProfile()` read-and-`JSON.parse` (`ProtectedRoute.tsx`,
`AppLayout.tsx`, `DashboardPage.tsx`, `CasesListPage.tsx`, and others) —
this is known, flagged duplication (see the repo's ponytail-audit notes),
not a designed pattern. `api/client.ts`'s `authHeaders()` reads
`lexflow_token` the same way to attach `Authorization: Bearer …` to every
request.

**Gate logic:** `ProtectedRoute` redirects to `/login` if no profile is
found, and to `/conveyancing` if `requireAdmin` is set and `role_id !== 1`.
This is a UX convenience only — the backend independently rejects
unauthorized requests; `api/client.ts`'s `request()` clears both keys and
hard-redirects to `/login` on any `401`.

**Role dispatch:** several pages render an entirely different view by role
rather than branching internally — `DashboardPage` (Lawyer vs Client),
`CasesListPage` (`StaffCasesView` vs `ClientCasesView`), `AppLayout` (picks
`LAWYER_NAV` vs `CLIENT_NAV`). Role IDs: `1 = Admin`, `2 = Lawyer`,
`3 = Client`.

## 3. Page → API → backend endpoint

All calls go through named functions in `api/client.ts`; each wraps a
`GET`/`POST`/`PATCH`/`DELETE` to one backend path.

| Page | Calls (`api/client.ts`) | Backend endpoint |
|---|---|---|
| `LoginPage` | `login`, `forgotPassword` | `POST /login`, `POST /forgot-password` |
| `SignUpPage` | `signup` | `POST /signup` |
| `AdminConsolePage` | `listNotifications`, `markNotificationRead` | `GET /notifications`, `PATCH /notifications/:id/read` |
| `admin/views/UsersView` | `listUsers`, `setUserStatus` | `GET /users`, `PATCH /users/:id/status` |
| `admin/views/CasesView` | `listCases` | `GET /cases` |
| `admin/views/DocumentsView` | `listDocuments`, `getDocumentSummary` | `GET /documents`, `GET /documents/:id/summary` |
| `ConveyancingDashboardPage` | `getConveyancingSummary`, `listCourts`, `listCaseTypes`, `sendClientRequest`, `listAllMeetings` | `GET /conveyancing/summary`, `GET /reference/courts`, `GET /reference/case-types`, `POST /client-requests`, `GET /meetings` |
| `LawyerDashboardPage` | `listCases`, `listHearings`, `listClients`, `listInvoices`, `listDocuments` | `GET /cases`, `GET /hearings`, `GET /clients`, `GET /billing/invoices`, `GET /documents` |
| `ClientDashboardPage` | `listCases`, `listHearings`, `listInvoices`, `listDocuments`, `listNotifications`, `listClientRequests`, `respondClientRequest`, `getDocumentDownloadUrl` | corresponding `GET`s above, plus `GET /client-requests`, `PATCH /client-requests/:id/respond`, `GET /documents/:id/download` |
| `CasesListPage` | `listCases`, `listHearings`, `listCaseTimeline` | `GET /cases`, `GET /hearings`, `GET /cases/:id/timeline` |
| `CreateCasePage` | `listCourts`, `listCaseTypes`, `listClients`, `listDocumentTypes`, `createCase`, `uploadDocument` | `GET /reference/courts`, `/reference/case-types`, `/clients`, `/reference/document-types`, then `POST /cases`, `POST /cases/:id/documents` |
| `CaseDetailPage` | `listCases`, `listCaseNotes`, `addCaseNote`, `listCaseTimeline`, `changeCaseStatus`, `listDocuments`, `listMeetings`, `createMeeting`, `listDocumentTypes`, `uploadDocument`, `getDocumentDownloadUrl`, `unassignLawyer` | `GET /cases`, `/cases/:id/notes` (+`POST`), `/cases/:id/timeline`, `PATCH /cases/:id/status`, `/documents`, `/meetings` (+`POST`), `/reference/document-types`, `POST /cases/:id/documents`, `GET /documents/:id/download`, `POST /cases/:id/unassign-lawyer` |
| `DocumentsListPage` | `listDocuments`, `getDocumentSummary`, `getDocumentDownloadUrl`, `deleteDocument`, `listCases`, `listDocumentTypes`, `uploadDocument` | `GET /documents`, `/documents/:id/summary`, `/documents/:id/download`, `DELETE /documents/:id`, `GET /cases`, `/reference/document-types`, `POST /cases/:id/documents` |
| `BillingPage` | `listInvoices`, `createInvoice`, `createPayment`, `sendInvoiceReminder`, `listCases`, `listInvoicePayments` | `GET/POST /billing/invoices`, `POST /billing/payments`, `POST /billing/invoices/:id/remind`, `GET /cases`, `GET /billing/invoices/:id/payments` |
| `HearingsPage` | `listHearings`, `updateHearingStatus` | `GET /hearings`, `PATCH /hearings/:id` |
| `ClientsPage` | `listClients` | `GET /clients` |
| `CreateClientPage` | `listCourts`, `listCaseTypes`, `sendClientRequest` | `GET /reference/courts`, `/reference/case-types`, `POST /client-requests` |
| `JudgementsPage` | `listJudgements`, `createJudgement`, `listCases` | `GET/POST /judgements`, `GET /cases` |
| `AppLayout` (every page) | `listNotifications`, `markNotificationRead` | `GET /notifications`, `PATCH /notifications/:id/read` |

`api/client.ts` internals worth knowing: `request()` retries once on a `GET`
that hits a network error or `5xx` (never on `POST`/`PATCH`, to avoid
double-submits), and on any `401` it clears the session and hard-redirects
to `/login`.

## 4. Shared building blocks (`components/`)

| File | Purpose | Used by |
|---|---|---|
| `icons.tsx` | One `Icon({ name, size, color, strokeWidth })` component with a name-keyed `switch` over inline SVGs — the single icon set for the app. | Most pages; newer pages use this instead of hand-rolling local `<XIcon>` consts. |
| `theme.ts` | Shared color/style constants (`C`) for the admin console. | `AdminConsolePage` and all `admin/views/*`. |
| `AppShell.module.css` | CSS module backing the sidebar/topbar layout and the admin console's shared chrome. | `AppLayout`, `admin/*`, `ClientDashboardPage`, `DocumentsListPage`. |
| `DocumentPreviewModal.tsx` | Modal that inline-previews a document (image/video/PDF via `isPreviewable()`), falling back to a plain download link for other types. | `DocumentsListPage`, `CaseDetailPage`. |
| `ProtectedRoute.tsx` | Route guard: no session → `/login`; `requireAdmin` + non-admin → `/conveyancing`. | `App.tsx`, wrapping every gated route. |
| `AppLayout.tsx` | Sidebar nav (role-dependent item list) + topbar (search, notifications, profile menu) around page content. | Every `AppLayout`-wrapped route in `App.tsx`. |
