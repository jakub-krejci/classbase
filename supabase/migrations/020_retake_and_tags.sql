-- Retake policy on tests
alter table public.tests
  add column if not exists max_attempts     integer,         -- null = unlimited
  add column if not exists retake_mode      text not null default 'single'
    check (retake_mode in ('single','best','practice')),     -- single=one attempt, best=keep best, practice=unlimited no grade
  add column if not exists tags             text[] not null default '{}';

-- Allow multiple attempts per student (remove unique constraint if any)
-- test_attempts already has no unique constraint, so multiple rows are fine
