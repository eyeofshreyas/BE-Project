import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import type { UserProfile } from '../types/api'

const ADMIN = 1
const LAWYER = 2
const CLIENT = 3
const SUPER_ADMIN = 4

function setProfile(role_id: number) {
  const profile: UserProfile = { user_id: 1, role_id, full_name: 'Test User', email: 'x@example.com', phone: '9000000000', is_active: true }
  localStorage.setItem('lexflow_token', 'a-token')
  localStorage.setItem('lexflow_profile', JSON.stringify(profile))
}

function renderAt(path: string, guard: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/gated" element={guard} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/conveyancing" element={<div>Conveyancing Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('ProtectedRoute -- no session', () => {
  it('redirects to /login when there is no profile at all', () => {
    renderAt('/gated', <ProtectedRoute>Secret</ProtectedRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('redirects to /login when the token is missing even though a profile is stored', () => {
    localStorage.setItem('lexflow_profile', JSON.stringify({ user_id: 1, role_id: ADMIN }))
    renderAt('/gated', <ProtectedRoute>Secret</ProtectedRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('redirects to /login when the stored profile is not valid JSON', () => {
    localStorage.setItem('lexflow_token', 'a-token')
    localStorage.setItem('lexflow_profile', 'not-json')
    renderAt('/gated', <ProtectedRoute>Secret</ProtectedRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})

describe('ProtectedRoute -- requireAdmin', () => {
  it.each([ADMIN, SUPER_ADMIN])('lets role_id %i through', (role) => {
    setProfile(role)
    renderAt('/gated', <ProtectedRoute requireAdmin>Secret</ProtectedRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })

  it.each([LAWYER, CLIENT])('redirects role_id %i to /conveyancing', (role) => {
    setProfile(role)
    renderAt('/gated', <ProtectedRoute requireAdmin>Secret</ProtectedRoute>)
    expect(screen.getByText('Conveyancing Page')).toBeInTheDocument()
  })
})

describe('ProtectedRoute -- requireStaff', () => {
  it('redirects a client to /dashboard', () => {
    setProfile(CLIENT)
    renderAt('/gated', <ProtectedRoute requireStaff>Secret</ProtectedRoute>)
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })

  it.each([ADMIN, LAWYER, SUPER_ADMIN])('lets role_id %i through', (role) => {
    setProfile(role)
    renderAt('/gated', <ProtectedRoute requireStaff>Secret</ProtectedRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('ProtectedRoute -- no role restriction', () => {
  it.each([ADMIN, LAWYER, CLIENT, SUPER_ADMIN])('lets role_id %i through', (role) => {
    setProfile(role)
    renderAt('/gated', <ProtectedRoute>Secret</ProtectedRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})
