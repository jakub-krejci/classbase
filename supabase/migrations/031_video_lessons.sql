-- Add video lesson support to lessons table
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_type text NOT NULL DEFAULT 'text'
    CHECK (lesson_type IN ('text', 'video')),
  ADD COLUMN IF NOT EXISTS video_url    text,
  ADD COLUMN IF NOT EXISTS video_author text,
  ADD COLUMN IF NOT EXISTS transcript   text;
