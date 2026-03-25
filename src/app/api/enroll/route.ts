import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// POST /api/enroll
// Body: { access_code: string, password?: string }
// Looks up module by access code (bypassing RLS) and enrolls the current user
export async function POST(request: NextRequest) {
  try {
    const { access_code, password } = await request.json()
    if (!access_code) {
      return NextResponse.json({ error: 'Access code is required.' }, { status: 400 })
    }

    // Get current user from session
    const cookieStore = await cookies()
    const { createServerClient: createSSR } = await import('@supabase/ssr')
    const supabase = createSSR(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* ignore */ }
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    // Use admin client to look up module (bypasses RLS)
    const admin = createAdminClient()
    const { data: mod, error: modErr } = await admin
      .from('modules')
      .select('id, title, enrollment_password')
      .eq('access_code', access_code.trim().toUpperCase())
      .single()

    if (modErr || !mod) {
      return NextResponse.json({ error: 'Access code not found. Double-check the code your teacher gave you.' }, { status: 404 })
    }

    // Check enrollment password if set
    const m = mod as any
    if (m.enrollment_password && m.enrollment_password !== (password ?? '').trim()) {
      return NextResponse.json({ error: 'Incorrect enrollment password.', needsPassword: true, moduleTitle: m.title }, { status: 403 })
    }

    // Enroll student
    const { error: enrollErr } = await admin
      .from('enrollments')
      .insert({ student_id: user.id, module_id: m.id })

    if (enrollErr?.code === '23505') {
      return NextResponse.json({ error: 'You are already enrolled in this module.' }, { status: 409 })
    }
    if (enrollErr) {
      return NextResponse.json({ error: enrollErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, moduleTitle: m.title, moduleId: m.id, needsPassword: !!m.enrollment_password && !password })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 })
  }
}
