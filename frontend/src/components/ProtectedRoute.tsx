import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserProfile } from '../types/api'

// Every gated page and AppLayout re-read the same 'lexflow_token'/'lexflow_profile'
// localStorage keys with this same try/parse/catch shape rather than sharing
// one helper -- known duplication, not yet consolidated (see ponytail-audit).
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

// Client-side gate only -- real enforcement is the backend rejecting the
// request; this just avoids flashing a protected page before that 401 lands.
export default function ProtectedRoute({ children, requireAdmin }: { children: ReactNode; requireAdmin?: boolean }) {
  const profile = loadProfile()

  if (!profile) return <Navigate to="/login" replace />
  if (requireAdmin && profile.role_id !== 1) return <Navigate to="/conveyancing" replace />

  return <>{children}</>
}
