-- Fix infinite recursion in tests RLS policies
-- The student read policy was referencing tests from within a tests policy

-- Drop all existing tests policies
drop policy if exists "tests_teacher_all" on public.tests;
drop policy if exists "tests_student_read" on public.tests;

-- Teacher: full access to own tests (simple, no recursion)
create policy "tests_teacher_all" on public.tests for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- Student: read published tests assigned to them
-- Use security definer function to avoid recursion
create or replace function public.student_can_access_test(test_id uuid, student_uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.test_assignments ta
    where ta.test_id = $1 and ta.student_id = $2
  ) or exists (
    select 1 from public.test_assignments ta
    join public.group_members gm on gm.group_id = ta.group_id
    where ta.test_id = $1 and gm.student_id = $2
  )
$$;

create policy "tests_student_read" on public.tests for select
  using (
    status = 'published'
    and public.student_can_access_test(id, auth.uid())
  );

-- Also fix test_questions student policy (same issue)
drop policy if exists "test_questions_student" on public.test_questions;
create policy "test_questions_student" on public.test_questions for select
  using (
    exists (
      select 1 from public.tests t
      where t.id = test_id
        and t.status = 'published'
        and t.teacher_id != auth.uid()
    )
  );

-- Fix test_question_options student policy
drop policy if exists "test_options_student" on public.test_question_options;
create policy "test_options_student" on public.test_question_options for select
  using (
    exists (
      select 1 from public.test_questions q
      join public.tests t on t.id = q.test_id
      where q.id = question_id
        and t.status = 'published'
        and t.teacher_id != auth.uid()
    )
  );
