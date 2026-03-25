// Permissive database types to prevent TypeScript 'never' errors on Supabase operations.
// Replace with generated types once the project is stable:
// npx supabase gen types typescript --project-id YOUR_ID > src/types/database.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any

export interface Database {
  public: {
    Tables: {
      profiles:        { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      modules:         { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      lessons:         { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      assignments:     { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      enrollments:     { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      lesson_progress: { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      submissions:     { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      groups:          { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      group_members:   { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
      messages:        { Row: AnyRow; Insert: AnyRow; Update: AnyRow; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
