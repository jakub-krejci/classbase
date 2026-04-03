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

-- Replies to Q&A questions
CREATE TABLE IF NOT EXISTS public.lesson_qa_replies (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES public.lesson_qa(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reply       text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_qa_replies_q_idx ON public.lesson_qa_replies(question_id);

ALTER TABLE public.lesson_qa_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_replies_select" ON public.lesson_qa_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_replies_insert" ON public.lesson_qa_replies FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "qa_replies_delete" ON public.lesson_qa_replies FOR DELETE TO authenticated USING (auth.uid() = author_id);
