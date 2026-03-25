-- Add status column to lesson_progress for bookmark feature (#12)
-- Run in Supabase SQL Editor
alter table public.lesson_progress
  add column if not exists status text not null default 'completed'
  check (status in ('completed', 'bookmark'));
