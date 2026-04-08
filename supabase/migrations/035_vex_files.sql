-- 035: VEX IQ files storage bucket
insert into storage.buckets (id, name, public)
values ('vex-files', 'vex-files', false)
on conflict (id) do nothing;

-- RLS: students can only access their own files under zaci/{uid}/
create policy "vex student read own"
  on storage.objects for select
  using (
    bucket_id = 'vex-files'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

create policy "vex student insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'vex-files'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

create policy "vex student update own"
  on storage.objects for update
  using (
    bucket_id = 'vex-files'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

create policy "vex student delete own"
  on storage.objects for delete
  using (
    bucket_id = 'vex-files'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );
