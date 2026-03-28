-- Add time_mode to tests table
alter table public.tests
  add column if not exists time_mode text not null default 'none'
  check (time_mode in ('none', 'total', 'per_question'));
