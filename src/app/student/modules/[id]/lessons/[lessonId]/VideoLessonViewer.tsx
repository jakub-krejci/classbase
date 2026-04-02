"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DarkLayout, D } from "@/components/DarkLayout";

// ── Pomocné funkce pro video ──────────────────────────────────────────────────
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
        url?.includes("sharepoint.com") ||
        url?.includes("microsoftstream.com") ||
        url?.includes("microsoft.com")
    );
}

function isDirect(url: string) {
    return !!url?.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i);
}

// ── Zpracování transcriptu ─────────────────────────────────────────────────────
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
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ── Komponenta Avatara ─────────────────────────────────────────────────────────
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
    const initials = (name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    if (src) {
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
    }
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
            {initials}
        </div>
    );
}

// ── HLAVNÍ KOMPONENTA ──────────────────────────────────────────────────────────
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

    // Video reference a čas
    const ytUrl = ytEmbedUrl(lesson.video_url ?? "");
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Stavy pro taby a poznámky
    const [activeTab, setActiveTab] = useState<"transcript" | "notes" | "qa">(
        "transcript",
    );
    const [notes, setNotes] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);
    const [status, setStatus] = useState(completionStatus);
    const [completing, setCompleting] = useState(false);

    // Stavy pro Q&A
    const [qaRows, setQaRows] = useState<QARow[]>([]);
    const [qaLoading, setQaLoading] = useState(true);
    const [qaText, setQaText] = useState("");
    const [qaPosting, setQaPosting] = useState(false);

    const transcriptLines = parseTranscript(lesson.transcript ?? "");
    const completedSet = new Set(completedIds);

    // Reference pro automatický scroll v transcriptu
    const activeLineRef = useRef<HTMLDivElement>(null);
    const activeLineIdx = transcriptLines.reduce(
        (best, line, i) =>
            line.time !== null && line.time <= currentTime ? i : best,
        -1,
    );

    useEffect(() => {
        if (activeLineRef.current) {
            activeLineRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }, [activeLineIdx]);

    // Načtení poznámek
    useEffect(() => {
        const fetchNotes = async () => {
            const { data } = await supabase
                .from("lesson_progress")
                .select("notes")
                .eq("student_id", studentId)
                .eq("lesson_id", lesson.id)
                .maybeSingle();
            if (data?.notes) setNotes(data.notes);
        };
        fetchNotes();
    }, [lesson.id, studentId, supabase]);

    // Uložení poznámek
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

    // Načtení Q&A
    const loadQA = useCallback(async () => {
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
    }, [lesson.id, supabase]);

    useEffect(() => {
        loadQA();
    }, [loadQA]);

    // Odeslání otázky
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

    // Smazání otázky
    async function deleteQuestion(id: string) {
        if (!confirm("Opravdu chcete smazat tuto otázku?")) return;
        const { error } = await supabase
            .from("lesson_qa")
            .delete()
            .eq("id", id);
        if (!error) {
            setQaRows((prev) => prev.filter((r) => r.id !== id));
        }
    }

    // Dokončení lekce
    async function toggleComplete() {
        setCompleting(true);
        const newStatus = status === "completed" ? "bookmark" : "completed";

        const { error } = await supabase
            .from("lesson_progress")
            .upsert(
                {
                    student_id: studentId,
                    lesson_id: lesson.id,
                    status: newStatus,
                } as any,
                { onConflict: "student_id,lesson_id" },
            );

        if (!error) {
            setStatus(newStatus);
            if (newStatus === "completed") {
                const idx = allLessons.findIndex((l) => l.id === lesson.id);
                const next = allLessons[idx + 1];
                if (next && !next.locked) {
                    window.location.href = `/student/modules/${moduleId}/lessons/${next.id}`;
                } else {
                    window.location.href = `/student/modules/${moduleId}`;
                }
            }
        }
        setCompleting(false);
    }

    return (
        <DarkLayout profile={profile} activeRoute="modules" wide={true}>
            <style>{`
        .vl-lesson:hover { background: rgba(255,255,255,0.05) !important; }
        .vl-tab { transition: all 0.15s; cursor: pointer; border: none; background: none; font-family: inherit; outline: none; }
        .vl-tab:hover { color: #fff !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

            {/* Grid rozvržení: Obsah vlevo, panel lekcí vpravo */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 320px",
                    minHeight: "calc(100vh - 64px)",
                    background: D.bgMain,
                }}
            >
                {/* ── LEVÁ ČÁST: VIDEO A DETAILY ───────────────────────────────────── */}
                <div
                    style={{
                        padding: "32px 40px",
                        overflowY: "auto",
                        borderRight: `1px solid ${D.border}`,
                    }}
                >
                    {/* Breadcrumbs */}
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
                            fontSize: 28,
                            fontWeight: 800,
                            color: D.txtPri,
                            marginBottom: 8,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {lesson.title}
                    </h1>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            marginBottom: 24,
                        }}
                    >
                        {lesson.video_author && (
                            <div
                                style={{
                                    fontSize: 13,
                                    color: D.txtSec,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                <span style={{ opacity: 0.5 }}>Lektor:</span>
                                <span
                                    style={{ color: D.txtPri, fontWeight: 600 }}
                                >
                                    {lesson.video_author}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* VIDEO PŘEHRÁVAČ */}
                    <div
                        style={{
                            position: "relative",
                            background: "#000",
                            borderRadius: 16,
                            overflow: "hidden",
                            marginBottom: 32,
                            aspectRatio: "16/9",
                            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                            border: `1px solid ${D.border}`,
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
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
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
                                    Video formát není podporován nebo URL chybí.
                                </div>
                            )}
                    </div>

                    {/* PŘEPÍNAČ TABŮ */}
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            borderBottom: `1px solid ${D.border}`,
                            marginBottom: 24,
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
                                        activeTab === tab.id ? 700 : 500,
                                    color:
                                        activeTab === tab.id
                                            ? "#fff"
                                            : D.txtSec,
                                    borderBottom: `2px solid ${activeTab === tab.id ? accent : "transparent"}`,
                                    marginBottom: "-1px",
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* OBSAH TABŮ */}
                    <div style={{ minHeight: 300, paddingBottom: 40 }}>
                        {activeTab === "transcript" && (
                            <div
                                style={{
                                    maxHeight: 500,
                                    overflowY: "auto",
                                    paddingRight: 12,
                                }}
                            >
                                {transcriptLines.length === 0 ? (
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "40px 0",
                                            color: D.txtSec,
                                        }}
                                    >
                                        K tomuto videu zatím není k dispozici
                                        přepis.
                                    </div>
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
                                                gap: 16,
                                                padding: "10px 14px",
                                                borderRadius: 10,
                                                background:
                                                    i === activeLineIdx
                                                        ? accent + "15"
                                                        : "transparent",
                                                marginBottom: 2,
                                                transition: "background 0.2s",
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
                                                        flexShrink: 0,
                                                        paddingTop: 2,
                                                    }}
                                                >
                                                    {fmt(line.time)}
                                                </span>
                                            )}
                                            <span
                                                style={{
                                                    fontSize: 15,
                                                    color:
                                                        i === activeLineIdx
                                                            ? D.txtPri
                                                            : D.txtSec,
                                                    lineHeight: 1.6,
                                                    fontWeight:
                                                        i === activeLineIdx
                                                            ? 500
                                                            : 400,
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
                            <div style={{ maxWidth: 800 }}>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={10}
                                    placeholder="Zde si můžete psát poznámky k lekci. Ukládají se automaticky při kliknutí na tlačítko."
                                    style={{
                                        width: "100%",
                                        padding: "20px",
                                        background: D.bgCard,
                                        border: `1px solid ${D.border}`,
                                        borderRadius: 14,
                                        color: "#fff",
                                        fontSize: 15,
                                        lineHeight: 1.7,
                                        fontFamily: "inherit",
                                        outline: "none",
                                        resize: "vertical",
                                    }}
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        marginTop: 16,
                                    }}
                                >
                                    <button
                                        onClick={saveNotes}
                                        disabled={notesSaving}
                                        style={{
                                            padding: "12px 24px",
                                            background: accent,
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 10,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                            fontSize: 14,
                                        }}
                                    >
                                        {notesSaving
                                            ? "Ukládám..."
                                            : "💾 Uložit poznámky"}
                                    </button>
                                    {notesSaved && (
                                        <span
                                            style={{
                                                color: D.success,
                                                fontSize: 13,
                                                fontWeight: 600,
                                            }}
                                        >
                                            ✓ Poznámky byly uloženy
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === "qa" && (
                            <div style={{ maxWidth: 800 }}>
                                {/* Input pro novou otázku */}
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 16,
                                        padding: "20px",
                                        background: D.bgCard,
                                        borderRadius: 16,
                                        border: `1px solid ${D.border}`,
                                        marginBottom: 32,
                                    }}
                                >
                                    <Avatar
                                        src={profile?.avatar_url}
                                        name={profile?.full_name}
                                        size={40}
                                        accent={accent}
                                    />
                                    <div
                                        style={{
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12,
                                        }}
                                    >
                                        <textarea
                                            value={qaText}
                                            onChange={(e) =>
                                                setQaText(e.target.value)
                                            }
                                            placeholder="Máte dotaz k této lekci? Zeptejte se lektora nebo ostatních..."
                                            style={{
                                                width: "100%",
                                                background: "transparent",
                                                border: "none",
                                                color: "#fff",
                                                fontSize: 15,
                                                outline: "none",
                                                resize: "none",
                                                minHeight: 60,
                                                fontFamily: "inherit",
                                            }}
                                        />
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "flex-end",
                                            }}
                                        >
                                            <button
                                                onClick={postQuestion}
                                                disabled={
                                                    qaPosting || !qaText.trim()
                                                }
                                                style={{
                                                    padding: "10px 24px",
                                                    background: accent,
                                                    color: "#fff",
                                                    border: "none",
                                                    borderRadius: 10,
                                                    fontWeight: 700,
                                                    cursor:
                                                        qaPosting ||
                                                        !qaText.trim()
                                                            ? "not-allowed"
                                                            : "pointer",
                                                    opacity:
                                                        qaPosting ||
                                                        !qaText.trim()
                                                            ? 0.5
                                                            : 1,
                                                }}
                                            >
                                                {qaPosting
                                                    ? "Posílám..."
                                                    : "Odeslat dotaz"}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Seznam otázek */}
                                {qaLoading ? (
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "20px",
                                            color: D.txtSec,
                                        }}
                                    >
                                        Načítám diskusi...
                                    </div>
                                ) : qaRows.length === 0 ? (
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "40px 0",
                                            color: D.txtSec,
                                            background: D.bgCard,
                                            borderRadius: 16,
                                            border: `1px dotted ${D.border}`,
                                        }}
                                    >
                                        Zatím zde nejsou žádné otázky. Buďte
                                        první!
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 16,
                                        }}
                                    >
                                        {qaRows.map((row) => {
                                            const prof = Array.isArray(
                                                row.profiles,
                                            )
                                                ? row.profiles[0]
                                                : row.profiles;
                                            return (
                                                <div
                                                    key={row.id}
                                                    style={{
                                                        display: "flex",
                                                        gap: 16,
                                                        padding: "20px",
                                                        background: D.bgCard,
                                                        borderRadius: 16,
                                                        border: `1px solid ${D.border}`,
                                                    }}
                                                >
                                                    <Avatar
                                                        src={prof?.avatar_url}
                                                        name={prof?.full_name}
                                                        size={36}
                                                        accent={
                                                            prof?.accent_color
                                                        }
                                                    />
                                                    <div style={{ flex: 1 }}>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                justifyContent:
                                                                    "space-between",
                                                                marginBottom: 6,
                                                                alignItems:
                                                                    "center",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    gap: 8,
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontSize: 14,
                                                                        fontWeight: 700,
                                                                        color: D.txtPri,
                                                                    }}
                                                                >
                                                                    {
                                                                        prof?.full_name
                                                                    }
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        fontSize: 11,
                                                                        color: D.txtSec,
                                                                    }}
                                                                >
                                                                    {new Date(
                                                                        row.created_at,
                                                                    ).toLocaleDateString(
                                                                        "cs-CZ",
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {row.student_id ===
                                                                studentId && (
                                                                <button
                                                                    onClick={() =>
                                                                        deleteQuestion(
                                                                            row.id,
                                                                        )
                                                                    }
                                                                    style={{
                                                                        background:
                                                                            "none",
                                                                        border: "none",
                                                                        color: D.danger,
                                                                        fontSize: 12,
                                                                        cursor: "pointer",
                                                                        opacity: 0.7,
                                                                    }}
                                                                >
                                                                    Smazat
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p
                                                            style={{
                                                                fontSize: 15,
                                                                color: D.txtPri,
                                                                lineHeight: 1.6,
                                                                margin: 0,
                                                                whiteSpace:
                                                                    "pre-wrap",
                                                            }}
                                                        >
                                                            {row.question}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── PRAVÁ ČÁST: SEZNAM LEKCÍ (SIDEBAR) ───────────────────────────── */}
                <div
                    style={{
                        background: D.bgCard,
                        display: "flex",
                        flexDirection: "column",
                        height: "calc(100vh - 64px)",
                        position: "sticky",
                        top: 0,
                    }}
                >
                    {/* Hlavička modulu */}
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
                                letterSpacing: "0.05em",
                                marginBottom: 6,
                            }}
                        >
                            Právě sledujete
                        </div>
                        <div
                            style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: D.txtPri,
                                lineHeight: 1.3,
                            }}
                        >
                            {lesson.module_title}
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: D.txtSec,
                                marginTop: 8,
                            }}
                        >
                            {allLessons.length} lekcí v tomto modulu
                        </div>
                    </div>

                    {/* Scrollable seznam lekcí */}
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
                                        gap: 12,
                                        padding: "14px 20px",
                                        textDecoration: "none",
                                        borderLeft: `3px solid ${isActive ? accent : "transparent"}`,
                                        background: isActive
                                            ? accent + "10"
                                            : "transparent",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: "50%",
                                            background: isDone
                                                ? D.success + "20"
                                                : isActive
                                                  ? accent + "20"
                                                  : D.bgMid,
                                            color: isDone
                                                ? D.success
                                                : isActive
                                                  ? accent
                                                  : D.txtSec,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            flexShrink: 0,
                                            border: isActive
                                                ? `1px solid ${accent}40`
                                                : "none",
                                        }}
                                    >
                                        {isDone ? "✓" : i + 1}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: isActive ? "#fff" : D.txtSec,
                                            fontWeight: isActive ? 600 : 400,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {l.title}
                                    </span>
                                </a>
                            );
                        })}
                    </div>

                    {/* Footer s tlačítkem dokončení */}
                    <div
                        style={{
                            padding: "20px",
                            borderTop: `1px solid ${D.border}`,
                            background: D.bgCard,
                        }}
                    >
                        {status === "completed" ? (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 10,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "14px",
                                        background: D.success + "10",
                                        border: `1px solid ${D.success}30`,
                                        borderRadius: 12,
                                        color: D.success,
                                        fontSize: 14,
                                        fontWeight: 700,
                                        justifyContent: "center",
                                    }}
                                >
                                    <span>✓</span> LEKCE DOKONČENA
                                </div>
                                <button
                                    onClick={toggleComplete}
                                    disabled={completing}
                                    style={{
                                        padding: "8px",
                                        background: "transparent",
                                        color: D.txtSec,
                                        border: `1px solid ${D.border}`,
                                        borderRadius: 10,
                                        fontSize: 12,
                                        cursor: "pointer",
                                        fontWeight: 600,
                                    }}
                                >
                                    {completing
                                        ? "..."
                                        : "↩ Označit jako nedokončené"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={toggleComplete}
                                disabled={completing}
                                style={{
                                    width: "100%",
                                    padding: "16px",
                                    background: accent,
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 12,
                                    fontSize: 15,
                                    fontWeight: 800,
                                    cursor: completing
                                        ? "not-allowed"
                                        : "pointer",
                                    boxShadow: `0 10px 20px ${accent}30`,
                                    transition: "transform 0.2s, opacity 0.2s",
                                }}
                                onMouseDown={(e) =>
                                    (e.currentTarget.style.transform =
                                        "scale(0.98)")
                                }
                                onMouseUp={(e) =>
                                    (e.currentTarget.style.transform =
                                        "scale(1)")
                                }
                            >
                                {completing
                                    ? "Zpracovávám..."
                                    : "DOKONČIT LEKCI →"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </DarkLayout>
    );
}
