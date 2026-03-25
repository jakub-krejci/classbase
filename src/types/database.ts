// Loose database types — strict types are generated via:
// npx supabase gen types typescript --project-id YOUR_ID > src/types/database.ts
// For now we use permissive Record types to avoid build errors while developing.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

type Row = Record<string, any>

export interface Database {
  public: {
    Tables: {
      profiles:        { Row: Row; Insert: Row; Update: Row }
      modules:         { Row: Row; Insert: Row; Update: Row }
      lessons:         { Row: Row; Insert: Row; Update: Row }
      assignments:     { Row: Row; Insert: Row; Update: Row }
      enrollments:     { Row: Row; Insert: Row; Update: Row }
      lesson_progress: { Row: Row; Insert: Row; Update: Row }
      submissions:     { Row: Row; Insert: Row; Update: Row }
      groups:          { Row: Row; Insert: Row; Update: Row }
      group_members:   { Row: Row; Insert: Row; Update: Row }
      messages:        { Row: Row; Insert: Row; Update: Row }
    }
  }
}
