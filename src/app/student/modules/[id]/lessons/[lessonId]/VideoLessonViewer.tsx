'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bgMain: '#090B10', bgCard: '#14171F', bgMid: '#1E2230', bgHover: '#1A1E28',
  txtPri: '#FFFFFF', txtSec: '#A1A7B3', border: 'rgba(255,255,255,0.06)',
  success: '#22C55E', warning: '#FBBF24', danger: '#EF4444', radius: '16px',
}

// ── YouTube IFrame API helpers ─────────────────────────────────────────────────
function parseYouTubeId(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}
function isSharePoint(url: string) {
  return url?.includes('sharepoint.com') || url?.includes('microsoftstream.com') || url?.includes('microsoft.com')
}
function isDirectVideo(url: string) {
  return url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) != null
}

// ── Format seconds to mm:ss ────────────────────────────────────────────────────
function fmt(s: number) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Parse transcript lines ─────────────────────────────────────────────────────
interface TranscriptLine { time: number | null; text: string }
function parseTranscript(raw: string): TranscriptLine[] {
  if (!raw?.trim()) return []
  return raw.split('\n').map(line => {
    const m = line.match(/^(\d+):(\d{2})\s+(.+)$/)
    if (m) return { time: parseInt(m[1]) * 60 + parseInt(m[2]), text: m[3] }
    return { time: null, text: line }
  }).filter(l => l.text.trim())
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VideoLessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]
}) {
  const supabase = createClient()
  const accent   = '#185FA5'

  // ── Video state ───────────────────────────────────────────────────────────
  const ytId         = parseYouTubeId(lesson.video_url ?? '')
  const isSP         = isSharePoint(lesson.video_url ?? '')
  const isDirect     = isDirectVideo(lesson.video_url ?? '')
  const playerRef    = useRef<HTMLDivElement>(null)
  const ytPlayerRef  = useRef<any>(null)
  const videoRef     = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying]     = useState(false)
  const [muted, setMuted]         = useState(false)
  const [volume, setVolume]       = useState(100)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [ytReady, setYtReady]     = useState(false)
  const controlsTimer             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimer             = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef              = useRef<HTMLDivElement>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState<'transcript' | 'notes' | 'qa'>('transcript')
  const [notes, setNotes]           = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [qa, setQa]                 = useState<any[]>([])
  const [qaText, setQaText]         = useState('')
  const [qaPosting, setQaPosting]   = useState(false)
  const [status, setStatus]         = useState(completionStatus)
  const [completing, setCompleting] = useState(false)
  const transcriptLines             = parseTranscript(lesson.transcript ?? '')
  const activeLineRef               = useRef<HTMLDivElement>(null)
  const completedSet                = new Set(completedIds)

  // ── Load YouTube IFrame API ────────────────────────────────────────────────
  useEffect(() => {
    if (!ytId) return
    const w = window as any
    const initPlayer = () => {
      if (!playerRef.current) return
      ytPlayerRef.current = new w.YT.Player(playerRef.current, {
        videoId: ytId,
        playerVars: { controls: 0, disablekb: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            setYtReady(true)
            setDuration(ytPlayerRef.current.getDuration())
          },
          onStateChange: (e: any) => {
            setPlaying(e.data === 1)
            if (e.data === 0) { setPlaying(false); setCurrentTime(ytPlayerRef.current?.getDuration() ?? 0) }
          },
        },
      })
    }
    if (w.YT?.Player) { initPlayer(); return }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScript = document.getElementsByTagName('script')[0]
    firstScript.parentNode?.insertBefore(tag, firstScript)
    w.onYouTubeIframeAPIReady = initPlayer
  }, [ytId])

  // ── Progress polling for YouTube ──────────────────────────────────────────
  useEffect(() => {
    if (!ytId) return
    progressTimer.current = setInterval(() => {
      if (ytPlayerRef.current?.getCurrentTime) {
        const ct = ytPlayerRef.current.getCurrentTime()
        const dur = ytPlayerRef.current.getDuration()
        setCurrentTime(ct); setDuration(dur)
      }
    }, 500)
    return () => { if (progressTimer.current) clearInterval(progressTimer.current) }
  }, [ytId])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  function resetControlsTimer() {
    setShowControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => { if (playing) setShowControls(false) }, 3000)
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function togglePlay() {
    if (ytId && ytPlayerRef.current) {
      playing ? ytPlayerRef.current.pauseVideo() : ytPlayerRef.current.playVideo()
    } else if (videoRef.current) {
      playing ? videoRef.current.pause() : videoRef.current.play()
    }
    setPlaying(p => !p); resetControlsTimer()
  }
  function seek(pct: number) {
    const t = pct * duration
    if (ytId && ytPlayerRef.current) ytPlayerRef.current.seekTo(t, true)
    else if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }
  function seekTo(t: number) {
    if (ytId && ytPlayerRef.current) ytPlayerRef.current.seekTo(t, true)
    else if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }
  function toggleMute() {{
    const newMuted = !muted
    setMuted(newMuted)
    if (ytId && ytPlayerRef.current) { newMuted ? ytPlayerRef.current.mute() : ytPlayerRef.current.unMute() }
    else if (videoRef.current) { videoRef.current.muted = newMuted }
  }}
  function changeVolume(v: number) {
    setVolume(v)
    if (ytId && ytPlayerRef.current) ytPlayerRef.current.setVolume(v)
    else if (videoRef.current) videoRef.current.volume = v / 100
  }
  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setFullscreen(true) }
    else { document.exitFullscreen?.(); setFullscreen(false) }
  }
  function skip(secs: number) { seekTo(Math.max(0, Math.min(duration, currentTime + secs)) ) }

  // ── Load notes ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('lesson_progress').select('notes').eq('student_id', studentId).eq('lesson_id', lesson.id).maybeSingle()
      .then(({ data }) => { if (data?.notes) setNotes(data.notes) })
  }, [])

  // ── Save notes ────────────────────────────────────────────────────────────
  const saveNotes = useCallback(async () => {
    setNotesSaving(true)
    await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id, notes, status: status === 'none' ? 'completed' : status } as any)
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000)
  }, [notes, status, studentId, lesson.id])

  // ── Load Q&A ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('lesson_progress').select('id,notes,student_id,profiles(full_name,avatar_url)').eq('lesson_id', lesson.id).not('notes', 'is', null).neq('notes', '')
      .then(({ data }) => setQa((data ?? []).filter((r: any) => r.notes?.startsWith('[Q]')).map((r: any) => ({ ...r, text: r.notes.slice(3) }))))
  }, [])

  async function postQuestion() {
    if (!qaText.trim()) return
    setQaPosting(true)
    await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id, notes: '[Q]' + qaText.trim(), status: status === 'none' ? 'completed' : status } as any)
    setQa(prev => [...prev, { student_id: studentId, text: qaText.trim(), profiles: null }])
    setQaText(''); setQaPosting(false)
  }

  // ── Mark complete ─────────────────────────────────────────────────────────
  async function markComplete() {
    setCompleting(true)
    await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id, status: 'completed' } as any)
    setStatus('completed')
    // Navigate to next lesson
    const idx = allLessons.findIndex(l => l.id === lesson.id)
    const next = allLessons[idx + 1]
    if (next) window.location.href = `/student/modules/${moduleId}/lessons/${next.id}`
    else window.location.href = `/student/modules/${moduleId}`
    setCompleting(false)
  }

  // ── Active transcript line ─────────────────────────────────────────────────
  const activeLineIdx = transcriptLines.reduce((best, line, i) => {
    if (line.time !== null && line.time <= currentTime) return i
    return best
  }, -1)
  useEffect(() => { activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [activeLineIdx])

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .vl-tab { transition: all .15s; cursor: pointer; }
        .vl-tab:hover { color: #fff !important; }
        .vl-lesson:hover { background: rgba(255,255,255,.05) !important; }
        .vl-ctrl-btn { background: none; border: none; cursor: pointer; color: #fff; padding: 6px 8px; border-radius: 6px; transition: background .12s; display: flex; align-items: center; justify-content: center; }
        .vl-ctrl-btn:hover { background: rgba(255,255,255,.15); }
        input[type=range] { -webkit-appearance: none; height: 4px; background: rgba(255,255,255,.2); border-radius: 2px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; background: #fff; border-radius: 50%; }
        input[type=range]:hover { background: rgba(255,255,255,.35); }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ minHeight: '100vh', background: D.bgMain, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0 }}>

        {/* ══ MAIN ══════════════════════════════════════════════════════════ */}
        <div style={{ padding: '28px 24px 40px', minWidth: 0, overflowX: 'hidden' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 12, color: D.txtSec }}>
            <a href={`/student/modules/${moduleId}`} style={{ color: D.txtSec, textDecoration: 'none' }}>← {lesson.module_title}</a>
            <span>/</span>
            <span style={{ color: D.txtPri }}>🎬 {lesson.title}</span>
          </div>

          {/* Title + meta */}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, marginBottom: 6 }}>{lesson.title}</h1>
          {(lesson.video_author || lesson.description) && (
            <div style={{ marginBottom: 18 }}>
              {lesson.video_author && <div style={{ fontSize: 13, color: D.txtSec, marginBottom: 4 }}>👤 {lesson.video_author}</div>}
              {lesson.description && <div style={{ fontSize: 13, color: D.txtSec, lineHeight: 1.6 }}>{lesson.description}</div>}
            </div>
          )}

          {/* ── Video player ── */}
          <div ref={containerRef}
            style={{ position: 'relative', background: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 20, aspectRatio: '16/9', userSelect: 'none' }}
            onMouseMove={resetControlsTimer}
            onMouseLeave={() => { if (playing) setShowControls(false) }}
            onClick={ytId || isDirect ? togglePlay : undefined}>

            {/* YouTube player container */}
            {ytId && <div ref={playerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />}

            {/* SharePoint embed */}
            {isSP && <iframe src={lesson.video_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen />}

            {/* Direct video */}
            {isDirect && (
              <video ref={videoRef} src={lesson.video_url}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                onTimeUpdate={() => { if (videoRef.current) { setCurrentTime(videoRef.current.currentTime); setDuration(videoRef.current.duration) } }}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration) }} />
            )}

            {/* Loading state for YouTube */}
            {ytId && !ytReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
              </div>
            )}

            {/* Custom controls overlay — shown for YouTube and direct video */}
            {(ytId || isDirect) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: showControls ? 'linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 50%)' : 'transparent', transition: 'background .3s', opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity .3s' as any }}>

                {/* Big play button in center */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  {!playing && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: '2px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                      ▶
                    </div>
                  )}
                </div>

                {/* Bottom controls bar */}
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }} onClick={e => e.stopPropagation()}>
                  {/* Progress bar */}
                  <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,.25)', borderRadius: 2, cursor: 'pointer' }}
                    onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); seek((e.clientX - rect.left) / rect.width) }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 2, transition: 'width .5s linear', position: 'relative' }}>
                      <div style={{ position: 'absolute', right: -5, top: -4, width: 12, height: 12, background: '#fff', borderRadius: '50%' }} />
                    </div>
                  </div>
                  {/* Controls row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className="vl-ctrl-btn" onClick={togglePlay} style={{ fontSize: 16 }}>{playing ? '⏸' : '▶'}</button>
                    <button className="vl-ctrl-btn" onClick={() => skip(-10)} title="−10s" style={{ fontSize: 13 }}>⏪</button>
                    <button className="vl-ctrl-btn" onClick={() => skip(10)} title="+10s" style={{ fontSize: 13 }}>⏩</button>
                    <button className="vl-ctrl-btn" onClick={toggleMute} style={{ fontSize: 14 }}>{muted ? '🔇' : volume > 50 ? '🔊' : '🔉'}</button>
                    <input type="range" min={0} max={100} value={muted ? 0 : volume}
                      onChange={e => { setMuted(false); changeVolume(Number(e.target.value)) }}
                      style={{ width: 70 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginLeft: 6 }}>{fmt(currentTime)} / {fmt(duration)}</span>
                    <div style={{ flex: 1 }} />
                    <button className="vl-ctrl-btn" onClick={toggleFullscreen} title="Celá obrazovka" style={{ fontSize: 16 }}>⛶</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${D.border}`, marginBottom: 16 }}>
            {([
              { id: 'transcript', label: '📝 Transcript' },
              { id: 'notes', label: '🗒 Poznámky' },
              { id: 'qa', label: `💬 Q&A${qa.length > 0 ? ` (${qa.length})` : ''}` },
            ] as const).map(tab => (
              <button key={tab.id} className="vl-tab" onClick={() => setActiveTab(tab.id)}
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400, color: activeTab === tab.id ? '#fff' : D.txtSec, borderBottom: `2px solid ${activeTab === tab.id ? accent : 'transparent'}`, border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s' }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Transcript tab */}
          {activeTab === 'transcript' && (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {transcriptLines.length === 0
                ? <div style={{ color: D.txtSec, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                    Žádný transcript není k dispozici pro tuto lekci.
                  </div>
                : transcriptLines.map((line, i) => (
                    <div key={i}
                      ref={i === activeLineIdx ? activeLineRef : undefined}
                      onClick={() => line.time !== null && seekTo(line.time)}
                      style={{ display: 'flex', gap: 12, padding: '6px 10px', borderRadius: 8, background: i === activeLineIdx ? accent + '20' : 'transparent', cursor: line.time !== null ? 'pointer' : 'default', transition: 'background .2s' }}>
                      {line.time !== null && (
                        <span style={{ fontSize: 11, color: i === activeLineIdx ? accent : D.txtSec, fontFamily: 'monospace', flexShrink: 0, paddingTop: 2, fontWeight: i === activeLineIdx ? 700 : 400 }}>
                          {fmt(line.time)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: i === activeLineIdx ? D.txtPri : D.txtSec, lineHeight: 1.6 }}>{line.text}</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Notes tab */}
          {activeTab === 'notes' && (
            <div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={10}
                placeholder="Pište si poznámky k lekci… ukládají se do vašeho profilu."
                style={{ width: '100%', padding: '13px 15px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 12, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.7 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button onClick={saveNotes} disabled={notesSaving}
                  style={{ padding: '8px 18px', background: accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {notesSaving ? 'Ukládám…' : '💾 Uložit poznámky'}
                </button>
                {notesSaved && <span style={{ fontSize: 12, color: D.success }}>✓ Uloženo</span>}
              </div>
            </div>
          )}

          {/* Q&A tab */}
          {activeTab === 'qa' && (
            <div>
              {qa.length === 0 && <div style={{ fontSize: 13, color: D.txtSec, marginBottom: 16 }}>Zatím žádné otázky. Buď první!</div>}
              {qa.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>?</div>
                  <div>
                    <div style={{ fontSize: 12, color: D.txtSec, marginBottom: 3 }}>{q.profiles?.full_name ?? 'Student'}</div>
                    <div style={{ fontSize: 13, color: D.txtPri }}>{q.text}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <input value={qaText} onChange={e => setQaText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && postQuestion()}
                  placeholder="Napište otázku k lekci…"
                  style={{ flex: 1, padding: '10px 13px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none' }} />
                <button onClick={postQuestion} disabled={qaPosting || !qaText.trim()}
                  style={{ padding: '10px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Odeslat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
        <div style={{ borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'sticky', top: 0 }}>
          {/* Module title */}
          <div style={{ padding: '20px 18px 14px', borderBottom: `1px solid ${D.border}` }}>
            <a href={`/student/modules/${moduleId}`} style={{ fontSize: 11, color: D.txtSec, textDecoration: 'none', display: 'block', marginBottom: 6 }}>← Zpět na modul</a>
            <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri }}>{lesson.module_title}</div>
            <div style={{ fontSize: 11, color: D.txtSec, marginTop: 3 }}>
              {allLessons.length} {allLessons.length === 1 ? 'lekce' : allLessons.length < 5 ? 'lekce' : 'lekcí'}
            </div>
          </div>

          {/* Lesson list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {allLessons.map((l, i) => {
              const isActive = l.id === lesson.id
              const isDone = completedSet.has(l.id) || (isActive && status === 'completed')
              const isVideo = l.lesson_type === 'video'
              return (
                <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`}
                  className="vl-lesson"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', textDecoration: 'none', background: isActive ? accent + '15' : 'transparent', borderLeft: isActive ? `3px solid ${accent}` : '3px solid transparent', transition: 'all .15s' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: isDone ? D.success + '20' : isActive ? accent + '20' : 'rgba(255,255,255,.06)', color: isDone ? D.success : isActive ? accent : D.txtSec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {isDone ? '✓' : isVideo ? '🎬' : i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: isActive ? D.txtPri : D.txtSec, fontWeight: isActive ? 600 : 400, lineHeight: 1.4, flex: 1 }}>{l.title}</span>
                </a>
              )
            })}
          </div>

          {/* Complete button */}
          <div style={{ padding: '16px 18px', borderTop: `1px solid ${D.border}` }}>
            {status === 'completed'
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: D.success + '15', border: `1px solid ${D.success}30`, borderRadius: 10, color: D.success, fontSize: 13, fontWeight: 600 }}>
                  <span>✓</span> Lekce dokončena
                </div>
              : <button onClick={markComplete} disabled={completing}
                  style={{ width: '100%', padding: '12px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: completing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: completing ? .7 : 1 }}>
                  {completing ? '…' : 'Dokončit a pokračovat →'}
                </button>
            }
          </div>
        </div>

      </div>
    </>
  )
}
