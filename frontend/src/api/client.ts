import type {
  LoginResponse,
  SignupPayload,
  CaseSummary,
  ConveyancingSummary,
  DocumentSummary,
  AiSummary,
  UserSummary,
  NotificationSummary,
  CourtOption,
  CaseTypeOption,
  ClientRequestSummary,
  NoteSummary,
  TimelineEvent,
  DocumentTypeOption,
  MeetingSummary,
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
  if (res.status === 401 && localStorage.getItem('lexflow_token')) {
    // Session token rejected by the backend (expired/revoked) -- clear it and
    // send the user back to log in instead of leaving every view stuck on a
    // silent or generic "failed to load" error forever.
    localStorage.removeItem('lexflow_token')
    localStorage.removeItem('lexflow_profile')
    window.location.href = '/login'
    return new Promise<T>(() => {})
  }
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

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: formData })
}

export function login(email: string, password: string) {
  return post<LoginResponse>('/login', { email, password })
}

export function signup(payload: SignupPayload) {
  return post<{ message: string }>('/signup', payload)
}

export function forgotPassword(email: string) {
  return post<{ message: string }>('/forgot-password', { email })
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

export function listCourts() {
  return get<CourtOption[]>('/reference/courts')
}

export function listCaseTypes() {
  return get<CaseTypeOption[]>('/reference/case-types')
}

export function sendClientRequest(payload: { email: string; court_id: number; case_type_id: number; message?: string }) {
  return post<ClientRequestSummary>('/client-requests', payload)
}

export function listClientRequests() {
  return get<ClientRequestSummary[]>('/client-requests')
}

export function respondClientRequest(requestId: number, decision: 'accept' | 'decline') {
  return patch<ClientRequestSummary>(`/client-requests/${requestId}/respond`, { decision })
}

export function listCaseNotes(caseId: number) {
  return get<NoteSummary[]>(`/cases/${caseId}/notes`)
}

export function addCaseNote(caseId: number, note: string) {
  return post<NoteSummary>(`/cases/${caseId}/notes`, { note })
}

export function listCaseTimeline(caseId: number) {
  return get<TimelineEvent[]>(`/cases/${caseId}/timeline`)
}

export function changeCaseStatus(caseId: number, newStatus: string) {
  return patch<{ current_status: string | null }>(`/cases/${caseId}/status`, { new_status: newStatus })
}

export function unassignLawyer(caseId: number) {
  return post<CaseSummary>(`/cases/${caseId}/unassign-lawyer`, {})
}

export function listDocumentTypes() {
  return get<DocumentTypeOption[]>('/reference/document-types')
}

export function uploadDocument(caseId: number, file: File, documentTypeId: number) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('document_type_id', String(documentTypeId))
  return postForm<DocumentSummary>(`/cases/${caseId}/documents`, formData)
}

export function getDocumentDownloadUrl(documentId: number) {
  return get<{ url: string }>(`/documents/${documentId}/download`)
}

export function listMeetings(caseId: number) {
  return get<MeetingSummary[]>(`/meetings?case_id=${caseId}`)
}

export function createMeeting(payload: { case_id: number; conducted_by: number; meeting_title: string; meeting_type?: string; meeting_date: string; agenda?: string }) {
  return post<MeetingSummary>('/meetings', payload)
}
