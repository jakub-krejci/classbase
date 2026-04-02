"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Design tokens (z verze 1) ─────────────────────────────────────────────────
const D = {
    bgMain: "#090B10",
    bgCard: "#14171F",
    bgMid: "#1E2230",
    bgHover: "#1A1E28",
    txtPri: "#FFFFFF",
    txtSec: "#A1A7B3",
    border: "rgba(255,255,255,0.06)",
    success: "#22C55E",
    warning: "#FBBF24",
    danger: "#EF4444",
    radius: "16px",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function ytEmbedUrl(url: string): string | null {
    const m = url?.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    return m
        ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1`
        : null;
}
function isSP(url: string) {
    return !!(
        url?.includes("sharepoint.com") || url?.includes("microsoftstream.com")
    );
}
function isDirect(url: string) {
    return !!url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i);
}

interface TranscriptLine {
    time: number | null;
    text: string;
}
function parseTranscript(raw: string): TranscriptLine[] {
    if (!raw?.trim()) return [];
    return raw
        .split("\n")
        .map((line) => {
            const m = line.match(/^(\d+):(\d{2})\s+(.+)$/);
            if (m)
                return {
                    time: parseInt(m[1]) * 60 + parseInt(m[2]),
                    text: m[3],
                };
            return { time: null, text: line };
        })
        .filter((l) => l.text.trim());
}
function fmt(s: number) {
    if (!isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60)
        .toString()
        .padStart(2, "0")}`;
}

interface QARow {
    id: string;
    student_id: string;
    question: string;
    created_at: string;
    profiles: any;
}

function Avatar({
    src,
    name,
    size = 30,
    accent = "#7C3AED",
}: {
    src?: string;
    name: string;
    size?: number;
    accent?: string;
}) {
    const ini = (name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    if (src)
        return (
            <img
                src={src}
                alt={name}
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                }}
            />
        );
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: accent + "30",
                color: accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: size * 0.34,
                fontWeight: 700,
                flexShrink: 0,
            }}
        >
            {ini}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VideoLessonViewer({
    lesson,
    moduleId,
    studentId,
    completionStatus,
    allLessons,
    completedIds,
    profile,
}: {
    lesson: any;
    moduleId: string;
    studentId: string;
    completionStatus: "completed" | "bookmark" | "none";
    allLessons: any[];
    completedIds: string[];
    profile: any;
}) {
    const supabase = createClient();
    const accent = profile?.accent_color ?? "#185FA5";

    // Video logic
    const ytUrl = ytEmbedUrl(lesson.video_url ?? "");
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Tabs & Notes state
    const [activeTab, setActiveTab] = useState<"transcript" | "notes" | "qa">(
        "transcript",
    );
    const [notes, setNotes] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);
    const [status, setStatus] = useState(completionStatus);
    const [completing, setCompleting] = useState(false);

    // Q&A state (z verze 2)
    const [qaRows, setQaRows] = useState<QARow[]>([]);
    const [qaLoading, setQaLoading] = useState(true);
    const [qaText, setQaText] = useState("");
    const [qaPosting, setQaPosting] = useState(false);

    const transcriptLines = parseTranscript(lesson.transcript ?? "");
    const completedSet = new Set(completedIds);
    const activeLineRef = useRef<HTMLDivElement>(null);
    const activeLineIdx = transcriptLines.reduce(
        (best, line, i) =>
            line.time !== null && line.time <= currentTime ? i : best,
        -1,
    );

    useEffect(() => {
        activeLineRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
        });
    }, [activeLineIdx]);

    // ── Logic: Load Notes ──
    useEffect(() => {
        supabase
            .from("lesson_progress")
            .select("notes")
            .eq("student_id", studentId)
            .eq("lesson_id", lesson.id)
            .maybeSingle()
            .then(({ data }) => {
                if (data?.notes) setNotes(data.notes);
            });
    }, [lesson.id, studentId, supabase]);

    // ── Logic: Save Notes ──
    const saveNotes = useCallback(async () => {
        setNotesSaving(true);
        await supabase.from("lesson_progress").upsert(
            {
                student_id: studentId,
                lesson_id: lesson.id,
                notes,
                status: status === "none" ? "completed" : status,
            } as any,
            { onConflict: "student_id,lesson_id" },
        );
        setNotesSaving(false);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
    }, [notes, status, studentId, lesson.id, supabase]);

    // ── Logic: Q&A (lesson_qa table) ──
    useEffect(() => {
        loadQA();
    }, [lesson.id]);

    async function loadQA() {
        setQaLoading(true);
        const { data } = await supabase
            .from("lesson_qa")
            .select(
                "id, student_id, question, created_at, profiles(full_name, avatar_url, accent_color)",
            )
            .eq("lesson_id", lesson.id)
            .order("created_at", { ascending: false });
        setQaRows((data ?? []) as QARow[]);
        setQaLoading(false);
    }

    async function postQuestion() {
        if (!qaText.trim()) return;
        setQaPosting(true);
        const { data, error } = await supabase
            .from("lesson_qa")
            .insert({
                lesson_id: lesson.id,
                student_id: studentId,
                question: qaText.trim(),
            } as any)
            .select(
                "id, student_id, question, created_at, profiles(full_name, avatar_url, accent_color)",
            )
            .single();
        if (!error && data) {
            setQaRows((prev) => [data as QARow, ...prev]);
            setQaText("");
        }
        setQaPosting(false);
    }

    async function deleteQuestion(id: string) {
        await supabase.from("lesson_qa").delete().eq("id", id);
        setQaRows((prev) => prev.filter((r) => r.id !== id));
    }

    // ── Logic: Completion ──
    async function toggleComplete() {
        setCompleting(true);
        const newStatus = status === "completed" ? "bookmark" : "completed";
        await supabase.from("lesson_progress").upsert(
            {
                student_id: studentId,
                lesson_id: lesson.id,
                status: newStatus,
            } as any,
            { onConflict: "student_id,lesson_id" },
        );
        setStatus(newStatus);
        if (newStatus === "completed") {
            const idx = allLessons.findIndex((l) => l.id === lesson.id);
            const next = allLessons[idx + 1];
            if (next && !next.locked)
                window.location.href = `/student/modules/${moduleId}/lessons/${next.id}`;
            else window.location.href = `/student/modules/${moduleId}`;
        }
        setCompleting(false);
    }

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .vl-lesson:hover { background: rgba(255,255,255,.05) !important; }
        .vl-tab { transition: all .15s; cursor: pointer; border: none; background: none; fontFamily: inherit; }
        .vl-tab:hover { color: #fff !important; }
      `}</style>

            {/* Grid layout z verze 1 */}
            <div
                style={{
                    minHeight: "100vh",
                    background: D.bgMain,
                    display: "grid",
                    gridTemplateColumns: "1fr 300px",
                    gap: 0,
                }}
            >
                {/* ══ MAIN ══════════════════════════════════════════════════════════ */}
                <div
                    style={{
                        padding: "28px 24px 40px",
                        minWidth: 0,
                        overflowX: "hidden",
                    }}
                >
                    {/* Breadcrumb */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 18,
                            fontSize: 12,
                            color: D.txtSec,
                        }}
                    >
                        <a
                            href="/student/modules"
                            style={{ color: D.txtSec, textDecoration: "none" }}
                        >
                            Moduly
                        </a>
                        <span>/</span>
                        <a
                            href={`/student/modules/${moduleId}`}
                            style={{ color: D.txtSec, textDecoration: "none" }}
                        >
                            {lesson.module_title}
                        </a>
                        <span>/</span>
                        <span style={{ color: D.txtPri }}>
                            🎬 {lesson.title}
                        </span>
                    </div>

                    {/* Title + meta */}
                    <h1
                        style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: D.txtPri,
                            marginBottom: 6,
                        }}
                    >
                        {lesson.title}
                    </h1>
                    {(lesson.video_author || lesson.description) && (
                        <div style={{ marginBottom: 18 }}>
                            {lesson.video_author && (
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: D.txtSec,
                                        marginBottom: 4,
                                    }}
                                >
                                    👤 {lesson.video_author}
                                </div>
                            )}
                            {lesson.description && (
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: D.txtSec,
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {lesson.description}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Video Player Area */}
                    <div
                        style={{
                            position: "relative",
                            background: "#000",
                            borderRadius: 14,
                            overflow: "hidden",
                            marginBottom: 20,
                            aspectRatio: "16/9",
                        }}
                    >
                        {ytUrl && (
                            <iframe
                                src={ytUrl}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "none",
                                    display: "block",
                                }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                allowFullScreen
                            />
                        )}
                        {isSP(lesson.video_url ?? "") && (
                            <iframe
                                src={lesson.video_url}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "none",
                                    display: "block",
                                }}
                                allowFullScreen
                            />
                        )}
                        {isDirect(lesson.video_url ?? "") && (
                            <video
                                ref={videoRef}
                                src={lesson.video_url}
                                controls
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    display: "block",
                                }}
                                onTimeUpdate={() => {
                                    if (videoRef.current)
                                        setCurrentTime(
                                            videoRef.current.currentTime,
                                        );
                                }}
                            />
                        )}
                        {!ytUrl &&
                            !isSP(lesson.video_url ?? "") &&
                            !isDirect(lesson.video_url ?? "") && (
                                <div
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: D.txtSec,
                                    }}
                                >
                                    Nepodporovaný formát videa
                                </div>
                            )}
                    </div>

                    {/* Tabs header */}
                    <div
                        style={{
                            display: "flex",
                            gap: 0,
                            borderBottom: `1px solid ${D.border}`,
                            marginBottom: 16,
                        }}
                    >
                        {[
                            { id: "transcript", label: "📝 Transcript" },
                            { id: "notes", label: "🗒 Poznámky" },
                            {
                                id: "qa",
                                label: `💬 Q&A${qaRows.length > 0 ? ` (${qaRows.length})` : ""}`,
                            },
                        ].map((tab: any) => (
                            <button
                                key={tab.id}
                                className="vl-tab"
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: "10px 18px",
                                    fontSize: 13,
                                    fontWeight:
                                        activeTab === tab.id ? 700 : 400,
                                    color:
                                        activeTab === tab.id
                                            ? "#fff"
                                            : D.txtSec,
                                    borderBottom: `2px solid ${activeTab === tab.id ? accent : "transparent"}`,
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content: Transcript */}
                    {activeTab === "transcript" && (
                        <div
                            style={{
                                maxHeight: 320,
                                overflowY: "auto",
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                            }}
                        >
                            {transcriptLines.length === 0 ? (
                                <p
                                    style={{
                                        color: D.txtSec,
                                        fontSize: 13,
                                        textAlign: "center",
                                        padding: "20px 0",
                                    }}
                                >
                                    Žádný transcript není k dispozici.
                                </p>
                            ) : (
                                transcriptLines.map((line, i) => (
                                    <div
                                        key={i}
                                        ref={
                                            i === activeLineIdx
                                                ? activeLineRef
                                                : undefined
                                        }
                                        style={{
                                            display: "flex",
                                            gap: 12,
                                            padding: "6px 10px",
                                            borderRadius: 8,
                                            background:
                                                i === activeLineIdx
                                                    ? accent + "20"
                                                    : "transparent",
                                            transition: "background .2s",
                                        }}
                                    >
                                        {line.time !== null && (
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    color:
                                                        i === activeLineIdx
                                                            ? accent
                                                            : D.txtSec,
                                                    fontFamily: "monospace",
                                                    flexShrink: 0,
                                                    paddingTop: 2,
                                                }}
                                            >
                                                {fmt(line.time)}
                                            </span>
                                        )}
                                        <span
                                            style={{
                                                fontSize: 13,
                                                color:
                                                    i === activeLineIdx
                                                        ? D.txtPri
                                                        : D.txtSec,
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {line.text}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Tab Content: Notes */}
                    {activeTab === "notes" && (
                        <div>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={10}
                                placeholder="Pište si poznámky k lekci…"
                                style={{
                                    width: "100%",
                                    padding: "13px 15px",
                                    background: D.bgCard,
                                    border: `1px solid ${D.border}`,
                                    borderRadius: 12,
                                    fontSize: 13,
                                    color: D.txtPri,
                                    fontFamily: "inherit",
                                    outline: "none",
                                    resize: "vertical",
                                    lineHeight: 1.7,
                                }}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    marginTop: 10,
                                }}
                            >
                                <button
                                    onClick={saveNotes}
                                    disabled={notesSaving}
                                    style={{
                                        padding: "8px 18px",
                                        background: accent,
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {notesSaving
                                        ? "Ukládám…"
                                        : "💾 Uložit poznámky"}
                                </button>
                                {notesSaved && (
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: D.success,
                                        }}
                                    >
                                        ✓ Uloženo
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab Content: Q&A */}
                    {activeTab === "qa" && (
                        <div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 10,
                                    marginBottom: 20,
                                    alignItems: "flex-start",
                                }}
                            >
                                <Avatar
                                    src={profile?.avatar_url}
                                    name={profile?.full_name ?? "Já"}
                                    size={34}
                                    accent={accent}
                                />
                                <div
                                    style={{ flex: 1, display: "flex", gap: 8 }}
                                >
                                    <input
                                        value={qaText}
                                        onChange={(e) =>
                                            setQaText(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                !e.shiftKey
                                            ) {
                                                e.preventDefault();
                                                postQuestion();
                                            }
                                        }}
                                        placeholder="Napište otázku k lekci…"
                                        style={{
                                            flex: 1,
                                            padding: "10px 13px",
                                            background: D.bgCard,
                                            border: `1px solid ${D.border}`,
                                            borderRadius: 10,
                                            fontSize: 13,
                                            color: D.txtPri,
                                            fontFamily: "inherit",
                                            outline: "none",
                                        }}
                                    />
                                    <button
                                        onClick={postQuestion}
                                        disabled={qaPosting || !qaText.trim()}
                                        style={{
                                            padding: "10px 16px",
                                            background: accent,
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 10,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                            opacity:
                                                qaPosting || !qaText.trim()
                                                    ? 0.5
                                                    : 1,
                                        }}
                                    >
                                        Odeslat
                                    </button>
                                </div>
                            </div>

                            {qaLoading ? (
                                <p
                                    style={{
                                        color: D.txtSec,
                                        fontSize: 13,
                                        textAlign: "center",
                                    }}
                                >
                                    Načítám…
                                </p>
                            ) : qaRows.length === 0 ? (
                                <p
                                    style={{
                                        color: D.txtSec,
                                        fontSize: 13,
                                        textAlign: "center",
                                    }}
                                >
                                    Zatím žádné otázky.
                                </p>
                            ) : (
                                qaRows.map((row) => {
                                    const prof = Array.isArray(row.profiles)
                                        ? row.profiles[0]
                                        : row.profiles;
                                    const isOwn = row.student_id === studentId;
                                    return (
                                        <div
                                            key={row.id}
                                            style={{
                                                display: "flex",
                                                gap: 10,
                                                padding: "14px 16px",
                                                background: D.bgCard,
                                                border: `1px solid ${D.border}`,
                                                borderRadius: 12,
                                                marginBottom: 10,
                                            }}
                                        >
                                            <Avatar
                                                src={prof?.avatar_url}
                                                name={
                                                    prof?.full_name ?? "Student"
                                                }
                                                size={32}
                                                accent={
                                                    prof?.accent_color ??
                                                    "#7C3AED"
                                                }
                                            />
                                            <div
                                                style={{ flex: 1, minWidth: 0 }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        marginBottom: 4,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontSize: 13,
                                                            fontWeight: 600,
                                                            color: D.txtPri,
                                                        }}
                                                    >
                                                        {prof?.full_name ??
                                                            "Student"}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            color: D.txtSec,
                                                        }}
                                                    >
                                                        {row.created_at
                                                            ? new Date(
                                                                  row.created_at,
                                                              ).toLocaleDateString(
                                                                  "cs-CZ",
                                                                  {
                                                                      day: "numeric",
                                                                      month: "short",
                                                                  },
                                                              )
                                                            : ""}
                                                    </span>
                                                    {isOwn && (
                                                        <button
                                                            onClick={() =>
                                                                deleteQuestion(
                                                                    row.id,
                                                                )
                                                            }
                                                            style={{
                                                                marginLeft:
                                                                    "auto",
                                                                padding:
                                                                    "1px 8px",
                                                                background:
                                                                    "rgba(239,68,68,.12)",
                                                                color: D.danger,
                                                                border: "none",
                                                                borderRadius: 5,
                                                                fontSize: 10,
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            Smazat
                                                        </button>
                                                    )}
                                                </div>
                                                <p
                                                    style={{
                                                        fontSize: 14,
                                                        color: D.txtPri,
                                                        lineHeight: 1.6,
                                                        margin: 0,
                                                    }}
                                                >
                                                    {row.question}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* ══ RIGHT PANEL (z verze 1 - sticky a full height) ════════════════ */}
                <div
                    style={{
                        borderLeft: `1px solid ${D.border}`,
                        background: D.bgCard,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: "100vh",
                        position: "sticky",
                        top: 0,
                    }}
                >
                    {/* Module Header */}
                    <div
                        style={{
                            padding: "20px 18px 14px",
                            borderBottom: `1px solid ${D.border}`,
                        }}
                    >
                        <a
                            href={`/student/modules/${moduleId}`}
                            style={{
                                fontSize: 11,
                                color: D.txtSec,
                                textDecoration: "none",
                                display: "block",
                                marginBottom: 6,
                            }}
                        >
                            ← Zpět na modul
                        </a>
                        <div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: D.txtPri,
                            }}
                        >
                            {lesson.module_title}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: D.txtSec,
                                marginTop: 3,
                            }}
                        >
                            {allLessons.length} lekcí
                        </div>
                    </div>

                    {/* Lesson List */}
                    <div
                        style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
                    >
                        {allLessons.map((l, i) => {
                            const isActive = l.id === lesson.id;
                            const isDone =
                                completedSet.has(l.id) ||
                                (isActive && status === "completed");
                            return (
                                <a
                                    key={l.id}
                                    href={`/student/modules/${moduleId}/lessons/${l.id}`}
                                    className="vl-lesson"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "10px 18px",
                                        textDecoration: "none",
                                        background: isActive
                                            ? accent + "15"
                                            : "transparent",
                                        borderLeft: isActive
                                            ? `3px solid ${accent}`
                                            : "3px solid transparent",
                                        transition: "all .15s",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: "50%",
                                            background: isDone
                                                ? D.success + "20"
                                                : isActive
                                                  ? accent + "20"
                                                  : "rgba(255,255,255,.06)",
                                            color: isDone
                                                ? D.success
                                                : isActive
                                                  ? accent
                                                  : D.txtSec,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            fontWeight: 700,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {isDone ? "✓" : i + 1}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: isActive
                                                ? D.txtPri
                                                : D.txtSec,
                                            fontWeight: isActive ? 600 : 400,
                                            lineHeight: 1.4,
                                            flex: 1,
                                        }}
                                    >
                                        {l.title}
                                    </span>
                                </a>
                            );
                        })}
                    </div>

                    {/* Footer with Toggle Button */}
                    <div
                        style={{
                            padding: "16px 18px",
                            borderTop: `1px solid ${D.border}`,
                        }}
                    >
                        {status === "completed" ? (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "12px 16px",
                                        background: D.success + "15",
                                        border: `1px solid ${D.success}30`,
                                        borderRadius: 10,
                                        color: D.success,
                                        fontSize: 13,
                                        fontWeight: 600,
                                    }}
                                >
                                    <span>✓</span> Dokončeno
                                </div>
                                <button
                                    onClick={toggleComplete}
                                    disabled={completing}
                                    style={{
                                        padding: "7px",
                                        background: "transparent",
                                        color: D.txtSec,
                                        border: `1px solid ${D.border}`,
                                        borderRadius: 8,
                                        fontSize: 11,
                                        cursor: "pointer",
                                    }}
                                >
                                    {completing
                                        ? "…"
                                        : "↩ Označit jako nedokončenou"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={toggleComplete}
                                disabled={completing}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    background: accent,
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    opacity: completing ? 0.7 : 1,
                                }}
                            >
                                {completing ? "…" : "Dokončit a pokračovat →"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
