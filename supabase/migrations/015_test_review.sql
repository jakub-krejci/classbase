-- Add teacher review fields to test_answers
alter table public.test_answers
  add column if not exists teacher_points  numeric,
  add column if not exists teacher_note    text,
  add column if not exists reviewed_at     timestamptz;

-- Add reviewed flag and feedback to attempts  
alter table public.test_attempts
  add column if not exists reviewed_at    timestamptz,
  add column if not exists teacher_feedback text,
  add column if not exists final_score    numeric;

-- Teachers can update answers (for grading notes/points)
create policy "test_answers_teacher_update" on public.test_answers for update
  using (
    exists (
      select 1 from public.test_attempts a
      join public.tests t on t.id = a.test_id
      where a.id = attempt_id and t.teacher_id = auth.uid()
    )
  );
