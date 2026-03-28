-- Teachers need to be able to update attempts (unlock, manual grade adjustment)
drop policy if exists "test_attempts_teacher" on public.test_attempts;

-- SELECT: teachers can read attempts for their tests
create policy "test_attempts_teacher_select" on public.test_attempts for select
  using (
    exists (
      select 1 from public.tests t
      where t.id = test_id and t.teacher_id = auth.uid()
    )
  );

-- UPDATE: teachers can update attempts for their tests (unlock, grade)
create policy "test_attempts_teacher_update" on public.test_attempts for update
  using (
    exists (
      select 1 from public.tests t
      where t.id = test_id and t.teacher_id = auth.uid()
    )
  );
