import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/auth/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import RoleSelectionPage from './pages/auth/RoleSelectionPage'
import AdminConsolePage from './pages/admin/AdminConsolePage'
import ConveyancingDashboardPage from './pages/conveyancing/ConveyancingDashboardPage'
import SettingsPage from './pages/settings/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/role-selection" element={<RoleSelectionPage />} />
        <Route path="/admin" element={<AdminConsolePage />} />
        <Route path="/conveyancing" element={<ConveyancingDashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
