'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Helpers ───────────────────────────────────────────────────────────────────
function ytEmbedUrl(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1` : null
}
function isSP(url: string) { return !!(url?.includes('sharepoint.com') || url?.includes('microsoftstream.com')) }
function isDirect(url: string) { return !!(url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) }

interface TranscriptLine { time: number | null; text: string }
function parseTranscript(raw: string): TranscriptLine[] {
  if (!raw?.trim()) return []
  return raw.split('\n').map(line => {
    const m = line.match(/^(\d+):(\d{2})\s+(.+)$/)
    if (m) return { time: parseInt(m[1]) * 60 + parseInt(m[2]), text: m[3] }
    return { time: null, text: line }
  }).filter(l => l.text.trim())
}
function fmt(s: number) {
  if (!isFinite(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

interface QARow { id: string; student_id: string; question: string; created_at: string; profiles: any }

function Avatar({ src, name, size = 30, accent = '#7C3AED' }: { src?: string; name: string; size?: number; accent?: string }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
  return <div style={{ width:size, height:size, borderRadius:'50%', background:accent+'30', color:accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.34, fontWeight:700, flexShrink:0 }}>{ini}</div>
}

export default function VideoLessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, profile }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]
  profile: any
}) {
  const supabase   = createClient()
  const accent     = profile?.accent_color ?? '#185FA5'
  const ytUrl      = ytEmbedUrl(lesson.video_url ?? '')
  const videoRef   = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const [activeTab, setActiveTab]     = useState<'transcript'|'notes'|'qa'>('transcript')
  const [notes, setNotes]             = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved]   = useState(false)
  const [status, setStatus]           = useState(completionStatus)
  const [completing, setCompleting]   = useState(false)

  // Q&A — now using lesson_qa table
  const [qaRows, setQaRows]     = useState<QARow[]>([])
  const [qaLoading, setQaLoading] = useState(true)
  const [qaText, setQaText]     = useState('')
  const [qaPosting, setQaPosting] = useState(false)

  const transcriptLines = parseTranscript(lesson.transcript ?? '')
  const completedSet    = new Set(completedIds)
  const activeLineRef   = useRef<HTMLDivElement>(null)
  const activeLineIdx   = transcriptLines.reduce((best, line, i) =>
    (line.time !== null && line.time <= currentTime) ? i : best, -1)
  useEffect(() => { activeLineRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }) }, [activeLineIdx])

  // ── Load notes (from lesson_progress, separate from Q&A) ──────────────────
  useEffect(() => {
    supabase.from('lesson_progress')
      .select('notes')
      .eq('student_id', studentId)
      .eq('lesson_id', lesson.id)
      .maybeSingle()
      .then(({ data }) => { if (data?.notes) setNotes(data.notes) })
  }, [lesson.id, studentId])

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveNotes = useCallback(async () => {
    setNotesSaving(true)
    await supabase.from('lesson_progress').upsert(
      { student_id: studentId, lesson_id: lesson.id, notes, status: status === 'none' ? 'completed' : status } as any,
      { onConflict: 'student_id,lesson_id' }
    )
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000)
  }, [notes, status, studentId, lesson.id])

  // ── Load Q&A from lesson_qa table ─────────────────────────────────────────
  useEffect(() => { loadQA() }, [lesson.id])

  async function loadQA() {
    setQaLoading(true)
    const { data } = await supabase
      .from('lesson_qa')
      .select('id, student_id, question, created_at, profiles(full_name, avatar_url, accent_color)')
      .eq('lesson_id', lesson.id)
      .order('created_at', { ascending: false })
    setQaRows((data ?? []) as QARow[])
    setQaLoading(false)
  }

  // ── Post question ──────────────────────────────────────────────────────────
  async function postQuestion() {
    if (!qaText.trim()) return
    setQaPosting(true)
    const { data, error } = await supabase
      .from('lesson_qa')
      .insert({ lesson_id: lesson.id, student_id: studentId, question: qaText.trim() } as any)
      .select('id, student_id, question, created_at, profiles(full_name, avatar_url, accent_color)')
      .single()
    if (!error && data) {
      setQaRows(prev => [data as QARow, ...prev])
      setQaText('')
    }
    setQaPosting(false)
  }

  // ── Delete own question ────────────────────────────────────────────────────
  async function deleteQuestion(id: string) {
    await supabase.from('lesson_qa').delete().eq('id', id)
    setQaRows(prev => prev.filter(r => r.id !== id))
  }

  // ── Mark complete / undo ───────────────────────────────────────────────────
  async function toggleComplete() {
    setCompleting(true)
    const newStatus = status === 'completed' ? 'bookmark' : 'completed'
    await supabase.from('lesson_progress').upsert(
      { student_id: studentId, lesson_id: lesson.id, status: newStatus } as any,
      { onConflict: 'student_id,lesson_id' }
    )
    setStatus(newStatus)
    if (newStatus === 'completed') {
      const idx  = allLessons.findIndex(l => l.id === lesson.id)
      const next = allLessons[idx + 1]
      if (next && !next.locked) window.location.href = `/student/modules/${moduleId}/lessons/${next.id}`
      else window.location.href = `/student/modules/${moduleId}`
    }
    setCompleting(false)
  }

  const tabBtn = (id: 'transcript'|'notes'|'qa', label: string) => (
    <button onClick={() => setActiveTab(id)}
      style={{ padding:'10px 18px', fontSize:13, fontWeight: activeTab===id ? 700 : 400, color: activeTab===id ? D.txtPri : D.txtSec, borderBottom:`2px solid ${activeTab===id ? accent : 'transparent'}`, border:'none', background:'none', fontFamily:'inherit', cursor:'pointer', marginBottom:-1, transition:'all .15s' }}>
      {label}
    </button>
  )

  return (
    <DarkLayout profile={profile} activeRoute="/student/modules">
      <style>{`
        .vl-lesson { text-decoration:none; display:flex; align-items:center; gap:10px; padding:10px 16px; transition:background .12s; }
        .vl-lesson:hover { background:rgba(255,255,255,.05) !important; }
      `}</style>

      {/* Page uses full-width layout: no extra padding, we control it */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 272px', gap:20, alignItems:'start', marginTop:-8 }}>

        {/* ══ MAIN ══ */}
        <div style={{ minWidth:0 }}>

          {/* Breadcrumb */}
          <div style={{ fontSize:12, color:D.txtSec, marginBottom:12, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <a href="/student/modules" style={{ color:D.txtSec, textDecoration:'none' }}>Moduly</a>
            <span>/</span>
            <a href={`/student/modules/${moduleId}`} style={{ color:D.txtSec, textDecoration:'none' }}>{lesson.module_title}</a>
            <span>/</span>
            <span style={{ color:D.txtPri }}>🎬 {lesson.title}</span>
          </div>

          {/* Title */}
          <h1 style={{ fontSize:20, fontWeight:800, color:D.txtPri, marginBottom:6 }}>{lesson.title}</h1>
          {(lesson.video_author || lesson.description) && (
            <div style={{ fontSize:13, color:D.txtSec, marginBottom:12, display:'flex', gap:14, flexWrap:'wrap' }}>
              {lesson.video_author && <span>👤 {lesson.video_author}</span>}
              {lesson.description && <span>{lesson.description}</span>}
            </div>
          )}

          {/* ── VIDEO — full width, large ── */}
          <div style={{ background:'#000', borderRadius:14, overflow:'hidden', marginBottom:18, width:'100%', aspectRatio:'16/9' }}>
            {ytUrl && <iframe src={ytUrl} style={{ width:'100%', height:'100%', border:'none', display:'block' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />}
            {isSP(lesson.video_url??'') && <iframe src={lesson.video_url} style={{ width:'100%', height:'100%', border:'none', display:'block' }} allowFullScreen />}
            {isDirect(lesson.video_url??'') && <video ref={videoRef} src={lesson.video_url} controls style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} onTimeUpdate={() => { if(videoRef.current) setCurrentTime(videoRef.current.currentTime) }} />}
            {!ytUrl && !isSP(lesson.video_url??'') && !isDirect(lesson.video_url??'') && (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:D.txtSec }}>Nepodporovaný formát videa</div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:'flex', borderBottom:`1px solid ${D.border}`, marginBottom:16 }}>
            {tabBtn('transcript', '📝 Transcript')}
            {tabBtn('notes', '🗒 Poznámky')}
            {tabBtn('qa', `💬 Q&A${qaRows.length > 0 ? ` (${qaRows.length})` : ''}`)}
          </div>

          {/* Transcript */}
          {activeTab === 'transcript' && (
            <div style={{ maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:2 }}>
              {transcriptLines.length === 0
                ? <p style={{ color:D.txtSec, fontSize:13, textAlign:'center', padding:'20px 0' }}>Žádný transcript.</p>
                : transcriptLines.map((line, i) => (
                    <div key={i} ref={i===activeLineIdx ? activeLineRef : undefined}
                      style={{ display:'flex', gap:12, padding:'6px 10px', borderRadius:8, background: i===activeLineIdx ? accent+'20' : 'transparent', transition:'background .2s' }}>
                      {line.time!==null && <span style={{ fontSize:11, color: i===activeLineIdx ? accent : D.txtSec, fontFamily:'monospace', flexShrink:0, paddingTop:2 }}>{fmt(line.time)}</span>}
                      <span style={{ fontSize:13, color: i===activeLineIdx ? D.txtPri : D.txtSec, lineHeight:1.6 }}>{line.text}</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Notes */}
          {activeTab === 'notes' && (
            <div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={8} placeholder="Pište si poznámky…"
                style={{ width:'100%', padding:'12px 14px', background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:12, fontSize:13, color:D.txtPri, fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.7, boxSizing:'border-box' as const }} />
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
                <button onClick={saveNotes} disabled={notesSaving} style={{ padding:'8px 18px', background:accent, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {notesSaving ? 'Ukládám…' : '💾 Uložit'}
                </button>
                {notesSaved && <span style={{ fontSize:12, color:D.success }}>✓ Uloženo</span>}
              </div>
            </div>
          )}

          {/* Q&A */}
          {activeTab === 'qa' && (
            <div>
              {/* Post question */}
              <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'flex-start' }}>
                <Avatar src={profile?.avatar_url} name={profile?.full_name ?? 'Já'} size={34} accent={accent} />
                <div style={{ flex:1, display:'flex', gap:8 }}>
                  <input value={qaText} onChange={e => setQaText(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); postQuestion() } }}
                    placeholder="Napište otázku k lekci… (Enter = odeslat)"
                    style={{ flex:1, padding:'10px 13px', background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:10, fontSize:13, color:D.txtPri, fontFamily:'inherit', outline:'none' }} />
                  <button onClick={postQuestion} disabled={qaPosting || !qaText.trim()}
                    style={{ padding:'10px 16px', background:accent, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor: qaPosting||!qaText.trim() ? 'not-allowed' : 'pointer', fontFamily:'inherit', opacity: qaPosting||!qaText.trim() ? .5 : 1 }}>
                    Odeslat
                  </button>
                </div>
              </div>

              {/* Questions */}
              {qaLoading
                ? <p style={{ color:D.txtSec, fontSize:13, textAlign:'center' }}>Načítám…</p>
                : qaRows.length === 0
                  ? <p style={{ color:D.txtSec, fontSize:13, textAlign:'center' }}>Zatím žádné otázky.</p>
                  : qaRows.map(row => {
                      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
                      const isOwn = row.student_id === studentId
                      return (
                        <div key={row.id} style={{ display:'flex', gap:10, padding:'14px 16px', background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:12, marginBottom:10 }}>
                          <Avatar src={prof?.avatar_url} name={prof?.full_name ?? 'Student'} size={32} accent={prof?.accent_color ?? '#7C3AED'} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                              <span style={{ fontSize:13, fontWeight:600, color:D.txtPri }}>{prof?.full_name ?? 'Student'}</span>
                              <span style={{ fontSize:10, color:D.txtSec }}>{row.created_at ? new Date(row.created_at).toLocaleDateString('cs-CZ', { day:'numeric', month:'short' }) : ''}</span>
                              {isOwn && (
                                <button onClick={() => deleteQuestion(row.id)} style={{ marginLeft:'auto', padding:'1px 8px', background:'rgba(239,68,68,.12)', color:D.danger, border:'none', borderRadius:5, fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                                  Smazat
                                </button>
                              )}
                            </div>
                            <p style={{ fontSize:14, color:D.txtPri, lineHeight:1.6, margin:0 }}>{row.question}</p>
                          </div>
                        </div>
                      )
                    })
              }
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
        <div style={{ background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:16, overflow:'hidden', position:'sticky', top:20 }}>

          {/* Module header */}
          <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${D.border}` }}>
            <a href={`/student/modules/${moduleId}`} style={{ fontSize:11, color:D.txtSec, textDecoration:'none', display:'block', marginBottom:6 }}>← Zpět na modul</a>
            <div style={{ fontSize:14, fontWeight:700, color:D.txtPri }}>{lesson.module_title}</div>
            <div style={{ fontSize:11, color:D.txtSec, marginTop:2 }}>{allLessons.length} lekcí</div>
          </div>

          {/* Lesson list */}
          <div style={{ maxHeight:400, overflowY:'auto' }}>
            {allLessons.map((l, i) => {
              const isActive = l.id === lesson.id
              const isDone   = completedSet.has(l.id) || (isActive && status === 'completed')
              const isVid    = l.lesson_type === 'video'
              return (
                <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`} className="vl-lesson"
                  style={{ background: isActive ? accent+'15' : 'transparent', borderLeft:`3px solid ${isActive ? accent : 'transparent'}` }}>
                  <div style={{ width:24, height:24, borderRadius:'50%', background: isDone ? D.success+'20' : isActive ? accent+'20' : 'rgba(255,255,255,.06)', color: isDone ? D.success : isActive ? accent : D.txtSec, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {isDone ? '✓' : isVid ? '▶' : i+1}
                  </div>
                  <span style={{ fontSize:12, color: isActive ? D.txtPri : D.txtSec, fontWeight: isActive ? 600 : 400, flex:1, lineHeight:1.4 }}>{l.title}</span>
                </a>
              )
            })}
          </div>

          {/* Complete / undo button */}
          <div style={{ padding:'14px 16px', borderTop:`1px solid ${D.border}` }}>
            {status === 'completed'
              ? <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', background:D.success+'15', border:`1px solid ${D.success}30`, borderRadius:10, color:D.success, fontSize:13, fontWeight:600 }}>
                    <span>✓</span> Lekce dokončena
                  </div>
                  <button onClick={toggleComplete} disabled={completing}
                    style={{ padding:'7px', background:'transparent', color:D.txtSec, border:`1px solid ${D.border}`, borderRadius:8, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                    {completing ? '…' : '↩ Označit jako nedokončenou'}
                  </button>
                </div>
              : <button onClick={toggleComplete} disabled={completing}
                  style={{ width:'100%', padding:'12px', background:accent, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor: completing ? 'not-allowed' : 'pointer', fontFamily:'inherit', opacity: completing ? .7 : 1 }}>
                  {completing ? '…' : 'Dokončit a pokračovat →'}
                </button>
            }
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
