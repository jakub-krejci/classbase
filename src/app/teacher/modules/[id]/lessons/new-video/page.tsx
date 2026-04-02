'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const D = {
  bgMain: '#090B10', bgCard: '#14171F', bgMid: '#1E2230',
  txtPri: '#FFFFFF', txtSec: '#A1A7B3', border: 'rgba(255,255,255,0.06)',
  danger: '#EF4444', success: '#22C55E', warning: '#FBBF24',
  radius: '16px',
}

function parseVideoId(url: string): { type: 'youtube' | 'sharepoint' | 'direct' | null; id?: string } {
  if (!url) return { type: null }
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] }
  if (url.includes('sharepoint.com') || url.includes('microsoftstream.com') || url.includes('microsoft.com'))
    return { type: 'sharepoint' }
  if (url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i))
    return { type: 'direct' }
  return { type: null }
}

function VideoPreview({ url }: { url: string }) {
  const parsed = parseVideoId(url)
  if (!parsed.type) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, background: '#1a1a2e', borderRadius: 12, color: D.txtSec, fontSize: 13 }}>
      Zadej platnou URL videa pro náhled
    </div>
  )
  if (parsed.type === 'youtube') return (
    <iframe
      src={`https://www.youtube.com/embed/${parsed.id}`}
      style={{ width: '100%', height: 300, borderRadius: 12, border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen />
  )
  if (parsed.type === 'sharepoint') return (
    <iframe src={url} style={{ width: '100%', height: 300, borderRadius: 12, border: 'none' }} allowFullScreen />
  )
  if (parsed.type === 'direct') return (
    <video src={url} controls style={{ width: '100%', borderRadius: 12, maxHeight: 300 }} />
  )
  return null
}

export default function NewVideoLessonPage() {
  const params = useParams() as any
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle]       = useState('')
  const [author, setAuthor]     = useState('')
  const [desc, setDesc]         = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [maxPos, setMaxPos]     = useState(0)

  // Load max position for this module
  useEffect(() => {
    supabase.from('lessons').select('position').eq('module_id', params.id).order('position', { ascending: false }).limit(1)
      .then(({ data }) => setMaxPos((data?.[0]?.position ?? -1) + 1))
  }, [params.id])

  async function save() {
    if (!title.trim()) { setError('Název lekce je povinný'); return }
    if (!videoUrl.trim()) { setError('URL videa je povinná'); return }
    const parsed = parseVideoId(videoUrl)
    if (!parsed.type) { setError('Nepodporovaná URL videa. Zadej YouTube, SharePoint nebo přímý odkaz na MP4.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('lessons').insert({
      module_id:    params.id,
      title:        title.trim(),
      content_html: '',
      lesson_type:  'video',
      video_url:    videoUrl.trim(),
      video_author: author.trim() || null,
      description:  desc.trim() || null,
      transcript:   transcript.trim() || null,
      position:     maxPos,
    } as any).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/teacher/modules/${params.id}`)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color .2s' }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: D.txtSec, display: 'block', marginBottom: 6 }
  const parsed = parseVideoId(videoUrl)
  const videoTypeLabel = parsed.type === 'youtube' ? '✓ YouTube' : parsed.type === 'sharepoint' ? '✓ SharePoint / Microsoft' : parsed.type === 'direct' ? '✓ Přímé video' : ''

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        input:focus, textarea:focus { border-color: rgba(24,95,165,.7) !important; }
        textarea { resize: vertical; }
      `}</style>

      <div style={{ minHeight: '100vh', background: D.bgMain, padding: '32px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <a href={`/teacher/modules/${params.id}`} style={{ color: D.txtSec, textDecoration: 'none', fontSize: 20 }}>←</a>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#185FA515', border: '1px solid #185FA530', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎬</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: D.txtPri, margin: 0 }}>Nová video lekce</h1>
              <p style={{ fontSize: 12, color: D.txtSec, margin: 0 }}>YouTube · SharePoint · MP4</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>

            {/* Title */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '20px 22px' }}>
              <span style={label}>Název lekce *</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="např. Úvod do proměnných v Pythonu"
                style={inp} />
            </div>

            {/* Video URL */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '20px 22px' }}>
              <span style={label}>URL videa *</span>
              <div style={{ position: 'relative' }}>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... nebo SharePoint odkaz"
                  style={{ ...inp, paddingRight: videoTypeLabel ? 140 : 14 }} />
                {videoTypeLabel && (
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: D.success, fontWeight: 700, pointerEvents: 'none' }}>
                    {videoTypeLabel}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: D.txtSec, marginTop: 7 }}>
                Podporováno: YouTube (youtube.com/watch, youtu.be), SharePoint/Microsoft Stream, přímý odkaz na .mp4
              </p>

              {/* Live preview */}
              {videoUrl && parsed.type && (
                <div style={{ marginTop: 14 }}>
                  <span style={{ ...label, marginBottom: 8 }}>Náhled</span>
                  <VideoPreview url={videoUrl} />
                </div>
              )}
            </div>

            {/* Author + description */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '20px 22px', display: 'grid', gap: 14 }}>
              <div>
                <span style={label}>Autor / Přednášející</span>
                <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="např. Jan Novák"
                  style={inp} />
              </div>
              <div>
                <span style={label}>Popis</span>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  placeholder="Krátký popis obsahu lekce…"
                  style={{ ...inp, lineHeight: 1.6 }} />
              </div>
            </div>

            {/* Transcript */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={label}>Transcript (volitelné)</span>
                <span style={{ fontSize: 10, color: D.txtSec, padding: '2px 8px', background: D.bgMid, borderRadius: 10, border: `1px solid ${D.border}` }}>
                  YouTube Studio → Titulky → Stáhnout .txt
                </span>
              </div>
              <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={8}
                placeholder={'0:00 Úvod do tématu\n0:45 Co je to proměnná\n2:10 Příklady v Pythonu\n...'}
                style={{ ...inp, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }} />
              <p style={{ fontSize: 11, color: D.txtSec, marginTop: 7 }}>
                Vložte text s časovými značkami nebo prostý text. Zobrazí se studentům vedle videa.
              </p>
            </div>

            {/* Error + Save */}
            {error && (
              <div style={{ padding: '12px 16px', background: `${D.danger}15`, border: `1px solid ${D.danger}40`, borderRadius: 10, color: D.danger, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} disabled={saving || !title.trim() || !videoUrl.trim()}
                style={{ flex: 1, padding: '13px', background: saving || !title.trim() || !videoUrl.trim() ? 'rgba(24,95,165,.4)' : '#185FA5', color: '#fff', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: saving || !title.trim() || !videoUrl.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Ukládám…' : '🎬 Uložit video lekci'}
              </button>
              <a href={`/teacher/modules/${params.id}`}
                style={{ padding: '13px 20px', background: D.bgCard, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 11, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                Zrušit
              </a>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
