import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database tables
export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  date_of_birth?: string
  created_at: string
  updated_at: string
}

export interface MedicalInfo {
  id: string
  user_id: string
  allergies?: string
  medications?: string
  conditions?: string
  blood_type?: string
  height?: string
  weight?: string
  created_at: string
  updated_at: string
}

export interface EmergencyContact {
  id: string
  user_id: string
  name: string
  phone: string
  relationship: string
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  notifications: boolean
  email_updates: boolean
  data_sharing: boolean
  location_services: boolean
  created_at: string
  updated_at: string
}

export interface SymptomAnalysis {
  id: string
  user_id: string
  primary_symptom: string
  duration: string
  severity: string
  additional_symptoms: string[]
  description: string
  medications_context?: string
  allergies_context?: string
  medical_history_context?: string
  analysis_result?: any
  confidence_score?: number
  created_at: string
}

export interface Hospital {
  id: string
  name: string
  address: string
  phone: string
  type: "hospital" | "clinic" | "urgent-care"
  specialties: string[]
  rating: number
  latitude: number
  longitude: number
  accepts_insurance: boolean
  created_at: string
}
