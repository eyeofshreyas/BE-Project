const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data as T
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data as T
}

export interface UserProfile {
  user_id: number
  role_id: number
  full_name: string
  email: string
  phone: string
  is_active: boolean
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user_email: string
  profile: UserProfile | null
}

export function login(email: string, password: string) {
  return post<LoginResponse>('/login', { email, password })
}

export interface SignupPayload {
  email: string
  password: string
  full_name: string
  phone: string
  role: 'lawyer' | 'client'
  bar_council_number?: string
  specialization?: string
  experience_years?: number
  address?: string
  preferred_language?: string
}

export function signup(payload: SignupPayload) {
  return post<{ message: string }>('/signup', payload)
}

export interface CaseSummary {
  id: string
  client: string | null
  lawyer: string | null
  court: string | null
  status: string
  hearing: string | null
  priority: string
}

export function listCases() {
  return get<CaseSummary[]>('/cases')
}

export interface ConveyancingSummary {
  stats: {
    active_matters: number
    pending_registrations: number
    completed_registrations: number
    upcoming_appointments: number
  }
  status_breakdown: { label: string; count: number }[]
  recent_matters: { number: string; client: string | null; type: string; status: string }[]
}

export function getConveyancingSummary() {
  return get<ConveyancingSummary>('/conveyancing/summary')
}

export interface DocumentSummary {
  id: number
  file_name: string
  mime_type: string
  upload_date: string
  document_type: string | null
  case_number: string | null
  uploaded_by: string | null
}

export function listDocuments() {
  return get<DocumentSummary[]>('/documents')
}

export interface AiSummary {
  summary_text: string
  translated_text: string | null
  keywords: string | null
  important_dates: string | null
  important_sections: string | null
}

export function getDocumentSummary(documentId: number) {
  return get<AiSummary>(`/documents/${documentId}/summary`)
}

export interface UserSummary {
  id: number
  full_name: string
  email: string
  phone: string
  role: string | null
  is_active: boolean
  created_at: string
}

export function listUsers(role?: string) {
  return get<UserSummary[]>(role ? `/users?role=${encodeURIComponent(role)}` : '/users')
}

export function setUserStatus(userId: number, isActive: boolean) {
  return patch<UserSummary>(`/users/${userId}/status`, { is_active: isActive })
}

export interface NotificationSummary {
  id: number
  case_id: number | null
  case_number: string | null
  title: string | null
  message: string | null
  notification_type: string
  is_read: boolean
  created_at: string
}

export function listNotifications(userId: number) {
  return get<NotificationSummary[]>(`/notifications?user_id=${userId}`)
}

export function markNotificationRead(notificationId: number) {
  return patch<NotificationSummary>(`/notifications/${notificationId}/read`, {})
}
