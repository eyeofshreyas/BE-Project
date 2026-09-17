/** `/dashboard` route: sends admins to `/admin`, renders `LawyerDashboardPage` for role 2 and `ClientDashboardPage` otherwise. */
import { Navigate } from 'react-router-dom'
import type { UserProfile } from '../types/api'
import ClientDashboardPage from './client/ClientDashboardPage'
import LawyerDashboardPage from './lawyer/LawyerDashboardPage'

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Entry point for the /dashboard route (see App.tsx) -- not a page in its own
 * right, just a role-based switch, so it stays flat instead of nesting under
 * pages/lawyer or pages/client like the views it renders.
 */
export default function DashboardPage() {
  const profile = loadProfile()
  // Login sends an admin straight to /admin and the sidebar swaps their Dashboard link for it,
  // so /dashboard is only reached by a typed URL, a bookmark or the back button -- it used to
  // fall through to the client dashboard, which rendered the admin's name over a client page
  // and then 403'd on the client-only endpoints behind it.
  if (profile?.role_id === 1 || profile?.role_id === 4) return <Navigate to="/admin" replace />
  if (profile?.role_id === 2) return <LawyerDashboardPage />
  return <ClientDashboardPage />
}
