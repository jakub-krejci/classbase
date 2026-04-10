-- ── 039_assignments_starter.sql ──────────────────────────────────────────────
-- Přidání starter_code a bucket pro assignment soubory

alter table public.task_assignments
  add column if not exists starter_code text default '' not null,
  add column if not exists starter_filename text default '' not null;
-- starter_filename: např. 'main.py', 'index.html', 'scene.json'
-- starter_code: výchozí obsah souboru (může být prázdný)

-- Storage bucket pro assignment pracovní soubory
-- Cesta: assignments/{assignment_id}/{student_id}/work.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-files', 'assignment-files', false, 10485760, null)
on conflict (id) do nothing;

-- RLS pro assignment-files bucket
create policy "assignment_files_teacher_read"
  on storage.objects for select
  using (
    bucket_id = 'assignment-files'
    and exists (
      select 1 from public.task_assignments ta
      where ta.id::text = (string_to_array(name, '/'))[1]
      and ta.teacher_id = auth.uid()
    )
  );

create policy "assignment_files_student_all"
  on storage.objects for all
  using (
    bucket_id = 'assignment-files'
    and (string_to_array(name, '/'))[2] = auth.uid()::text
  );

create policy "assignment_files_teacher_write"
  on storage.objects for insert
  with check (
    bucket_id = 'assignment-files'
    and exists (
      select 1 from public.task_assignments ta
      where ta.id::text = (string_to_array(name, '/'))[1]
      and ta.teacher_id = auth.uid()
    )
  );
