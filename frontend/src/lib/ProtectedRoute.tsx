import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserProfile } from './api'

function loadProfile(): UserProfile | null {
  try {
    const token = localStorage.getItem('lexflow_token')
    const raw = localStorage.getItem('lexflow_profile')
    if (!token || !raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function ProtectedRoute({ children, requireAdmin }: { children: ReactNode; requireAdmin?: boolean }) {
  const profile = loadProfile()

  if (!profile) return <Navigate to="/login" replace />
  if (requireAdmin && profile.role_id !== 1) return <Navigate to="/conveyancing" replace />

  return <>{children}</>
}
