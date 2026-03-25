export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'teacher' | 'student'
          full_name: string
          email: string
          subject_specialty: string | null
          bio: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      modules: {
        Row: {
          id: string
          teacher_id: string
          title: string
          description: string | null
          tag: string
          access_code: string
          unlock_mode: 'all' | 'sequential'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['modules']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['modules']['Insert']>
      }
      lessons: {
        Row: {
          id: string
          module_id: string
          title: string
          content_html: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['lessons']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['lessons']['Insert']>
      }
      assignments: {
        Row: {
          id: string
          module_id: string
          lesson_id: string | null
          title: string
          type: 'quiz' | 'test' | 'homework'
          instructions: string | null
          deadline: string | null
          questions: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['assignments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['assignments']['Insert']>
      }
      enrollments: {
        Row: {
          id: string
          student_id: string
          module_id: string
          enrolled_at: string
        }
        Insert: Omit<Database['public']['Tables']['enrollments']['Row'], 'id' | 'enrolled_at'>
        Update: never
      }
      lesson_progress: {
        Row: {
          id: string
          student_id: string
          lesson_id: string
          completed_at: string
        }
        Insert: Omit<Database['public']['Tables']['lesson_progress']['Row'], 'id' | 'completed_at'>
        Update: never
      }
      submissions: {
        Row: {
          id: string
          student_id: string
          assignment_id: string
          answers: Json
          file_url: string | null
          auto_score: number | null
          teacher_score: number | null
          teacher_feedback: string | null
          status: 'submitted' | 'graded'
          submitted_at: string
          graded_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['submissions']['Row'], 'id' | 'submitted_at' | 'graded_at'>
        Update: Partial<Database['public']['Tables']['submissions']['Insert']>
      }
      groups: {
        Row: {
          id: string
          teacher_id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['groups']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['groups']['Insert']>
      }
      group_members: {
        Row: { group_id: string; student_id: string }
        Insert: Database['public']['Tables']['group_members']['Row']
        Update: never
      }
      messages: {
        Row: {
          id: string
          sender_id: string
          recipient_type: 'all' | 'group' | 'student'
          recipient_id: string | null
          body: string
          read_by: string[]
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at' | 'read_by'>
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
    }
  }
}
