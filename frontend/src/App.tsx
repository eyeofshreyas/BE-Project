import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/auth/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import RoleSelectionPage from './pages/auth/RoleSelectionPage'
import AdminConsolePage from './pages/admin/AdminConsolePage'
import ConveyancingDashboardPage from './pages/conveyancing/ConveyancingDashboardPage'
import SettingsPage from './pages/settings/SettingsPage'
import ProtectedRoute from './lib/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/role-selection" element={<RoleSelectionPage />} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminConsolePage /></ProtectedRoute>} />
        <Route path="/conveyancing" element={<ProtectedRoute><ConveyancingDashboardPage /></ProtectedRoute>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
