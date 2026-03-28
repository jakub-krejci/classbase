-- Add starter_code to test_questions for coding question type
alter table public.test_questions
  add column if not exists starter_code text not null default '';

-- Extend type check to include 'coding'
alter table public.test_questions
  drop constraint if exists test_questions_type_check;

alter table public.test_questions
  add constraint test_questions_type_check
  check (type in ('single','multiple','descriptive','truefalse','coding'));
