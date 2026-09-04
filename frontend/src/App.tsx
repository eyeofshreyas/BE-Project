import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/auth/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import RoleSelectionPage from './pages/auth/RoleSelectionPage'
import AdminConsolePage from './pages/admin/AdminConsolePage'
import ConveyancingDashboardPage from './pages/conveyancing/ConveyancingDashboardPage'
import CreateMatterPage from './pages/conveyancing/CreateMatterPage'
import DashboardPage from './pages/DashboardPage'
import CaseDetailPage from './pages/cases/CaseDetailPage'
import CasesListPage from './pages/cases/CasesListPage'
import CreateCasePage from './pages/cases/CreateCasePage'
import DocumentsListPage from './pages/documents/DocumentsListPage'
import BillingPage from './pages/billing/BillingPage'
import RecordPaymentPage from './pages/billing/RecordPaymentPage'
import GenerateInvoicePage from './pages/billing/GenerateInvoicePage'
import HearingsPage from './pages/hearings/HearingsPage'
import ClientsPage from './pages/clients/ClientsPage'
import CreateClientPage from './pages/clients/CreateClientPage'
import MessagesListPage from './pages/messages/MessagesListPage'
import JudgementsPage from './pages/judgements/JudgementsPage'
import SettingsPage from './pages/settings/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

/**
 * Single top-level route table for the SPA. Gated routes are wrapped in
 * `ProtectedRoute` (redirects unauthenticated/unauthorized users); most are
 * further wrapped in `AppLayout` for the sidebar/topbar shell -- `/admin`
 * and `/settings` opt out since they render their own chrome.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/role-selection" element={<RoleSelectionPage />} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminConsolePage /></ProtectedRoute>} />
        <Route path="/conveyancing" element={<ProtectedRoute><AppLayout><ConveyancingDashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/conveyancing/matters/new" element={<ProtectedRoute><AppLayout><CreateMatterPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases/new" element={<ProtectedRoute><AppLayout><CreateCasePage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute><AppLayout><CaseDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute><AppLayout><CasesListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><AppLayout><DocumentsListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing/invoices/generate" element={<ProtectedRoute><AppLayout><GenerateInvoicePage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing/invoices/:invoiceId/record-payment" element={<ProtectedRoute><AppLayout><RecordPaymentPage /></AppLayout></ProtectedRoute>} />
        <Route path="/hearings" element={<ProtectedRoute><AppLayout><HearingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients/new" element={<ProtectedRoute><AppLayout><CreateClientPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><AppLayout><ClientsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/judgements" element={<ProtectedRoute><AppLayout><JudgementsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><AppLayout><MessagesListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
