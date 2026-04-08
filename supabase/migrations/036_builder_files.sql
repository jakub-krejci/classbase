-- 036: 3D Builder files storage bucket
insert into storage.buckets (id, name, public)
values ('builder-files', 'builder-files', false)
on conflict (id) do nothing;

create policy "builder student read own"
  on storage.objects for select
  using (bucket_id = 'builder-files' and auth.uid()::text = (string_to_array(name, '/'))[2]);

create policy "builder student insert own"
  on storage.objects for insert
  with check (bucket_id = 'builder-files' and auth.uid()::text = (string_to_array(name, '/'))[2]);

create policy "builder student update own"
  on storage.objects for update
  using (bucket_id = 'builder-files' and auth.uid()::text = (string_to_array(name, '/'))[2]);

create policy "builder student delete own"
  on storage.objects for delete
  using (bucket_id = 'builder-files' and auth.uid()::text = (string_to_array(name, '/'))[2]);
