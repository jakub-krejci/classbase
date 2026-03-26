-- ============================================================
-- ClassBase — Create lesson-assets storage bucket
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Create the public bucket for lesson assets (images, videos, files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-assets',
  'lesson-assets',
  true,
  52428800,  -- 50MB limit
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800;

-- Allow authenticated users to upload files
drop policy if exists "lesson_assets_upload" on storage.objects;
create policy "lesson_assets_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'lesson-assets'
    and auth.role() = 'authenticated'
  );

-- Allow public read access
drop policy if exists "lesson_assets_read" on storage.objects;
create policy "lesson_assets_read"
  on storage.objects for select
  using (bucket_id = 'lesson-assets');

-- Allow users to delete their own uploads
drop policy if exists "lesson_assets_delete" on storage.objects;
create policy "lesson_assets_delete"
  on storage.objects for delete
  using (
    bucket_id = 'lesson-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
