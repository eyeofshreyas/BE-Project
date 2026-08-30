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
  client: string | null
  lawyer_id: number | null
  lawyer: string | null
  court: string | null
  status: string
  hearing: string | null
  priority: string
}

export interface NoteSummary {
  id: number
  case_id: number
  note: string
  created_at: string
  lawyer_name: string | null
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

export interface DocumentSummary {
  id: number
  file_name: string
  mime_type: string
  upload_date: string
  document_type: string | null
  case_number: string | null
  uploaded_by: string | null
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
