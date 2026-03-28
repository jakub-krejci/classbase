-- Track total time spent on a test attempt
alter table public.test_attempts
  add column if not exists time_spent_secs integer;
