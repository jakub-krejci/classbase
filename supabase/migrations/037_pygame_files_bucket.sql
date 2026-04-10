-- PyGame editor files storage
-- Files stored at: pygame-files/zaci/{student_id}/{project}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pygame-files',
  'pygame-files',
  false,
  5242880,
  array['text/x-python', 'text/plain', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "pygame_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pygame-files' AND
    (storage.foldername(name))[1] = 'zaci' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "pygame_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pygame-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "pygame_files_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pygame-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "pygame_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pygame-files' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );
