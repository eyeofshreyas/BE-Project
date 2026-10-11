
/**
 * Single point of contact with the FastAPI backend.
 * Handles authentication, token refresh, GET retries, and session expiry.
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
  RazorpayAccountStatus,
  RazorpayOnboardingPayload,
  JudgementSummary,
  JudgementCreatePayload,
  CaseCreatePayload,
  MatterCreatePayload,
  MatterCreated,
  MatterDetail,
  MatterDocumentSummary,
  MatterDueDiligence,
  MatterProgressStage,
  ConversationSummary,
  ConversationDetail,
  TrustBalance,
  TrustLedger,
  TrustTransaction,
  TrustReconciliation,
  MessageSummary,
  SimilarCaseResult,
  SimilarCaseDetail,
  CaseSearchResult,
  JudgeOption,
  AdminStats,
  ActivityEvent,
  AdminAnalytics,
  FirmAnalytics,
  UserDeleteImpact,
  PartySummary,
  ConflictMatch,
  ConflictSearchHistoryEntry,
  AvailableLawyer,
  SuspendedFirm,
} from '../types/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const ACCESS_TOKEN_KEY = 'lexflow_token'
const REFRESH_TOKEN_KEY = 'lexflow_refresh_token'
const PROFILE_KEY = 'lexflow_profile'

type RefreshResponse = {
  access_token: string
  refresh_token: string
}

let refreshPromise: Promise<string> | null = null

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function refreshAccessToken(
  tokenUsedForRequest: string,
): Promise<string> {
  // If another request is already refreshing, wait for that same refresh.
  if (refreshPromise) {
    return refreshPromise
  }

  const currentToken = localStorage.getItem(ACCESS_TOKEN_KEY)

  // Another request may have refreshed the token before this request
  // received its 401 response.
  if (currentToken && currentToken !== tokenUsedForRequest) {
    return currentToken
  }

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  refreshPromise = (async () => {
    const response = await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = (await response.json()) as RefreshResponse

    if (!data.access_token || !data.refresh_token) {
      throw new Error('Invalid token refresh response')
    }

    // Save both tokens because Supabase may rotate the refresh token.
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)

    return data.access_token
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

function clearSessionAndRedirect(): Promise<never> {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(PROFILE_KEY)

  window.location.href = '/login'

  // Prevent protected UI code from continuing with an invalid session.
  return new Promise<never>(() => {})
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const isRetryable = method === 'GET'
  const maxAttempts = isRetryable ? 2 : 1

  const isAuthenticationEndpoint = [
    '/login',
    '/signup',
    '/forgot-password',
    '/refresh',
  ].includes(path)

  // Rebuild headers for every attempt so a replay uses the latest token.
  const sendRequest = () => {
    const headers = new Headers(authHeaders())
    const suppliedHeaders = new Headers(options.headers)

    suppliedHeaders.forEach((value, key) => {
      headers.set(key, value)
    })

    return fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    })
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Remember which token was used for this request. This helps distinguish
    // an expired token from one another request has already refreshed.
    const tokenUsedForRequest = localStorage.getItem(ACCESS_TOKEN_KEY)

    let res: Response

    try {
      res = await sendRequest()
    } catch (err) {
      // Retry network failures for GET requests only.
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        continue
      }

      throw err
    }

    if (
      res.status === 401 &&
      tokenUsedForRequest &&
      !isAuthenticationEndpoint
    ) {
      try {
        await refreshAccessToken(tokenUsedForRequest)
      } catch {
        return clearSessionAndRedirect()
      }

      // Replay the original request once with the latest access token.
      // Do not automatically log out on a network error during this replay.
      res = await sendRequest()

      // The refreshed session was not accepted by the protected endpoint.
      if (res.status === 401) {
        return clearSessionAndRedirect()
      }
    }

    // Preserve the existing retry behavior for server errors on GET requests.
    if (res.status >= 500 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    if (res.status === 204) {
      return undefined as T
    }

    const data = await res.json()

    if (!res.ok) {
      const error = new Error(
        data.detail ?? 'Request failed',
      ) as Error & { status?: number }

      error.status = res.status
      throw error
    }

    return data as T
  }

  throw new Error('Request failed')
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
  return request<T>(path, {
    method: 'POST',
    body: formData,
  })
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

export function updateMatter(
  matterId: number,
  payload: {
    registration_status?: string
    registration_date?: string
    office_name?: string
  },
) {
  return patch<{
    matter_id: number
    registration_status: string | null
    registration_date: string | null
  }>(`/conveyancing/matters/${matterId}`, payload)
}

export function getMatterDetail(matterId: number) {
  return get<MatterDetail>(`/conveyancing/matters/${matterId}`)
}

export function updateDueDiligence(
  matterId: number,
  payload: Partial<
    Pick<
      MatterDueDiligence,
      | 'title_clear'
      | 'tax_verified'
      | 'encumbrance_checked'
      | 'litigation_checked'
      | 'remarks'
    >
  >,
) {
  return patch<MatterDueDiligence>(
    `/conveyancing/matters/${matterId}/due-diligence`,
    payload,
  )
}

export function completeProgressStage(matterId: number, progressId: number) {
  return patch<MatterProgressStage>(
    `/conveyancing/matters/${matterId}/progress/${progressId}`,
    {},
  )
}

export function uploadMatterDocument(matterId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return postForm<MatterDocumentSummary>(
    `/conveyancing/matters/${matterId}/documents`,
    formData,
  )
}

export function listDocuments() {
  return get<DocumentSummary[]>('/documents')
}

export function getDocumentSummary(documentId: number) {
  return get<AiSummary>(`/documents/${documentId}/summary`)
}

export function summarizeDocument(documentId: number, text = '') {
  return post<{ summary: string; status: 'pending' | 'done' }>(
    '/ai/summarize',
    { text, document_id: documentId },
  )
}

export function requestSignature(
  documentId: number,
  signers: { name: string; email: string }[],
) {
  return post<DocumentSummary>(
    `/documents/${documentId}/request-signature`,
    { signers },
  )
}

export function listCaseParties(caseId: number) {
  return get<PartySummary[]>(`/cases/${caseId}/parties`)
}

export function addCaseParty(caseId: number, name: string, role?: string) {
  return post<PartySummary>(`/cases/${caseId}/parties`, { name, role })
}

export function searchConflicts(criteria: { name?: string; clientId?: number; caseNumber?: string }) {
  const params = new URLSearchParams()
  if (criteria.name) params.set('name', criteria.name)
  if (criteria.clientId != null) params.set('client_id', String(criteria.clientId))
  if (criteria.caseNumber) params.set('case_number', criteria.caseNumber)
  return get<ConflictMatch[]>(`/conflict-check?${params.toString()}`)
}

export function listConflictSearchHistory() {
  return get<ConflictSearchHistoryEntry[]>('/conflict-check/history')
}

export function findSimilarCases(query: string, topK = 5) {
  return post<SimilarCaseResult[]>('/ai/similar-cases', {
    query,
    top_k: topK,
  })
}

export function translateText(
  text: string,
  targetLanguage: string,
  documentId?: number,
) {
  return post<{ translated_text: string }>('/ai/translate', {
    text,
    target_language: targetLanguage,
    document_id: documentId ?? null,
  })
}

export function listSimilarOwnCases(caseId: number) {
  return get<CaseSearchResult[]>(`/cases/${caseId}/similar`)
}

export function searchOwnCases(query: string, topK = 5) {
  return post<CaseSearchResult[]>('/ai/case-search', {
    query,
    top_k: topK,
  })
}

export function getSimilarCase(docId: string) {
  return get<SimilarCaseDetail>(
    `/ai/similar-cases/${encodeURIComponent(docId)}`,
  )
}

export function listUsers(role?: string) {
  return get<UserSummary[]>(
    role ? `/users?role=${encodeURIComponent(role)}` : '/users',
  )
}

export function setUserStatus(userId: number, isActive: boolean) {
  return patch<UserSummary>(`/users/${userId}/status`, {
    is_active: isActive,
  })
}

export function setClientFirmStatus(userId: number, isActive: boolean) {
  return patch<UserSummary>(`/users/${userId}/firm-status`, {
    is_active: isActive,
  })
}

export function adminUpdateUser(
  userId: number,
  payload: {
    full_name: string
    phone: string
    specialization?: string
  },
) {
  return patch<UserSummary>(`/users/${userId}`, payload)
}

export function listLawyerSpecializations() {
  return get<string[]>('/reference/lawyer-specializations')
}

export function getUserDeleteImpact(userId: number) {
  return get<UserDeleteImpact>(`/users/${userId}/impact`)
}

export function inviteLawyer(email: string) {
  return post<{ message: string }>('/admin/lawyer-invites', { email })
}

export function getRazorpayAccountStatus() {
  return get<RazorpayAccountStatus>('/admin/razorpay-account')
}

export function submitRazorpayOnboarding(payload: RazorpayOnboardingPayload) {
  return post<RazorpayAccountStatus>('/admin/razorpay-account', payload)
}

/** Irreversible: removes the user and everything cascading off them. Show the impact first. */
export function deleteUser(userId: number) {
  return del<UserDeleteImpact>(`/users/${userId}`)
}

export function updateOwnProfile(payload: { full_name: string; phone: string }) {
  return patch<UserSummary>('/users/me', payload)
}

export function getAdminStats() {
  return get<AdminStats>('/admin/stats')
}

export function listAdminActivity(limit = 15) {
  return get<ActivityEvent[]>(`/admin/activity?limit=${limit}`)
}

export function getAdminAnalytics() {
  return get<AdminAnalytics>('/admin/analytics')
}

export function getFirmAnalytics() {
  return get<FirmAnalytics>('/admin/firm-analytics')
}

export function updateCaseClaimValue(caseId: number, claimValue: number | null) {
  return patch<CaseSummary>(`/cases/${caseId}/claim-value`, {
    claim_value: claimValue,
  })
}

export function listNotifications() {
  return get<NotificationSummary[]>('/notifications')
}

export function markNotificationRead(notificationId: number) {
  return patch<NotificationSummary>(
    `/notifications/${notificationId}/read`,
    {},
  )
}

export function listCourts() {
  return get<CourtOption[]>('/reference/courts')
}

export function listCaseTypes() {
  return get<CaseTypeOption[]>('/reference/case-types')
}

export function sendClientRequest(payload: {
  email: string
  court_id: number
  case_type_id: number
  message?: string
}) {
  return post<ClientRequestSummary>('/client-requests', payload)
}

export function listClientRequests() {
  return get<ClientRequestSummary[]>('/client-requests')
}

export function respondClientRequest(
  requestId: number,
  decision: 'accept' | 'decline',
) {
  return patch<ClientRequestSummary>(
    `/client-requests/${requestId}/respond`,
    { decision },
  )
}

export function listCaseNotes(caseId: number) {
  return get<NoteSummary[]>(`/cases/${caseId}/notes`)
}

export function addCaseNote(
  caseId: number,
  note: string,
  extra?: { title?: string; checklist?: ChecklistItem[] },
) {
  return post<NoteSummary>(`/cases/${caseId}/notes`, { note, ...extra })
}

export function updateCaseNote(
  caseId: number,
  noteId: number,
  changes: Partial<
    Pick<NoteSummary, 'title' | 'note' | 'checklist' | 'pinned'>
  >,
) {
  return patch<NoteSummary>(
    `/cases/${caseId}/notes/${noteId}`,
    changes,
  )
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
  return patch<{ current_status: string | null }>(
    `/cases/${caseId}/status`,
    { new_status: newStatus },
  )
}

export function removeLawyerFromCase(caseId: number, lawyerId: number) {
  return del<CaseSummary>(`/cases/${caseId}/lawyers/${lawyerId}`)
}

export function addLawyerToCase(
  caseId: number,
  lawyerId: number,
  assignedRole = 'Associate',
) {
  return post<CaseSummary>('/cases/' + caseId + '/lawyers', {
    lawyer_id: lawyerId,
    assigned_role: assignedRole,
  })
}

export function listAvailableCaseLawyers(caseId: number) {
  return get<AvailableLawyer[]>(`/cases/${caseId}/available-lawyers`)
}

export function setCaseCnr(caseId: number, cnrNumber: string) {
  return patch<CaseSummary>(`/cases/${caseId}/cnr`, {
    cnr_number: cnrNumber,
  })
}

export function syncCaseEcourts(caseId: number) {
  return post<CaseSummary>(`/cases/${caseId}/sync-ecourts`, {})
}

export function updateCaseFilingDetails(
  caseId: number,
  payload: {
    filing_number?: string
    registration_number?: string
    acts_sections?: string
  },
) {
  return patch<CaseSummary>(`/cases/${caseId}/filing-details`, payload)
}

export function listInvoices() {
  return get<InvoiceSummary[]>('/billing/invoices')
}

export function getInvoice(invoiceId: number) {
  return get<InvoiceSummary>(`/billing/invoices/${invoiceId}`)
}

export function createInvoice(payload: {
  case_id: number
  invoice_number: string
  amount: number
  tax?: number
  total_amount: number
  issue_date: string
  due_date?: string
  remarks?: string
}) {
  return post<InvoiceSummary>('/billing/invoices', payload)
}

export function listInvoicePayments(invoiceId: number) {
  return get<PaymentSummary[]>(
    `/billing/invoices/${invoiceId}/payments`,
  )
}

export function createPayment(payload: {
  invoice_id: number
  amount: number
  payment_method?: string
  transaction_reference?: string
  payment_date: string
}) {
  return post<PaymentSummary>('/billing/payments', payload)
}

export function createRazorpayOrder(invoiceId: number) {
  return post<RazorpayOrder>(
    `/billing/invoices/${invoiceId}/razorpay-order`,
    {},
  )
}

export function verifyRazorpayPayment(
  invoiceId: number,
  payload: {
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  },
) {
  return post<PaymentSummary>(
    `/billing/invoices/${invoiceId}/razorpay-verify`,
    payload,
  )
}

export function listHearings() {
  return get<HearingSummary[]>('/hearings')
}

export function listJudges() {
  return get<JudgeOption[]>('/reference/judges')
}

export function createJudge(payload: {
  judge_name: string
  court_id: number
  designation?: string
}) {
  return post<JudgeOption>('/reference/judges', payload)
}

export function createHearing(payload: {
  case_id: number
  judge_id: number
  hearing_date: string
  hearing_time?: string
  courtroom?: string
  notes?: string
  allow_duplicate?: boolean
}) {
  return post<HearingSummary>('/hearings', payload)
}

export function updateHearing(
  hearingId: number,
  payload: {
    hearing_status?: string
    hearing_outcome?: string
    next_hearing_date?: string
    notes?: string
  },
) {
  return patch<HearingSummary>(`/hearings/${hearingId}`, payload)
}

export function updateMeeting(
  meetingId: number,
  payload: {
    meeting_status?: string
    discussion_summary?: string
    decisions?: string
    action_items?: string
    next_meeting_date?: string
  },
) {
  return patch<MeetingSummary>(`/meetings/${meetingId}`, payload)
}

export function updateHearingStatus(
  hearingId: number,
  hearing_status: string,
) {
  return patch<HearingSummary>(
    `/hearings/${hearingId}`,
    { hearing_status },
  )
}

export function listClients() {
  return get<ClientSummary[]>('/clients')
}

export function listMySuspensions() {
  return get<SuspendedFirm[]>('/clients/me/suspensions')
}

export function sendInvoiceReminder(invoiceId: number) {
  return post<{ message: string }>(
    `/billing/invoices/${invoiceId}/remind`,
    {},
  )
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

export function uploadDocument(
  caseId: number,
  file: File,
  documentTypeId: number,
) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('document_type_id', String(documentTypeId))

  return postForm<DocumentSummary>(
    `/cases/${caseId}/documents`,
    formData,
  )
}

export function deleteDocument(documentId: number) {
  return del<{ message: string }>(`/documents/${documentId}`)
}

export function getDocumentDownloadUrl(
  documentId: number,
  download = false,
) {
  return get<{ url: string }>(
    `/documents/${documentId}/download${download ? '?download=true' : ''}`,
  )
}

export function listMeetings(caseId: number) {
  return get<MeetingSummary[]>(`/meetings?case_id=${caseId}`)
}

export function listAllMeetings() {
  return get<MeetingSummary[]>('/meetings')
}

export function createMeeting(payload: {
  case_id: number
  conducted_by?: number
  meeting_title: string
  meeting_type?: string
  meeting_date: string
  agenda?: string
}) {
  return post<MeetingSummary>('/meetings', payload)
}

export function listConversations() {
  return get<ConversationSummary[]>('/messages/conversations')
}

export function getOrCreateConversation(otherPartyId: number) {
  return post<ConversationSummary>(
    '/messages/conversations',
    { other_party_id: otherPartyId },
  )
}

export function getConversation(conversationId: number) {
  return get<ConversationDetail>(
    `/messages/conversations/${conversationId}`,
  )
}

export function sendMessage(
  conversationId: number,
  body: string,
  file?: File | null,
) {
  const formData = new FormData()
  formData.append('body', body)
  if (file) formData.append('file', file)

  return postForm<MessageSummary>(
    `/messages/conversations/${conversationId}/messages`,
    formData,
  )
}

export function getTrustBalance(clientId: number) {
  return get<TrustBalance>(`/trust/clients/${clientId}/balance`)
}

export function getTrustLedger(clientId: number) {
  return get<TrustLedger>(`/trust/clients/${clientId}/transactions`)
}

export function createTrustTransaction(payload: {
  client_id: number
  case_id?: number | null
  type: 'deposit' | 'disbursement'
  amount: number
  transaction_date: string
  description?: string
}) {
  return post<TrustTransaction>('/trust/transactions', payload)
}

export function payInvoiceFromTrust(invoiceId: number) {
  return post<{
    invoice_id: number
    client_id: number
    amount_paid: number
    remaining_trust_balance: number
  }>(`/invoices/${invoiceId}/pay-from-trust`, {})
}

export function getTrustReconciliation(asOf?: string) {
  return get<TrustReconciliation>(
    `/trust/reconciliation${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`,
  )
}

export function createTrustBankStatement(payload: {
  statement_date: string
  bank_balance: number
  notes?: string
}) {
  return post('/trust/bank-statements', payload)
}
