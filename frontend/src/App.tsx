import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

// Lazy-loaded so each page ships as its own chunk instead of all 25 landing in
// the one 665KB bundle Vite was warning about -- nothing here needs to be
// available before its route is visited.
const LandingPage = lazy(() => import('./pages/auth/LandingPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'))
const RoleSelectionPage = lazy(() => import('./pages/auth/RoleSelectionPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/auth/PrivacyPolicyPage'))
const AdminConsolePage = lazy(() => import('./pages/admin/AdminConsolePage'))
const ConveyancingDashboardPage = lazy(() => import('./pages/conveyancing/ConveyancingDashboardPage'))
const CreateMatterPage = lazy(() => import('./pages/conveyancing/CreateMatterPage'))
const MatterDetailPage = lazy(() => import('./pages/conveyancing/MatterDetailPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CaseDetailPage = lazy(() => import('./pages/cases/CaseDetailPage'))
const CasesListPage = lazy(() => import('./pages/cases/CasesListPage'))
const CreateCasePage = lazy(() => import('./pages/cases/CreateCasePage'))
const DocumentsListPage = lazy(() => import('./pages/documents/DocumentsListPage'))
const DocumentPreviewPage = lazy(() => import('./pages/documents/DocumentPreviewPage'))
const BillingPage = lazy(() => import('./pages/billing/BillingPage'))
const RecordPaymentPage = lazy(() => import('./pages/billing/RecordPaymentPage'))
const GenerateInvoicePage = lazy(() => import('./pages/billing/GenerateInvoicePage'))
const HearingsPage = lazy(() => import('./pages/hearings/HearingsPage'))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'))
const CreateClientPage = lazy(() => import('./pages/clients/CreateClientPage'))
const ClientDetailPage = lazy(() => import('./pages/clients/ClientDetailPage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))
const JudgementsPage = lazy(() => import('./pages/judgements/JudgementsPage'))
const JudgementDetailPage = lazy(() => import('./pages/judgements/JudgementDetailPage'))
const ReferenceJudgementPage = lazy(() => import('./pages/judgements/ReferenceJudgementPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))

/**
 * Single top-level route table for the SPA. Gated routes are wrapped in
 * `ProtectedRoute` (redirects unauthenticated/unauthorized users); most are
 * further wrapped in `AppLayout` for the sidebar/topbar shell -- `/admin`
 * opts out since it renders its own chrome.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/role-selection" element={<RoleSelectionPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminConsolePage /></ProtectedRoute>} />
        <Route path="/conveyancing" element={<ProtectedRoute><AppLayout><ConveyancingDashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/conveyancing/matters/new" element={<ProtectedRoute><AppLayout><CreateMatterPage /></AppLayout></ProtectedRoute>} />
        <Route path="/conveyancing/matters/:matterId" element={<ProtectedRoute><AppLayout><MatterDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases/new" element={<ProtectedRoute><AppLayout><CreateCasePage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute><AppLayout><CaseDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute><AppLayout><CasesListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/documents/:documentId" element={<ProtectedRoute><AppLayout><DocumentPreviewPage /></AppLayout></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><AppLayout><DocumentsListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing/invoices/generate" element={<ProtectedRoute><AppLayout><GenerateInvoicePage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing/invoices/:invoiceId/record-payment" element={<ProtectedRoute><AppLayout><RecordPaymentPage /></AppLayout></ProtectedRoute>} />
        <Route path="/hearings" element={<ProtectedRoute><AppLayout><HearingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients/new" element={<ProtectedRoute requireStaff><AppLayout><CreateClientPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients/:clientId" element={<ProtectedRoute requireStaff><AppLayout><ClientDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute requireStaff><AppLayout><ClientsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/judgements/reference/:docId" element={<ProtectedRoute><AppLayout><ReferenceJudgementPage /></AppLayout></ProtectedRoute>} />
        <Route path="/judgements/:judgementId" element={<ProtectedRoute><AppLayout><JudgementDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/judgements" element={<ProtectedRoute><AppLayout><JudgementsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><AppLayout><MessagesPage /></AppLayout></ProtectedRoute>} />
        <Route path="/messages/:conversationId" element={<ProtectedRoute><AppLayout><MessagesPage /></AppLayout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><AppLayout><NotificationsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
