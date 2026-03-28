-- Public avatars storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own avatar
create policy "avatars_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

create policy "avatars_update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
