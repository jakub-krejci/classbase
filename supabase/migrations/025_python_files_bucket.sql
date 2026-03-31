-- Python editor files storage
-- Files stored at: python-files/zaci/{student_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'python-files',
  'python-files',
  false,
  5242880,  -- 5 MB per file
  array['text/x-python', 'text/plain', 'application/octet-stream']
)
on conflict (id) do nothing;

-- Students can upload/read/delete only their own files
create policy "python_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'python-files' AND
    (storage.foldername(name))[1] = 'zaci' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "python_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'python-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "python_files_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'python-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "python_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'python-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );
