import type {
  LoginResponse,
  SignupPayload,
  CaseSummary,
  ConveyancingSummary,
  DocumentSummary,
  AiSummary,
  UserSummary,
  NotificationSummary,
} from '../types/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lexflow_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers ?? {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function login(email: string, password: string) {
  return post<LoginResponse>('/login', { email, password })
}

export function signup(payload: SignupPayload) {
  return post<{ message: string }>('/signup', payload)
}

export function listCases() {
  return get<CaseSummary[]>('/cases')
}

export function getConveyancingSummary() {
  return get<ConveyancingSummary>('/conveyancing/summary')
}

export function listDocuments() {
  return get<DocumentSummary[]>('/documents')
}

export function getDocumentSummary(documentId: number) {
  return get<AiSummary>(`/documents/${documentId}/summary`)
}

export function listUsers(role?: string) {
  return get<UserSummary[]>(role ? `/users?role=${encodeURIComponent(role)}` : '/users')
}

export function setUserStatus(userId: number, isActive: boolean) {
  return patch<UserSummary>(`/users/${userId}/status`, { is_active: isActive })
}

export function listNotifications() {
  return get<NotificationSummary[]>('/notifications')
}

export function markNotificationRead(notificationId: number) {
  return patch<NotificationSummary>(`/notifications/${notificationId}/read`, {})
}
