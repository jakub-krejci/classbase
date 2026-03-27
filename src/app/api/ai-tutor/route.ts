import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, system } = await req.json()

  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://classbase.app',
      'X-Title': 'ClassBase AI Tutor',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-8b-instruct:free',
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('OpenRouter API error:', res.status, err)
    return NextResponse.json({ error: `OpenRouter error ${res.status}: ${err}` }, { status: 500 })
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) {
    console.error('OpenRouter returned no text:', JSON.stringify(data))
    return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
  }
  return NextResponse.json({ text })
}
