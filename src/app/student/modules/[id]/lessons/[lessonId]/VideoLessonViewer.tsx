"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DarkLayout, D } from "@/components/DarkLayout"; // Import layoutu a tokenů z verze 2

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

    // Q&A state
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

    // Logic: Load Notes
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

    // Logic: Save Notes
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

    // Logic: Q&A
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

    // Logic: Completion
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
        <DarkLayout profile={profile}>
            <style>{`
        .vl-lesson:hover { background: rgba(255,255,255,.05) !important; }
        .vl-tab { transition: all .15s; cursor: pointer; border: none; background: none; font-family: inherit; }
        .vl-tab:hover { color: #fff !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
      `}</style>

            {/* Grid layout: Hlavní obsah vlevo, panel lekcí vpravo */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 320px",
                    minHeight: "calc(100vh - 0px)",
                    background: D.bgMain,
                }}
            >
                {/* ══ STŘEDOVÝ PANEL (Video + Obsah) ══════════════════════════════ */}
                <div style={{ padding: "32px 40px", overflowY: "auto" }}>
                    {/* Breadcrumb */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 20,
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

                    <h1
                        style={{
                            fontSize: 26,
                            fontWeight: 800,
                            color: D.txtPri,
                            marginBottom: 8,
                        }}
                    >
                        {lesson.title}
                    </h1>
                    <p
                        style={{
                            fontSize: 14,
                            color: D.txtSec,
                            marginBottom: 24,
                            lineHeight: 1.6,
                            maxWidth: 800,
                        }}
                    >
                        {lesson.description}
                    </p>

                    {/* Video Player Area */}
                    <div
                        style={{
                            position: "relative",
                            background: "#000",
                            borderRadius: 16,
                            overflow: "hidden",
                            marginBottom: 24,
                            aspectRatio: "16/9",
                            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                        }}
                    >
                        {ytUrl && (
                            <iframe
                                src={ytUrl}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "none",
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
                                }}
                                allowFullScreen
                            />
                        )}
                        {isDirect(lesson.video_url ?? "") && (
                            <video
                                ref={videoRef}
                                src={lesson.video_url}
                                controls
                                style={{ width: "100%", height: "100%" }}
                                onTimeUpdate={() => {
                                    if (videoRef.current)
                                        setCurrentTime(
                                            videoRef.current.currentTime,
                                        );
                                }}
                            />
                        )}
                    </div>

                    {/* Tabs */}
                    <div
                        style={{
                            display: "flex",
                            gap: 0,
                            borderBottom: `1px solid ${D.border}`,
                            marginBottom: 20,
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
                                    padding: "12px 20px",
                                    fontSize: 14,
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

                    {/* Tab Content */}
                    <div style={{ minHeight: 300 }}>
                        {activeTab === "transcript" && (
                            <div
                                style={{
                                    maxHeight: 400,
                                    overflowY: "auto",
                                    paddingRight: 10,
                                }}
                            >
                                {transcriptLines.length === 0 ? (
                                    <p style={{ color: D.txtSec }}>
                                        Transcript není k dispozici.
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
                                                gap: 14,
                                                padding: "8px 12px",
                                                borderRadius: 10,
                                                background:
                                                    i === activeLineIdx
                                                        ? accent + "15"
                                                        : "transparent",
                                                marginBottom: 2,
                                            }}
                                        >
                                            {line.time !== null && (
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        color:
                                                            i === activeLineIdx
                                                                ? accent
                                                                : D.txtSec,
                                                        fontFamily: "monospace",
                                                        width: 45,
                                                    }}
                                                >
                                                    {fmt(line.time)}
                                                </span>
                                            )}
                                            <span
                                                style={{
                                                    fontSize: 14,
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

                        {activeTab === "notes" && (
                            <div>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={8}
                                    placeholder="Vaše poznámky..."
                                    style={{
                                        width: "100%",
                                        padding: "16px",
                                        background: D.bgCard,
                                        border: `1px solid ${D.border}`,
                                        borderRadius: 12,
                                        color: "#fff",
                                        outline: "none",
                                        resize: "vertical",
                                    }}
                                />
                                <button
                                    onClick={saveNotes}
                                    disabled={notesSaving}
                                    style={{
                                        marginTop: 12,
                                        padding: "10px 20px",
                                        background: accent,
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 10,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                    }}
                                >
                                    {notesSaving
                                        ? "Ukládám..."
                                        : "Uložit poznámky"}
                                </button>
                            </div>
                        )}

                        {activeTab === "qa" && (
                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 12,
                                        marginBottom: 24,
                                    }}
                                >
                                    <Avatar
                                        src={profile?.avatar_url}
                                        name={profile?.full_name}
                                        size={36}
                                        accent={accent}
                                    />
                                    <input
                                        value={qaText}
                                        onChange={(e) =>
                                            setQaText(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && postQuestion()
                                        }
                                        placeholder="Zeptejte se na něco..."
                                        style={{
                                            flex: 1,
                                            padding: "12px 16px",
                                            background: D.bgCard,
                                            border: `1px solid ${D.border}`,
                                            borderRadius: 12,
                                            color: "#fff",
                                            outline: "none",
                                        }}
                                    />
                                    <button
                                        onClick={postQuestion}
                                        disabled={qaPosting}
                                        style={{
                                            padding: "0 20px",
                                            background: accent,
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 12,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Poslat
                                    </button>
                                </div>
                                {qaRows.map((row) => (
                                    <div
                                        key={row.id}
                                        style={{
                                            display: "flex",
                                            gap: 12,
                                            padding: "16px",
                                            background: D.bgCard,
                                            borderRadius: 12,
                                            marginBottom: 12,
                                            border: `1px solid ${D.border}`,
                                        }}
                                    >
                                        <Avatar
                                            src={row.profiles?.avatar_url}
                                            name={row.profiles?.full_name}
                                            size={32}
                                            accent={row.profiles?.accent_color}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    marginBottom: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {row.profiles?.full_name}
                                                </span>
                                                {row.student_id ===
                                                    studentId && (
                                                    <button
                                                        onClick={() =>
                                                            deleteQuestion(
                                                                row.id,
                                                            )
                                                        }
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            color: D.danger,
                                                            fontSize: 11,
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
                                                    margin: 0,
                                                }}
                                            >
                                                {row.question}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ══ PRAVÝ PANEL (Seznam lekcí) ═══════════════════════════════════ */}
                <div
                    style={{
                        borderLeft: `1px solid ${D.border}`,
                        background: D.bgCard,
                        display: "flex",
                        flexDirection: "column",
                        height: "calc(100vh - 0px)",
                        position: "sticky",
                        top: 0,
                    }}
                >
                    <div
                        style={{
                            padding: "24px 20px",
                            borderBottom: `1px solid ${D.border}`,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                color: D.txtSec,
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginBottom: 4,
                            }}
                        >
                            Aktuální modul
                        </div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 800,
                                color: D.txtPri,
                            }}
                        >
                            {lesson.module_title}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
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
                                        gap: 12,
                                        padding: "14px 20px",
                                        textDecoration: "none",
                                        borderLeft: `3px solid ${isActive ? accent : "transparent"}`,
                                        background: isActive
                                            ? accent + "10"
                                            : "transparent",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: "50%",
                                            background: isDone
                                                ? D.success + "20"
                                                : D.bgMid,
                                            color: isDone
                                                ? D.success
                                                : D.txtSec,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {isDone ? "✓" : i + 1}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: isActive ? "#fff" : D.txtSec,
                                            fontWeight: isActive ? 600 : 400,
                                        }}
                                    >
                                        {l.title}
                                    </span>
                                </a>
                            );
                        })}
                    </div>

                    <div
                        style={{
                            padding: "20px",
                            borderTop: `1px solid ${D.border}`,
                        }}
                    >
                        <button
                            onClick={toggleComplete}
                            disabled={completing}
                            style={{
                                width: "100%",
                                padding: "14px",
                                background:
                                    status === "completed"
                                        ? "transparent"
                                        : accent,
                                color: "#fff",
                                border:
                                    status === "completed"
                                        ? `1px solid ${D.border}`
                                        : "none",
                                borderRadius: 12,
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            {status === "completed"
                                ? "↩ Označit jako nedokončené"
                                : "Dokončit lekci"}
                        </button>
                    </div>
                </div>
            </div>
        </DarkLayout>
    );
}
