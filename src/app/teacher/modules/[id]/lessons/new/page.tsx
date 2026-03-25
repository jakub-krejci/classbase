'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'next/navigation'
import LessonEditorPage from '../[lessonId]/page'

// /teacher/modules/[id]/lessons/new  →  reuses the same editor with lessonId="new"
export default function NewLessonPage() {
  return <LessonEditorPage />
}
