-- ============================================================
-- ClassBase — Fix infinite recursion in RLS policies
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- Drop ALL existing policies to start clean
do $$
declare
  r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── PROFILES ─────────────────────────────────────────────────
create policy "profiles_select"
  on public.profiles for select using (true);

create policy "profiles_insert"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles_update"
  on public.profiles for update using (auth.uid() = id);

-- ── MODULES ──────────────────────────────────────────────────
-- Teachers: full control
create policy "modules_teacher"
  on public.modules for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- All authenticated users can select (for access-code lookup and student view)
create policy "modules_authenticated_select"
  on public.modules for select
  using (auth.role() = 'authenticated');

-- ── LESSONS ──────────────────────────────────────────────────
-- Use a direct join to modules — avoids the circular reference
create policy "lessons_teacher"
  on public.lessons for all
  using (
    exists (
      select 1 from public.modules
      where modules.id = lessons.module_id
        and modules.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.modules
      where modules.id = lessons.module_id
        and modules.teacher_id = auth.uid()
    )
  );

create policy "lessons_student_select"
  on public.lessons for select
  using (
    exists (
      select 1 from public.enrollments
      where enrollments.module_id = lessons.module_id
        and enrollments.student_id = auth.uid()
    )
  );

-- ── ASSIGNMENTS ───────────────────────────────────────────────
create policy "assignments_teacher"
  on public.assignments for all
  using (
    exists (
      select 1 from public.modules
      where modules.id = assignments.module_id
        and modules.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.modules
      where modules.id = assignments.module_id
        and modules.teacher_id = auth.uid()
    )
  );

create policy "assignments_student_select"
  on public.assignments for select
  using (
    exists (
      select 1 from public.enrollments
      where enrollments.module_id = assignments.module_id
        and enrollments.student_id = auth.uid()
    )
  );

-- ── ENROLLMENTS ───────────────────────────────────────────────
create policy "enrollments_student_insert"
  on public.enrollments for insert
  with check (auth.uid() = student_id);

create policy "enrollments_student_select"
  on public.enrollments for select
  using (auth.uid() = student_id);

create policy "enrollments_teacher_select"
  on public.enrollments for select
  using (
    exists (
      select 1 from public.modules
      where modules.id = enrollments.module_id
        and modules.teacher_id = auth.uid()
    )
  );

-- ── LESSON PROGRESS ───────────────────────────────────────────
create policy "progress_student"
  on public.lesson_progress for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

create policy "progress_teacher_select"
  on public.lesson_progress for select
  using (
    exists (
      select 1 from public.lessons
      join public.modules on modules.id = lessons.module_id
      where lessons.id = lesson_progress.lesson_id
        and modules.teacher_id = auth.uid()
    )
  );

-- ── SUBMISSIONS ───────────────────────────────────────────────
create policy "submissions_student"
  on public.submissions for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

create policy "submissions_teacher_select"
  on public.submissions for select
  using (
    exists (
      select 1 from public.assignments
      join public.modules on modules.id = assignments.module_id
      where assignments.id = submissions.assignment_id
        and modules.teacher_id = auth.uid()
    )
  );

create policy "submissions_teacher_update"
  on public.submissions for update
  using (
    exists (
      select 1 from public.assignments
      join public.modules on modules.id = assignments.module_id
      where assignments.id = submissions.assignment_id
        and modules.teacher_id = auth.uid()
    )
  );

-- ── GROUPS ───────────────────────────────────────────────────
create policy "groups_teacher"
  on public.groups for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "group_members_teacher"
  on public.group_members for all
  using (
    exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.teacher_id = auth.uid()
    )
  );

create policy "group_members_student_select"
  on public.group_members for select
  using (auth.uid() = student_id);

-- ── MESSAGES ─────────────────────────────────────────────────
create policy "messages_teacher_insert"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "messages_select"
  on public.messages for select
  using (
    auth.uid() = sender_id
    or recipient_type = 'all'
    or (recipient_type = 'student' and recipient_id = auth.uid())
    or (recipient_type = 'group' and exists (
      select 1 from public.group_members
      where group_members.group_id = messages.recipient_id
        and group_members.student_id = auth.uid()
    ))
  );
