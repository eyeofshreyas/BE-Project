import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/auth/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import RoleSelectionPage from './pages/auth/RoleSelectionPage'
import AdminConsolePage from './pages/admin/AdminConsolePage'
import ConveyancingDashboardPage from './pages/conveyancing/ConveyancingDashboardPage'
import DashboardPage from './pages/DashboardPage'
import CaseDetailPage from './pages/cases/CaseDetailPage'
import CasesListPage from './pages/cases/CasesListPage'
import DocumentsListPage from './pages/documents/DocumentsListPage'
import BillingPage from './pages/billing/BillingPage'
import HearingsPage from './pages/hearings/HearingsPage'
import ClientsPage from './pages/clients/ClientsPage'
import SettingsPage from './pages/settings/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

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
        <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute><AppLayout><CaseDetailPage /></AppLayout></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute><AppLayout><CasesListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><AppLayout><DocumentsListPage /></AppLayout></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><AppLayout><BillingPage /></AppLayout></ProtectedRoute>} />
        <Route path="/hearings" element={<ProtectedRoute><AppLayout><HearingsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><AppLayout><ClientsPage /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
