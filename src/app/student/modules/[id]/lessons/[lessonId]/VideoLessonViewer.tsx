'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Helpers ────────────────────────────────────────────────────────────────────
function ytEmbedUrl(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1` : null
}
function isSP(url: string)     { return !!(url?.includes('sharepoint.com') || url?.includes('microsoftstream.com')) }
function isDirect(url: string) { return !!(url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) }

interface TLine { time: number | null; text: string }
function parseTr(raw: string): TLine[] {
  if (!raw?.trim()) return []
  return raw.split('\n').map(l => {
    const m = l.match(/^(\d+):(\d{2})\s+(.+)$/)
    return m ? { time: parseInt(m[1])*60 + parseInt(m[2]), text: m[3] } : { time: null, text: l }
  }).filter(l => l.text.trim())
}
function fmt(s: number) {
  if (!isFinite(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

interface QAReply { id: string; author_id: string; reply: string; created_at: string; profiles: any }
interface QARow   { id: string; student_id: string; question: string; created_at: string; profiles: any; replies?: QAReply[] }

function Av({ src, name, size=30, accent='#7C3AED' }: { src?: string; name: string; size?: number; accent?: string }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0 }} />
  return <div style={{ width:size,height:size,borderRadius:'50%',background:accent+'30',color:accent,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.34,fontWeight:700,flexShrink:0 }}>{ini}</div>
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function VideoLessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, profile }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed'|'bookmark'|'none'
  allLessons: any[]; completedIds: string[]; profile: any
}) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#185FA5'
  const ytUrl    = ytEmbedUrl(lesson.video_url ?? '')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ct, setCt] = useState(0)  // currentTime for transcript sync

  const [tab, setTab]           = useState<'transcript'|'notes'|'qa'>('transcript')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [status, setStatus]     = useState(completionStatus)
  const [completing, setC]      = useState(false)

  const [qa, setQa]             = useState<QARow[]>([])
  const [qaLoading, setQaL]     = useState(true)
  const [qaText, setQaText]     = useState('')
  const [qaPost, setQaPost]     = useState(false)
  const [replyOpen, setReplyOpen] = useState<string|null>(null)
  const [replyText, setReplyText] = useState<Record<string,string>>({})
  const [replyPost, setReplyPost] = useState<Record<string,boolean>>({})

  const lines      = parseTr(lesson.transcript ?? '')
  const done       = new Set(completedIds)
  const lineRef    = useRef<HTMLDivElement>(null)
  const activeIdx  = lines.reduce((b,l,i) => (l.time!==null && l.time<=ct) ? i : b, -1)
  useEffect(() => { lineRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }) }, [activeIdx])

  // ── Notes ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('lesson_progress').select('notes').eq('student_id',studentId).eq('lesson_id',lesson.id).maybeSingle()
      .then(({ data }) => { if (data?.notes) setNotes(data.notes) })
  }, [lesson.id])

  const saveNotes = useCallback(async () => {
    setSaving(true)
    await supabase.from('lesson_progress').upsert(
      { student_id:studentId, lesson_id:lesson.id, notes, status: status==='none'?'completed':status } as any,
      { onConflict:'student_id,lesson_id' }
    )
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false), 2000)
  }, [notes, status, studentId, lesson.id])

  // ── Q&A ───────────────────────────────────────────────────────────────────
  useEffect(() => { loadQA() }, [lesson.id])

  async function loadQA() {
    setQaL(true)
    const { data } = await supabase
      .from('lesson_qa')
      .select(`id, student_id, question, created_at,
        profiles(full_name, avatar_url, accent_color),
        lesson_qa_replies(id, author_id, reply, created_at, profiles(full_name, avatar_url, accent_color, role))`)
      .eq('lesson_id', lesson.id)
      .order('created_at', { ascending: false })
    setQa((data ?? []) as QARow[])
    setQaL(false)
  }

  async function postQuestion() {
    if (!qaText.trim()) return
    setQaPost(true)
    const { data, error } = await supabase
      .from('lesson_qa')
      .insert({ lesson_id:lesson.id, student_id:studentId, question:qaText.trim() } as any)
      .select('id, student_id, question, created_at, profiles(full_name, avatar_url, accent_color)')
      .single()
    if (!error && data) { setQa(prev => [{ ...(data as QARow), replies:[] }, ...prev]); setQaText('') }
    setQaPost(false)
  }

  async function deleteQuestion(id: string) {
    await supabase.from('lesson_qa').delete().eq('id',id)
    setQa(prev => prev.filter(r => r.id !== id))
  }

  async function postReply(qId: string) {
    const txt = replyText[qId]?.trim()
    if (!txt) return
    setReplyPost(p => ({ ...p, [qId]: true }))
    const { data, error } = await supabase
      .from('lesson_qa_replies')
      .insert({ question_id:qId, author_id:studentId, reply:txt } as any)
      .select('id, author_id, reply, created_at, profiles(full_name, avatar_url, accent_color, role)')
      .single()
    if (!error && data) {
      setQa(prev => prev.map(q => q.id===qId ? { ...q, replies:[...(q.replies??[]), data as QAReply] } : q))
      setReplyText(p => ({ ...p, [qId]:'' }))
      setReplyOpen(null)
    }
    setReplyPost(p => ({ ...p, [qId]: false }))
  }

  // ── Complete ──────────────────────────────────────────────────────────────
  async function toggleComplete() {
    setC(true)
    const next = status === 'completed' ? 'bookmark' : 'completed'
    await supabase.from('lesson_progress').upsert(
      { student_id:studentId, lesson_id:lesson.id, status:next } as any,
      { onConflict:'student_id,lesson_id' }
    )
    setStatus(next)
    if (next === 'completed') {
      const idx = allLessons.findIndex(l => l.id===lesson.id)
      const n   = allLessons[idx+1]
      if (n && !n.locked) window.location.href = `/student/modules/${moduleId}/lessons/${n.id}`
      else window.location.href = `/student/modules/${moduleId}`
    }
    setC(false)
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => setTab(id)}
      style={{ padding:'10px 16px', fontSize:13, fontWeight: tab===id?700:400, color: tab===id?D.txtPri:D.txtSec, borderBottom:`2px solid ${tab===id?accent:'transparent'}`, border:'none', background:'none', fontFamily:'inherit', cursor:'pointer', marginBottom:-1, transition:'color .15s' }}>
      {label}
    </button>
  )

  return (
    <DarkLayout profile={profile} activeRoute="/student/modules" fullContent>
      <style>{`
        .vl-lesson { text-decoration:none; display:flex; align-items:center; gap:10px; padding:10px 16px; transition:background .12s; border-left:3px solid transparent; }
        .vl-lesson:hover { background:rgba(255,255,255,.05) !important; }
        .qa-card { background:${D.bgCard}; border:1px solid ${D.border}; border-radius:12px; margin-bottom:12px; overflow:hidden; }
      `}</style>

      {/* ── Three-column layout: left nav (from DarkLayout) | main | right panel ── */}
      {/* fullContent=true means DarkLayout gives us full height flex container   */}
      <div style={{ display:'flex', flex:1, minHeight:0, overflow:'hidden' }}>

        {/* ══ MAIN (scrollable) ══ */}
        <div style={{ flex:1, minWidth:0, overflowY:'auto', padding:'24px 28px' }}>

          {/* Breadcrumb */}
          <div style={{ fontSize:12, color:D.txtSec, marginBottom:12, display:'flex', gap:6, flexWrap:'wrap' }}>
            <a href="/student/modules" style={{ color:D.txtSec, textDecoration:'none' }}>Moduly</a>
            <span>/</span>
            <a href={`/student/modules/${moduleId}`} style={{ color:D.txtSec, textDecoration:'none' }}>{lesson.module_title}</a>
            <span>/</span>
            <span style={{ color:D.txtPri }}>🎬 {lesson.title}</span>
          </div>

          {/* Title + meta */}
          <h1 style={{ fontSize:20, fontWeight:800, color:D.txtPri, marginBottom:6 }}>{lesson.title}</h1>
          {(lesson.video_author||lesson.description) && (
            <div style={{ fontSize:13, color:D.txtSec, marginBottom:14, display:'flex', gap:14, flexWrap:'wrap' }}>
              {lesson.video_author && <span>👤 {lesson.video_author}</span>}
              {lesson.description  && <span>{lesson.description}</span>}
            </div>
          )}

          {/* ── VIDEO — full width ── */}
          <div style={{ width:'100%', aspectRatio:'16/9', background:'#000', borderRadius:14, overflow:'hidden', marginBottom:20 }}>
            {ytUrl      && <iframe src={ytUrl} style={{ width:'100%',height:'100%',border:'none',display:'block' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />}
            {isSP(lesson.video_url??'')     && <iframe src={lesson.video_url} style={{ width:'100%',height:'100%',border:'none',display:'block' }} allowFullScreen />}
            {isDirect(lesson.video_url??'') && <video ref={videoRef} src={lesson.video_url} controls style={{ width:'100%',height:'100%',objectFit:'contain',display:'block' }} onTimeUpdate={()=>{ if(videoRef.current) setCt(videoRef.current.currentTime) }} />}
            {!ytUrl && !isSP(lesson.video_url??'') && !isDirect(lesson.video_url??'') && (
              <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:D.txtSec }}>Nepodporovaný formát videa</div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:'flex', borderBottom:`1px solid ${D.border}`, marginBottom:16 }}>
            {tabBtn('transcript', '📝 Transcript')}
            {tabBtn('notes', '🗒 Poznámky')}
            {tabBtn('qa', `💬 Q&A${qa.length>0?` (${qa.length})`:''}`)}
          </div>

          {/* TRANSCRIPT */}
          {tab==='transcript' && (
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              {lines.length===0
                ? <p style={{ color:D.txtSec,fontSize:13,textAlign:'center',padding:'20px 0' }}>Žádný transcript.</p>
                : lines.map((l,i) => (
                    <div key={i} ref={i===activeIdx?lineRef:undefined}
                      style={{ display:'flex',gap:12,padding:'6px 10px',borderRadius:8,background:i===activeIdx?accent+'20':'transparent',transition:'background .2s' }}>
                      {l.time!==null && <span style={{ fontSize:11,color:i===activeIdx?accent:D.txtSec,fontFamily:'monospace',flexShrink:0,paddingTop:2 }}>{fmt(l.time)}</span>}
                      <span style={{ fontSize:13,color:i===activeIdx?D.txtPri:D.txtSec,lineHeight:1.6 }}>{l.text}</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* NOTES */}
          {tab==='notes' && (
            <div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={8} placeholder="Pište si poznámky…"
                style={{ width:'100%',padding:'12px 14px',background:D.bgCard,border:`1px solid ${D.border}`,borderRadius:12,fontSize:13,color:D.txtPri,fontFamily:'inherit',outline:'none',resize:'vertical',lineHeight:1.7,boxSizing:'border-box' as const }} />
              <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:10 }}>
                <button onClick={saveNotes} disabled={saving} style={{ padding:'8px 18px',background:accent,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>
                  {saving?'Ukládám…':'💾 Uložit'}
                </button>
                {saved && <span style={{ fontSize:12,color:D.success }}>✓ Uloženo</span>}
              </div>
            </div>
          )}

          {/* Q&A */}
          {tab==='qa' && (
            <div>
              {/* Post question */}
              <div style={{ display:'flex',gap:10,marginBottom:20,alignItems:'flex-start' }}>
                <Av src={profile?.avatar_url} name={profile?.full_name??'Já'} size={34} accent={accent} />
                <div style={{ flex:1,display:'flex',gap:8 }}>
                  <input value={qaText} onChange={e=>setQaText(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();postQuestion()} }}
                    placeholder="Napište otázku k lekci… (Enter = odeslat)"
                    style={{ flex:1,padding:'10px 13px',background:D.bgCard,border:`1px solid ${D.border}`,borderRadius:10,fontSize:13,color:D.txtPri,fontFamily:'inherit',outline:'none' }} />
                  <button onClick={postQuestion} disabled={qaPost||!qaText.trim()}
                    style={{ padding:'10px 16px',background:accent,color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:qaPost||!qaText.trim()?'not-allowed':'pointer',fontFamily:'inherit',opacity:qaPost||!qaText.trim()?.5:1 }}>
                    Odeslat
                  </button>
                </div>
              </div>

              {qaLoading
                ? <p style={{ color:D.txtSec,fontSize:13,textAlign:'center' }}>Načítám…</p>
                : qa.length===0
                  ? <p style={{ color:D.txtSec,fontSize:13,textAlign:'center',padding:'20px 0' }}>Zatím žádné otázky. Buď první!</p>
                  : qa.map(row => {
                      const prof = Array.isArray(row.profiles)?row.profiles[0]:row.profiles
                      const isOwn = row.student_id===studentId
                      const replies: QAReply[] = (Array.isArray(row.lesson_qa_replies)?row.lesson_qa_replies:row.replies) ?? []
                      return (
                        <div key={row.id} className="qa-card">
                          {/* Question */}
                          <div style={{ padding:'14px 16px' }}>
                            <div style={{ display:'flex',gap:10 }}>
                              <Av src={prof?.avatar_url} name={prof?.full_name??'Student'} size={32} accent={prof?.accent_color??'#7C3AED'} />
                              <div style={{ flex:1 }}>
                                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap' }}>
                                  <span style={{ fontSize:13,fontWeight:600,color:D.txtPri }}>{prof?.full_name??'Student'}</span>
                                  <span style={{ fontSize:10,color:D.txtSec }}>{row.created_at?new Date(row.created_at).toLocaleDateString('cs-CZ',{day:'numeric',month:'short'}):''}</span>
                                  {isOwn && <button onClick={()=>deleteQuestion(row.id)} style={{ marginLeft:'auto',padding:'1px 8px',background:'rgba(239,68,68,.12)',color:D.danger,border:'none',borderRadius:5,fontSize:10,cursor:'pointer',fontFamily:'inherit' }}>Smazat</button>}
                                </div>
                                <p style={{ fontSize:14,color:D.txtPri,lineHeight:1.6,margin:0 }}>{row.question}</p>
                              </div>
                            </div>
                          </div>

                          {/* Replies */}
                          {replies.length>0 && (
                            <div style={{ borderTop:`1px solid ${D.border}`, padding:'8px 16px 4px 58px', display:'flex', flexDirection:'column', gap:10 }}>
                              {replies.map(r => {
                                const rp = Array.isArray(r.profiles)?r.profiles[0]:r.profiles
                                return (
                                  <div key={r.id} style={{ display:'flex',gap:8,alignItems:'flex-start' }}>
                                    <Av src={rp?.avatar_url} name={rp?.full_name??'Student'} size={24} accent={rp?.accent_color??'#7C3AED'} />
                                    <div style={{ background:D.bgMid,borderRadius:10,padding:'8px 12px',flex:1 }}>
                                      <div style={{ display:'flex',gap:8,alignItems:'center',marginBottom:3 }}>
                                        <span style={{ fontSize:12,fontWeight:600,color:D.txtPri }}>{rp?.full_name??'Student'}</span>
                                        {rp?.role==='teacher' && <span style={{ fontSize:9,padding:'1px 6px',background:accent+'20',color:accent,borderRadius:10,fontWeight:700 }}>Učitel</span>}
                                        <span style={{ fontSize:10,color:D.txtSec }}>{r.created_at?new Date(r.created_at).toLocaleDateString('cs-CZ',{day:'numeric',month:'short'}):''}</span>
                                      </div>
                                      <p style={{ fontSize:13,color:D.txtPri,margin:0,lineHeight:1.5 }}>{r.reply}</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Reply input */}
                          <div style={{ borderTop:`1px solid ${D.border}`, padding:'8px 16px 12px 58px' }}>
                            {replyOpen===row.id
                              ? (
                                <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                                  <Av src={profile?.avatar_url} name={profile?.full_name??'Já'} size={24} accent={accent} />
                                  <input value={replyText[row.id]??''} onChange={e=>setReplyText(p=>({...p,[row.id]:e.target.value}))}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();postReply(row.id)} }}
                                    placeholder="Napište odpověď… (Enter = odeslat)"
                                    autoFocus
                                    style={{ flex:1,padding:'7px 11px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:8,fontSize:12,color:D.txtPri,fontFamily:'inherit',outline:'none' }} />
                                  <button onClick={()=>postReply(row.id)} disabled={replyPost[row.id]||!replyText[row.id]?.trim()}
                                    style={{ padding:'7px 12px',background:accent,color:'#fff',border:'none',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',opacity:replyPost[row.id]||!replyText[row.id]?.trim()?.5:1 }}>
                                    {replyPost[row.id]?'…':'Odeslat'}
                                  </button>
                                  <button onClick={()=>setReplyOpen(null)} style={{ padding:'7px 10px',background:'none',border:'none',cursor:'pointer',color:D.txtSec,fontSize:11,fontFamily:'inherit' }}>Zrušit</button>
                                </div>
                              )
                              : (
                                <button onClick={()=>setReplyOpen(row.id)}
                                  style={{ fontSize:11,color:D.txtSec,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'2px 0' }}>
                                  💬 Odpovědět{replies.length>0?` · ${replies.length} ${replies.length===1?'odpověď':replies.length<5?'odpovědi':'odpovědí'}`:''}
                                </button>
                              )
                            }
                          </div>
                        </div>
                      )
                    })
              }
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL — sticky, full height ══ */}
        <div style={{ width:272, flexShrink:0, borderLeft:`1px solid ${D.border}`, background:D.bgCard, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Module header */}
          <div style={{ padding:'20px 16px 14px', borderBottom:`1px solid ${D.border}`, flexShrink:0 }}>
            <a href={`/student/modules/${moduleId}`} style={{ fontSize:11,color:D.txtSec,textDecoration:'none',display:'block',marginBottom:8 }}>← Zpět na modul</a>
            <div style={{ fontSize:14,fontWeight:700,color:D.txtPri,lineHeight:1.3 }}>{lesson.module_title}</div>
            <div style={{ fontSize:11,color:D.txtSec,marginTop:4 }}>{allLessons.length} lekcí · {done.size} splněno</div>
          </div>

          {/* Lesson list — scrollable */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {allLessons.map((l,i) => {
              const isActive = l.id===lesson.id
              const isDone   = done.has(l.id)||(isActive&&status==='completed')
              const isVid    = l.lesson_type==='video'
              return (
                <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`} className="vl-lesson"
                  style={{ background:isActive?accent+'15':'transparent', borderLeftColor:isActive?accent:'transparent' }}>
                  <div style={{ width:24,height:24,borderRadius:'50%',background:isDone?D.success+'20':isActive?accent+'20':'rgba(255,255,255,.06)',color:isDone?D.success:isActive?accent:D.txtSec,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0 }}>
                    {isDone?'✓':isVid?'▶':i+1}
                  </div>
                  <span style={{ fontSize:12,color:isActive?D.txtPri:D.txtSec,fontWeight:isActive?600:400,flex:1,lineHeight:1.4 }}>{l.title}</span>
                </a>
              )
            })}
          </div>

          {/* Complete / undo */}
          <div style={{ padding:'14px 16px', borderTop:`1px solid ${D.border}`, flexShrink:0 }}>
            {status==='completed'
              ? <>
                  <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:D.success+'15',border:`1px solid ${D.success}30`,borderRadius:10,color:D.success,fontSize:13,fontWeight:600,marginBottom:8 }}>
                    <span>✓</span> Lekce dokončena
                  </div>
                  <button onClick={toggleComplete} disabled={completing}
                    style={{ width:'100%',padding:'7px',background:'transparent',color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,fontSize:11,cursor:'pointer',fontFamily:'inherit' }}>
                    {completing?'…':'↩ Označit jako nedokončenou'}
                  </button>
                </>
              : <button onClick={toggleComplete} disabled={completing}
                  style={{ width:'100%',padding:'12px',background:accent,color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:completing?'not-allowed':'pointer',fontFamily:'inherit',opacity:completing?.7:1 }}>
                  {completing?'…':'Dokončit a pokračovat →'}
                </button>
            }
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
