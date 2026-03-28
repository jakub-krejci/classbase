-- Public profile opt-in for students
alter table public.profiles
  add column if not exists profile_visibility boolean not null default false,
  add column if not exists show_bio          boolean not null default false,
  add column if not exists show_status       boolean not null default true;

-- RLS: allow students to read public profiles of other students in their modules
-- (enforced at query level via enrollments join — no extra policy needed
--  since we use admin client for public profile reads)
