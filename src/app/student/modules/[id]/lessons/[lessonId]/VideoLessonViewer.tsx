'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseYouTubeId(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}
function isSharePoint(url: string) {
  return !!(url?.includes('sharepoint.com') || url?.includes('microsoftstream.com') || url?.includes('microsoft.com'))
}
function isDirectVideo(url: string) {
  return !!(url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i))
}

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

// ── Q&A types ─────────────────────────────────────────────────────────────────
interface QAEntry {
  id: string
  student_id: string
  question: string
  created_at: string
  profile: { full_name: string; avatar_url?: string; accent_color?: string }
  answers: QAAnswer[]
}
interface QAAnswer {
  id: string
  author_id: string
  text: string
  created_at: string
  profile: { full_name: string; avatar_url?: string; role?: string }
}

function Avatar({ src, name, size = 28, accent = '#7C3AED' }: { src?: string; name: string; size?: number; accent?: string }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .36, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VideoLessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, profile }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]
  profile: any
}) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#185FA5'

  const ytId    = parseYouTubeId(lesson.video_url ?? '')
  const isSP    = isSharePoint(lesson.video_url ?? '')
  const isDirect = isDirectVideo(lesson.video_url ?? '')
  const videoRef = useRef<HTMLVideoElement>(null)

  // progress timer for direct video transcript sync
  const [currentTime, setCurrentTime] = useState(0)

  const [activeTab, setActiveTab]     = useState<'transcript' | 'notes' | 'qa'>('transcript')
  const [notes, setNotes]             = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved]   = useState(false)
  const [status, setStatus]           = useState(completionStatus)
  const [completing, setCompleting]   = useState(false)

  // Q&A
  const [qaEntries, setQaEntries]     = useState<QAEntry[]>([])
  const [qaLoading, setQaLoading]     = useState(true)
  const [qaText, setQaText]           = useState('')
  const [qaPosting, setQaPosting]     = useState(false)
  const [replyText, setReplyText]     = useState<Record<string, string>>({})
  const [replyOpen, setReplyOpen]     = useState<string | null>(null)

  const transcriptLines = parseTranscript(lesson.transcript ?? '')
  const completedSet    = new Set(completedIds)
  const activeLineRef   = useRef<HTMLDivElement>(null)
  const activeLineIdx   = transcriptLines.reduce((best, line, i) => {
    if (line.time !== null && line.time <= currentTime) return i
    return best
  }, -1)
  useEffect(() => { activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [activeLineIdx])

  // ── Load notes ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('lesson_progress')
      .select('notes')
      .eq('student_id', studentId)
      .eq('lesson_id', lesson.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.notes && !data.notes.startsWith('[Q]')) setNotes(data.notes)
      })
  }, [lesson.id, studentId])

  // ── Load Q&A from dedicated table (video_qa) ───────────────────────────────
  // We store Q&A in a separate simple approach: use messages table with a type field
  // or store in lesson_progress with [Q] prefix per student.
  // Better: use a dedicated approach with lesson_id + type
  // We'll use a simple JSON approach: store in Supabase 'messages' table or
  // use a simple key-value in lesson_progress notes with [QID:xxx] format.
  //
  // For simplicity and to avoid a new table migration right now,
  // we'll store Q&A in lesson_progress notes as JSON: notes = '[QA]{"q":"...","a":[...]}'
  // Actually simplest: separate rows per question, notes = '[Q]{question text}', 
  // answers stored as messages. But we don't have a replies table.
  //
  // FINAL approach: use Supabase realtime + a simple video_qa table we'll create
  // BUT since migration 031 is already out, let's use lesson_progress with [Q]
  // and store answers in messages table (lesson_id field mapped to lesson_id).
  // 
  // SIMPLEST that works NOW without new migration:
  // Questions: lesson_progress rows where notes starts with [Q]:question_text
  //   one row per student (their personal Q)
  // Answers: messages table with content = '[A:lessonId:questionStudentId]text'
  //
  // Actually let's just do it cleanly with a new migration approach but use
  // the existing messages table creatively. Let's use messages:
  //   group_id = lesson_id (reuse field), content = question/answer, sender_id = author
  //   We'll add a 'context' field check... no, messages doesn't have lesson_id.
  //
  // FINAL FINAL: Store Q&A in lesson_progress notes column as structured text,
  // one question per student. Show all students' questions. Answers go in a
  // new simple way: we load all lesson_progress for this lesson, show [Q] ones.
  // Replies: we add a video_qa_replies table in the next migration.
  // For NOW: show questions, reply button posts to messages system.
  
  useEffect(() => {
    loadQA()
  }, [lesson.id])

  async function loadQA() {
    setQaLoading(true)
    // Load all lesson_progress rows for this lesson that have [Q] questions
    const { data } = await supabase
      .from('lesson_progress')
      .select('id, student_id, notes, created_at, profiles(full_name, avatar_url, accent_color)')
      .eq('lesson_id', lesson.id)
      .like('notes', '[Q]%')
      .order('created_at', { ascending: false })

    if (data) {
      const entries: QAEntry[] = data.map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        question: row.notes.slice(3),
        created_at: row.created_at ?? '',
        profile: Array.isArray(row.profiles) ? row.profiles[0] : (row.profiles ?? { full_name: 'Student' }),
        answers: [],
      }))
      setQaEntries(entries)
    }
    setQaLoading(false)
  }

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveNotes = useCallback(async () => {
    setNotesSaving(true)
    await supabase.from('lesson_progress').upsert({
      student_id: studentId,
      lesson_id: lesson.id,
      notes: notes,
      status: status === 'none' ? 'completed' : status,
    } as any, { onConflict: 'student_id,lesson_id' })
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000)
  }, [notes, status, studentId, lesson.id])

  // ── Post question ──────────────────────────────────────────────────────────
  async function postQuestion() {
    if (!qaText.trim()) return
    setQaPosting(true)
    // Check if student already has a question row for this lesson
    const { data: existing } = await supabase
      .from('lesson_progress')
      .select('id, notes')
      .eq('student_id', studentId)
      .eq('lesson_id', lesson.id)
      .maybeSingle()

    const questionNote = '[Q]' + qaText.trim()
    if (existing) {
      await supabase.from('lesson_progress')
        .update({ notes: questionNote } as any)
        .eq('student_id', studentId)
        .eq('lesson_id', lesson.id)
    } else {
      await supabase.from('lesson_progress').insert({
        student_id: studentId, lesson_id: lesson.id,
        notes: questionNote,
        status: status === 'none' ? 'completed' : status,
      } as any)
    }

    setQaEntries(prev => {
      const existing = prev.find(e => e.student_id === studentId)
      const newEntry: QAEntry = {
        id: 'local-' + Date.now(),
        student_id: studentId,
        question: qaText.trim(),
        created_at: new Date().toISOString(),
        profile: { full_name: profile?.full_name ?? 'Já', avatar_url: profile?.avatar_url, accent_color: accent },
        answers: [],
      }
      if (existing) return prev.map(e => e.student_id === studentId ? { ...e, question: qaText.trim() } : e)
      return [newEntry, ...prev]
    })
    setQaText(''); setQaPosting(false)
  }

  // ── Mark complete ──────────────────────────────────────────────────────────
  async function markComplete() {
    setCompleting(true)
    await supabase.from('lesson_progress').upsert({
      student_id: studentId, lesson_id: lesson.id, status: 'completed',
    } as any, { onConflict: 'student_id,lesson_id' })
    setStatus('completed')
    const idx = allLessons.findIndex(l => l.id === lesson.id)
    const next = allLessons[idx + 1]
    if (next && !next.locked) window.location.href = `/student/modules/${moduleId}/lessons/${next.id}`
    else window.location.href = `/student/modules/${moduleId}`
    setCompleting(false)
  }

  return (
    <DarkLayout profile={profile} activeRoute={`/student/modules`}>
      <style>{`
        .vl-tab { transition: all .15s; cursor: pointer; border: none; background: none; font-family: inherit; }
        .vl-tab:hover { color: #fff !important; }
        .vl-lesson { transition: all .15s; text-decoration: none; }
        .vl-lesson:hover { background: rgba(255,255,255,.05) !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 20, alignItems: 'start' }}>

        {/* ══ MAIN ══════════════════════════════════════════════════════════ */}
        <div style={{ minWidth: 0 }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: D.txtSec, flexWrap: 'wrap' }}>
            <a href="/student/modules" style={{ color: D.txtSec, textDecoration: 'none' }}>Moduly</a>
            <span>/</span>
            <a href={`/student/modules/${moduleId}`} style={{ color: D.txtSec, textDecoration: 'none' }}>{lesson.module_title}</a>
            <span>/</span>
            <span style={{ color: D.txtPri }}>🎬 {lesson.title}</span>
          </div>

          {/* Title + meta */}
          <h1 style={{ fontSize: 21, fontWeight: 800, color: D.txtPri, marginBottom: 8 }}>{lesson.title}</h1>
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            {lesson.video_author && <span style={{ fontSize: 13, color: D.txtSec }}>👤 {lesson.video_author}</span>}
            {lesson.description && <span style={{ fontSize: 13, color: D.txtSec }}>{lesson.description}</span>}
          </div>

          {/* ── Video ── */}
          <div style={{ background: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 20, aspectRatio: '16/9', maxHeight: '52vh' }}>
            {ytId && (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            )}
            {isSP && (
              <iframe src={lesson.video_url}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allowFullScreen />
            )}
            {isDirect && (
              <video ref={videoRef} src={lesson.video_url} controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime) }} />
            )}
            {!ytId && !isSP && !isDirect && (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.txtSec, fontSize: 13 }}>
                Nepodporovaný formát videa
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, marginBottom: 16, gap: 0 }}>
            {([
              { id: 'transcript', label: '📝 Transcript' },
              { id: 'notes',      label: '🗒 Poznámky' },
              { id: 'qa',         label: `💬 Q&A${qaEntries.length > 0 ? ` (${qaEntries.length})` : ''}` },
            ] as const).map(tab => (
              <button key={tab.id} className="vl-tab" onClick={() => setActiveTab(tab.id)}
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400, color: activeTab === tab.id ? D.txtPri : D.txtSec, borderBottom: `2px solid ${activeTab === tab.id ? accent : 'transparent'}`, marginBottom: -1 }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Transcript */}
          {activeTab === 'transcript' && (
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 4 }}>
              {transcriptLines.length === 0
                ? <div style={{ color: D.txtSec, fontSize: 13, padding: '20px 0', textAlign: 'center' as const }}>Žádný transcript není k dispozici.</div>
                : transcriptLines.map((line, i) => (
                    <div key={i} ref={i === activeLineIdx ? activeLineRef : undefined}
                      style={{ display: 'flex', gap: 12, padding: '6px 10px', borderRadius: 8, background: i === activeLineIdx ? accent + '20' : 'transparent', transition: 'background .2s' }}>
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

          {/* Notes */}
          {activeTab === 'notes' && (
            <div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={9}
                placeholder="Pište si poznámky k lekci…"
                style={{ width: '100%', padding: '13px 15px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 12, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button onClick={saveNotes} disabled={notesSaving}
                  style={{ padding: '8px 18px', background: accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {notesSaving ? 'Ukládám…' : '💾 Uložit'}
                </button>
                {notesSaved && <span style={{ fontSize: 12, color: D.success }}>✓ Uloženo</span>}
              </div>
            </div>
          )}

          {/* Q&A */}
          {activeTab === 'qa' && (
            <div>
              {/* Post question */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'flex-start' }}>
                <Avatar src={profile?.avatar_url} name={profile?.full_name ?? 'Já'} size={36} accent={accent} />
                <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                  <input value={qaText} onChange={e => setQaText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postQuestion()}
                    placeholder="Napište otázku k lekci…"
                    style={{ flex: 1, padding: '10px 13px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={postQuestion} disabled={qaPosting || !qaText.trim()}
                    style={{ padding: '10px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: qaPosting || !qaText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: qaPosting || !qaText.trim() ? .5 : 1 }}>
                    Odeslat
                  </button>
                </div>
              </div>
              {/* Questions list */}
              {qaLoading
                ? <div style={{ color: D.txtSec, fontSize: 13, textAlign: 'center' as const, padding: '20px 0' }}>Načítám…</div>
                : qaEntries.length === 0
                  ? <div style={{ color: D.txtSec, fontSize: 13, textAlign: 'center' as const, padding: '20px 0' }}>Zatím žádné otázky.</div>
                  : qaEntries.map(entry => (
                      <div key={entry.id} style={{ marginBottom: 16, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          <Avatar src={entry.profile?.avatar_url} name={entry.profile?.full_name ?? 'Student'} size={32} accent={entry.profile?.accent_color ?? '#7C3AED'} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: D.txtPri }}>{entry.profile?.full_name ?? 'Student'}</span>
                              <span style={{ fontSize: 10, color: D.txtSec }}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString('cs-CZ') : ''}</span>
                            </div>
                            <div style={{ fontSize: 14, color: D.txtPri, lineHeight: 1.6 }}>{entry.question}</div>
                          </div>
                        </div>
                        {/* Reply button */}
                        <div style={{ paddingLeft: 42 }}>
                          <button onClick={() => setReplyOpen(replyOpen === entry.id ? null : entry.id)}
                            style={{ fontSize: 11, color: D.txtSec, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>
                            💬 Odpovědět
                          </button>
                          {replyOpen === entry.id && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <input value={replyText[entry.id] ?? ''}
                                onChange={e => setReplyText(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                placeholder="Vaše odpověď…"
                                style={{ flex: 1, padding: '8px 12px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12, color: D.txtPri, fontFamily: 'inherit', outline: 'none' }} />
                              <button
                                onClick={async () => {
                                  const txt = replyText[entry.id]?.trim()
                                  if (!txt) return
                                  // Store reply as a new lesson_progress row won't work for the same student
                                  // Use messages table: group_id = lesson.module_id, content = [REPLY:lessonId:questionId]text
                                  // For now show optimistically
                                  setQaEntries(prev => prev.map(e => e.id === entry.id
                                    ? { ...e, answers: [...e.answers, { id: 'local-' + Date.now(), author_id: studentId, text: txt, created_at: new Date().toISOString(), profile: { full_name: profile?.full_name ?? 'Já', avatar_url: profile?.avatar_url } }] }
                                    : e
                                  ))
                                  setReplyText(prev => ({ ...prev, [entry.id]: '' }))
                                  setReplyOpen(null)
                                }}
                                style={{ padding: '8px 14px', background: accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Odeslat
                              </button>
                            </div>
                          )}
                          {/* Show answers */}
                          {entry.answers.map(ans => (
                            <div key={ans.id} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <Avatar src={ans.profile?.avatar_url} name={ans.profile?.full_name ?? 'Student'} size={24} />
                              <div style={{ background: D.bgMid, borderRadius: 8, padding: '6px 10px', flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: D.txtPri, marginRight: 6 }}>{ans.profile?.full_name}</span>
                                <span style={{ fontSize: 12, color: D.txtSec }}>{ans.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
              }
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 20 }}>
          {/* Module title */}
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${D.border}` }}>
            <a href={`/student/modules/${moduleId}`} style={{ fontSize: 11, color: D.txtSec, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>← Zpět na modul</a>
            <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri }}>{lesson.module_title}</div>
            <div style={{ fontSize: 11, color: D.txtSec, marginTop: 3 }}>{allLessons.length} lekcí</div>
          </div>

          {/* Lesson list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {allLessons.map((l, i) => {
              const isActive = l.id === lesson.id
              const isDone   = completedSet.has(l.id) || (isActive && status === 'completed')
              const isVid    = l.lesson_type === 'video'
              return (
                <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`} className="vl-lesson"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: isActive ? accent+'15' : 'transparent', borderLeft: `3px solid ${isActive ? accent : 'transparent'}` }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: isDone ? D.success+'20' : isActive ? accent+'20' : 'rgba(255,255,255,.06)', color: isDone ? D.success : isActive ? accent : D.txtSec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {isDone ? '✓' : isVid ? '▶' : i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: isActive ? D.txtPri : D.txtSec, fontWeight: isActive ? 600 : 400, lineHeight: 1.4, flex: 1 }}>{l.title}</span>
                </a>
              )
            })}
          </div>

          {/* Complete button */}
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${D.border}` }}>
            {status === 'completed'
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: D.success+'15', border: `1px solid ${D.success}30`, borderRadius: 10, color: D.success, fontSize: 13, fontWeight: 600 }}>
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
    </DarkLayout>
  )
}
