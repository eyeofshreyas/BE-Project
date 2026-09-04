/** Shared TypeScript shapes for backend request/response payloads, consumed by `api/client.ts` and pages/components throughout the app. */
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

export interface CaseSummary {
  id: string
  case_id: number
  case_title: string | null
  filing_date: string | null
  created_at: string | null
  client: string | null
  lawyer_id: number | null
  lawyer: string | null
  lawyer_email: string | null
  lawyer_phone: string | null
  court: string | null
  case_type: string | null
  status: string
  hearing: string | null
  priority: string
  description: string | null
}

export interface CaseCreatePayload {
  case_type_id: number
  case_title: string
  client_id: number
  court_id: number
  priority: string
  next_hearing_date?: string
  description?: string
}

export interface ChecklistItem {
  text: string
  checked: boolean
}

export interface NoteSummary {
  id: number
  case_id: number
  title: string | null
  note: string
  checklist: ChecklistItem[] | null
  pinned: boolean
  created_at: string
  lawyer_name: string | null
}

export interface RelatedCase {
  doc_id: string
  score: number
}

export interface CaseAiSummary {
  case_id: number
  summary_text: string
  related_cases: RelatedCase[]
  generated_at: string
}

export interface TimelineEvent {
  id: number
  case_id: number
  event_type: string
  event_title: string
  event_description: string | null
  created_at: string
  created_by: string | null
}

export interface MatterCreatePayload {
  matter_name: string
  matter_type: string
  client_id: number
  priority: string
  property_address?: string
  property_type?: string
  title_number?: string
  sale_value?: number
  target_settlement_date?: string
}

export interface MatterCreated {
  matter_id: number
  matter_number: string
}

export interface MatterProperty {
  property_id: number
  property_name: string
  address: string
  city: string | null
  state: string | null
  property_type: string | null
  survey_number: string | null
  market_value: number | null
  land_area: number | null
  builtup_area: number | null
}

export interface MatterProgressStage {
  progress_id: number
  stage_name: string
  stage_order: number
  completed: boolean
  completed_at: string | null
  remarks: string | null
}

export interface MatterDocumentSummary {
  matter_document_id: number
  document_id: number
  file_name: string | null
  mime_type: string | null
  is_required: boolean
  is_verified: boolean
  verified_by: string | null
}

export interface MatterDetail {
  matter_id: number
  matter_number: string
  matter_type: string | null
  transaction_type: string | null
  registration_status: string | null
  completion_percentage: number
  expected_completion_date: string | null
  created_at: string | null
  property: MatterProperty | null
  progress: MatterProgressStage[]
  documents: MatterDocumentSummary[]
}

export interface ConveyancingSummary {
  stats: {
    active_matters: number
    pending_registrations: number
    completed_registrations: number
    upcoming_appointments: number
  }
  status_breakdown: { label: string; count: number }[]
  recent_matters: { matter_id: number; case_id: number | null; number: string; title: string; client: string | null; type: string; property: string | null; lawyer: string | null; reg_date: string | null; status: string }[]
}

export interface DocumentSummary {
  id: number
  file_name: string
  mime_type: string
  upload_date: string
  file_size: number | null
  document_type: string | null
  case_number: string | null
  uploaded_by: string | null
  has_summary: boolean
}

export interface AiSummary {
  summary_text: string
  translated_text: string | null
  keywords: string | null
  important_dates: string | null
  important_sections: string | null
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

export interface CourtOption {
  court_id: number
  court_name: string
  court_type: string | null
  city: string | null
  state: string | null
  address: string | null
}

export interface CaseTypeOption {
  case_type_id: number
  case_type_name: string
  description: string | null
}

export type JudgementOutcome = 'Favourable' | 'Partly Favourable' | 'Against' | 'Settled'

export interface JudgementSummary {
  id: number
  case_id: number
  case_number: string | null
  case_title: string | null
  client_name: string | null
  matter_type: string | null
  citation: string
  court: string
  bench: string
  judgement_date: string
  filing_date: string | null
  outcome: JudgementOutcome
  summary: string
  reasoning: string | null
  relief_text: string | null
  relief_amount: number | null
  appeal_status: string | null
  tags: string[] | null
}

export interface JudgementCreatePayload {
  case_id: number
  citation: string
  court: string
  bench: string
  judgement_date: string
  outcome: JudgementOutcome
  summary: string
  reasoning?: string
  relief_text?: string
  relief_amount?: number
  appeal_status?: string
  tags?: string[]
}

export interface DocumentTypeOption {
  document_type_id: number
  type_name: string
  description: string | null
}

export interface MeetingSummary {
  id: number
  case_id: number
  case_number: string | null
  meeting_title: string | null
  meeting_type: string | null
  meeting_date: string
  duration_minutes: number | null
  agenda: string | null
  meeting_status: string
  conducted_by: string | null
}

export interface ClientSummary {
  id: number
  full_name: string
  email: string
  phone: string
  address: string | null
  preferred_language: string | null
  active_cases: number
  status: string
  pending_amount: number
}

export interface HearingSummary {
  id: number
  case_id: number
  case_number: string | null
  case_title: string | null
  client: string | null
  priority: string | null
  judge_name: string | null
  court_name: string | null
  hearing_date: string
  hearing_time: string | null
  courtroom: string | null
  hearing_status: string
  hearing_outcome: string | null
  next_hearing_date: string | null
  notes: string | null
}

export interface RazorpayOrder {
  order_id: string
  amount: number
  currency: string
  key_id: string
}

export interface InvoiceSummary {
  id: number
  invoice_number: string
  case_number: string | null
  client: string | null
  amount: number
  tax: number | null
  total_amount: number
  issue_date: string
  due_date: string | null
  payment_status: string
}

export interface PaymentSummary {
  payment_id: number
  invoice_id: number
  amount: number
  payment_method: string | null
  transaction_reference: string | null
  payment_date: string
  payment_status: string
}

export interface ClientRequestSummary {
  id: number
  lawyer_name: string | null
  client_name: string | null
  invite_email: string | null
  court_name: string | null
  case_type_name: string | null
  message: string | null
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}
