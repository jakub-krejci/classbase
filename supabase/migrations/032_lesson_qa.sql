-- Dedicated Q&A table for video lessons
CREATE TABLE IF NOT EXISTS public.lesson_qa (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id   uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question    text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_qa_lesson_idx ON public.lesson_qa(lesson_id);

ALTER TABLE public.lesson_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_select" ON public.lesson_qa FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_insert" ON public.lesson_qa FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "qa_delete" ON public.lesson_qa FOR DELETE TO authenticated USING (auth.uid() = student_id);
