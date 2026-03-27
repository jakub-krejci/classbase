import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, system } = await req.json()

  // Convert messages to Gemini format (combine system into first user message)
  const geminiMessages = messages.map((m: any, i: number) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: i === 0 ? `${system}\n\n---\n\n${m.content}` : m.content }],
  }))

  const apiKey = process.env.GEMINI_API_KEY ?? ''
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: geminiMessages }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('Gemini API error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return NextResponse.json({ text })
}
