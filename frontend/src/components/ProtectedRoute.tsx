/** Route guard used by `App.tsx` to wrap gated routes: redirects to `/login` with no session, or `/conveyancing` when `requireAdmin` fails. */
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
export default function ProtectedRoute({ children, requireAdmin, requireStaff }: { children: ReactNode; requireAdmin?: boolean; requireStaff?: boolean }) {
  const profile = loadProfile()

  if (!profile) return <Navigate to="/login" replace />
  if (requireAdmin && profile.role_id !== 1 && profile.role_id !== 4) return <Navigate to="/conveyancing" replace />
  // A client has no Clients link in their nav, but the URL was still reachable and rendered
  // the firm-facing page's empty shell with the backend's 403 printed under it.
  if (requireStaff && profile.role_id === 3) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
