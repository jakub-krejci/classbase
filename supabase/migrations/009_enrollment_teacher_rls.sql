-- Teachers need to be able to update and delete enrollments for their modules
-- (for ban/remove student functionality)

create policy "enrollments_teacher_update"
  on public.enrollments for update
  using (
    exists (select 1 from public.modules m where m.id = module_id and m.teacher_id = auth.uid())
  );

create policy "enrollments_teacher_delete"
  on public.enrollments for delete
  using (
    exists (select 1 from public.modules m where m.id = module_id and m.teacher_id = auth.uid())
  );

-- Teachers can also delete lesson_progress for their modules
create policy "lesson_progress_teacher_delete"
  on public.lesson_progress for delete
  using (
    exists (
      select 1 from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_id and m.teacher_id = auth.uid()
    )
  );

-- Students (and teachers) can update their own profile's last_seen_at
-- (profiles already has update policy for own row from migration 001)
-- If it doesn't exist yet, add it:
create policy if not exists "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
