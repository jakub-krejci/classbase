-- Add scroll progress percentage and student notes to lesson_progress
-- Run in Supabase SQL Editor

alter table public.lesson_progress
  add column if not exists scroll_pct integer not null default 0
    check (scroll_pct between 0 and 100),
  add column if not exists notes text not null default '';
