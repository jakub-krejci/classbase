-- Fix lesson_progress status constraint
-- Migration 001 created status column with check ('submitted','graded')
-- Migration 004 tried to add the column again (no-op) but never fixed the constraint
-- This migration drops the old constraint and replaces it with the correct one

-- Drop old constraint (name may vary, try both common names)
ALTER TABLE public.lesson_progress
  DROP CONSTRAINT IF EXISTS lesson_progress_status_check;

ALTER TABLE public.lesson_progress
  DROP CONSTRAINT IF EXISTS lesson_progress_status_check1;

-- Also handles case where constraint was auto-named
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.lesson_progress'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lesson_progress DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
  END IF;
END $$;

-- Change default and add correct constraint
ALTER TABLE public.lesson_progress
  ALTER COLUMN status SET DEFAULT 'completed',
  ADD CONSTRAINT lesson_progress_status_check
    CHECK (status IN ('completed', 'bookmark', 'submitted', 'graded'));
