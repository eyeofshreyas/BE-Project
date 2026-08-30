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

export default function DashboardPage() {
  const profile = loadProfile()
  if (profile?.role_id === 2) return <LawyerDashboardPage />
  return <ClientDashboardPage />
}
