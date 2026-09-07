/**
 * Single point of contact with the FastAPI backend. No component calls
 * `fetch` directly -- every endpoint is a thin named wrapper here around
 * `request()`, which attaches auth headers, retries idempotent GETs, and
 * handles session expiry (401) globally.
 */
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
  ChecklistItem,
  CaseAiSummary,
  TimelineEvent,
  DocumentTypeOption,
  MeetingSummary,
  InvoiceSummary,
  PaymentSummary,
  HearingSummary,
  ClientSummary,
  RazorpayOrder,
  JudgementSummary,
  JudgementCreatePayload,
  CaseCreatePayload,
  MatterCreatePayload,
  MatterCreated,
  MatterDetail,
  MatterDocumentSummary,
  ConversationSummary,
  ConversationDetail,
  MessageSummary,
} from '../types/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Reads the bearer token from `localStorage` (`lexflow_token`) and builds the Authorization header, if present. */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lexflow_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Core fetch wrapper: attaches `authHeaders()`, retries a GET once on
 * network error/5xx, and on 401 clears the session and hard-redirects to
 * `/login` (never resolves in that case). All other helpers below call this.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // GET is idempotent, so it's safe to silently retry once on a transient
  // network blip or 5xx -- POST/PATCH never retry here, to avoid double-submitting.
  const isRetryable = (options.method ?? 'GET') === 'GET'
  const maxAttempts = isRetryable ? 2 : 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers ?? {}) },
      })
    } catch (err) {
      if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, 300)); continue }
      throw err
    }

    if (res.status === 401 && localStorage.getItem('lexflow_token')) {
      // Session token rejected by the backend (expired/revoked) -- clear it and
      // send the user back to log in instead of leaving every view stuck on a
      // silent or generic "failed to load" error forever.
      localStorage.removeItem('lexflow_token')
      localStorage.removeItem('lexflow_profile')
      window.location.href = '/login'
      return new Promise<T>(() => {})
    }
    if (res.status >= 500 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 300))
      continue
    }

    const data = await res.json()
    if (!res.ok) throw new Error(data.detail ?? 'Request failed')
    return data as T
  }
  throw new Error('Request failed')
}

/** Thin verb wrappers around `request()` for JSON POST/PATCH/GET, multipart POST, and DELETE. */
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

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
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

export function createCase(payload: CaseCreatePayload) {
  return post<CaseSummary>('/cases', payload)
}

export function getConveyancingSummary() {
  return get<ConveyancingSummary>('/conveyancing/summary')
}

export function createMatter(payload: MatterCreatePayload) {
  return post<MatterCreated>('/conveyancing/matters', payload)
}

export function updateMatter(matterId: number, payload: { registration_status?: string; registration_date?: string; office_name?: string }) {
  return patch<{ matter_id: number; registration_status: string | null; registration_date: string | null }>(`/conveyancing/matters/${matterId}`, payload)
}

export function getMatterDetail(matterId: number) {
  return get<MatterDetail>(`/conveyancing/matters/${matterId}`)
}

export function uploadMatterDocument(matterId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return postForm<MatterDocumentSummary>(`/conveyancing/matters/${matterId}/documents`, formData)
}

export function listDocuments() {
  return get<DocumentSummary[]>('/documents')
}

export function getDocumentSummary(documentId: number) {
  return get<AiSummary>(`/documents/${documentId}/summary`)
}

export function summarizeDocument(documentId: number, text: string) {
  return post<{ summary: string }>('/ai/summarize', { text, document_id: documentId })
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

export function addCaseNote(caseId: number, note: string, extra?: { title?: string; checklist?: ChecklistItem[] }) {
  return post<NoteSummary>(`/cases/${caseId}/notes`, { note, ...extra })
}

export function updateCaseNote(caseId: number, noteId: number, changes: Partial<Pick<NoteSummary, 'title' | 'note' | 'checklist' | 'pinned'>>) {
  return patch<NoteSummary>(`/cases/${caseId}/notes/${noteId}`, changes)
}

export function deleteCaseNote(caseId: number, noteId: number) {
  return del<{ message: string }>(`/cases/${caseId}/notes/${noteId}`)
}

export function getCaseAiSummary(caseId: number) {
  return get<CaseAiSummary>(`/cases/${caseId}/ai-summary`)
}

export function generateCaseAiSummary(caseId: number) {
  return post<CaseAiSummary>(`/cases/${caseId}/ai-summary`, {})
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

export function listInvoices() {
  return get<InvoiceSummary[]>('/billing/invoices')
}

export function getInvoice(invoiceId: number) {
  return get<InvoiceSummary>(`/billing/invoices/${invoiceId}`)
}

export function createInvoice(payload: { case_id: number; invoice_number: string; amount: number; tax?: number; total_amount: number; issue_date: string; due_date?: string; remarks?: string }) {
  return post<InvoiceSummary>('/billing/invoices', payload)
}

export function listInvoicePayments(invoiceId: number) {
  return get<PaymentSummary[]>(`/billing/invoices/${invoiceId}/payments`)
}

export function createPayment(payload: { invoice_id: number; amount: number; payment_method?: string; transaction_reference?: string; payment_date: string }) {
  return post<PaymentSummary>('/billing/payments', payload)
}

export function createRazorpayOrder(invoiceId: number) {
  return post<RazorpayOrder>(`/billing/invoices/${invoiceId}/razorpay-order`, {})
}

export function verifyRazorpayPayment(invoiceId: number, payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  return post<PaymentSummary>(`/billing/invoices/${invoiceId}/razorpay-verify`, payload)
}

export function listHearings() {
  return get<HearingSummary[]>('/hearings')
}

export function updateHearingStatus(hearingId: number, hearing_status: string) {
  return patch<HearingSummary>(`/hearings/${hearingId}`, { hearing_status })
}

export function listClients() {
  return get<ClientSummary[]>('/clients')
}

export function sendInvoiceReminder(invoiceId: number) {
  return post<{ message: string }>(`/billing/invoices/${invoiceId}/remind`, {})
}

export function listJudgements() {
  return get<JudgementSummary[]>('/judgements')
}

export function createJudgement(data: JudgementCreatePayload) {
  return post<JudgementSummary>('/judgements', data)
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

export function deleteDocument(documentId: number) {
  return del<{ message: string }>(`/documents/${documentId}`)
}

export function getDocumentDownloadUrl(documentId: number, download = false) {
  return get<{ url: string }>(`/documents/${documentId}/download${download ? '?download=true' : ''}`)
}

export function listMeetings(caseId: number) {
  return get<MeetingSummary[]>(`/meetings?case_id=${caseId}`)
}

export function listAllMeetings() {
  return get<MeetingSummary[]>('/meetings')
}

export function createMeeting(payload: { case_id: number; conducted_by?: number; meeting_title: string; meeting_type?: string; meeting_date: string; agenda?: string }) {
  return post<MeetingSummary>('/meetings', payload)
}

export function listConversations() {
  return get<ConversationSummary[]>('/messages/conversations')
}

export function getOrCreateConversation(otherPartyId: number) {
  return post<ConversationSummary>('/messages/conversations', { other_party_id: otherPartyId })
}

export function getConversation(conversationId: number) {
  return get<ConversationDetail>(`/messages/conversations/${conversationId}`)
}

/** Sends a message with optional file attachment -- multipart, so text and file share one endpoint. */
export function sendMessage(conversationId: number, body: string, file?: File | null) {
  const formData = new FormData()
  formData.append('body', body)
  if (file) formData.append('file', file)
  return postForm<MessageSummary>(`/messages/conversations/${conversationId}/messages`, formData)
}

