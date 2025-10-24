import { createClient } from '@supabase/supabase-js'

// Use environment variables for Supabase configuration
// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lab.infispark.in';
// const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc0ODg1NzU2MCwiZXhwIjo0OTA0NTMxMTYwLCJyb2xlIjoiYW5vbiJ9.oLbBvtRJHTAGl-6PvyfQ_nilkaJi2Nnk8PGzAKkoz50"
// const supabaseUrl ='https://lab-supabase.infispark.in';
// const supabaseKey =  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1MzQ0OTI0MCwiZXhwIjo0OTA5MTIyODQwLCJyb2xlIjoiYW5vbiJ9.6I8JKwf9g6S5GogaSz6dojnCzsEmnIJZz-3ELxf5LlI"

const supabaseUrl ='https://labapi.infispark.in';
const supabaseKey =  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9asdfasfeyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1NDMyMjQ4MCwiZXhwIjo0OTA5OTk2MDgwLCJyb2xlIjoiYW5vbiJ9.6cRfh-LkLXv7STWB-nfKM3EbOxm9A9GVGwPus9vtMf4"


export const supabase = createClient(supabaseUrl, supabaseKey)

export type Database = {
  public: {
    Tables: {
      user: {
        Row: {
          id: number
          created_at: string
          uid: string
          name: string
          role: string
        }
        Insert: {
          id?: number
          created_at?: string
          uid: string
          name: string
          role?: string
        }
        Update: {
          id?: number
          created_at?: string
          uid?: string
          name?: string
          role?: string
        }
      }
      blood_test: {
        Row: {
          id: number
          created_at: string
          outsource: boolean
          parameter: any
          price: number
          test_name: string
          sub_head: any
        }
        Insert: {
          id?: number
          created_at?: string
          outsource?: boolean
          parameter?: any
          price: number
          test_name: string
          sub_head?: any
        }
        Update: {
          id?: number
          created_at?: string
          outsource?: boolean
          parameter?: any
          price?: number
          test_name?: string
          sub_head?: any
        }
      }
      doctorlist: {
        Row: {
          id: number
          created_at: string
          commission: number
          doctor_name: string
          number: number
        }
        Insert: {
          id?: number
          created_at?: string
          commission?: number
          doctor_name: string
          number?: number
        }
        Update: {
          id?: number
          created_at?: string
          commission?: number
          doctor_name?: string
          number?: number
        }
      }
      packages: {
        Row: {
          id: number
          created_at: string
          discount: number
          package_name: string
          tests: any
        }
        Insert: {
          id?: number
          created_at?: string
          discount?: number
          package_name: string
          tests?: any
        }
        Update: {
          id?: number
          created_at?: string
          discount?: number
          package_name?: string
          tests?: any
        }
      }
      patientdetail: {
        Row: {
          id: number
          created_at: string
          name: string
          number: number
          address: string
          age: number
          day_type: string
          gender: string
          patient_id: string
          total_day: number
          title: string
        }
        Insert: {
          id?: number
          created_at?: string
          name: string
          number: number
          address?: string
          age: number
          day_type: string
          gender: string
          patient_id: string
          total_day?: number
          title?: string
        }
        Update: {
          id?: number
          created_at?: string
          name?: string
          number?: number
          address?: string
          age?: number
          day_type?: string
          gender?: string
          patient_id?: string
          total_day?: number
          title?: string
        }
      }
      registration: {
        Row: {
          id: number
          created_at: string
          patient_id: number
          amount_paid: number
          visit_type: string
          registration_time: string
          sample_collection_time: string
          discount: number
          hospital_name: string
          payment_mode: string
          blood_tests: any
          amount_remaining: number
        }
        Insert: {
          id?: number
          created_at?: string
          patient_id: number
          amount_paid?: number
          visit_type: string
          registration_time?: string
          sample_collection_time?: string
          discount?: number
          hospital_name?: string
          payment_mode?: string
          blood_tests?: any
          amount_remaining?: number
        }
        Update: {
          id?: number
          created_at?: string
          patient_id?: number
          amount_paid?: number
          visit_type?: string
          registration_time?: string
          sample_collection_time?: string
          discount?: number
          hospital_name?: string
          payment_mode?: string
          blood_tests?: any
          amount_remaining?: number
        }
      }
    }
  }
}