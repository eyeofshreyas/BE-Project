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
  client: string | null
  lawyer: string | null
  court: string | null
  status: string
  hearing: string | null
  priority: string
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
