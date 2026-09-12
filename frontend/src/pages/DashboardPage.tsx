/** `/dashboard` route: renders `LawyerDashboardPage` for role 2, `ClientDashboardPage` otherwise. */
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
  if (profile?.role_id === 2) return <LawyerDashboardPage />
  return <ClientDashboardPage />
}
