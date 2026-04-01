-- Web editor files storage (HTML/CSS/JS projects)
-- Files stored at: web-files/zaci/{student_id}/{project}/index.html|style.css|script.js

DROP POLICY IF EXISTS "web_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "web_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "web_files_update"  ON storage.objects;
DROP POLICY IF EXISTS "web_files_delete"  ON storage.objects;
DROP POLICY IF EXISTS "view_web_buckets"  ON storage.buckets;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'web-files', 'web-files', false, 5242880,
  ARRAY['text/plain', 'text/html', 'text/css', 'application/javascript', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "view_web_buckets" ON storage.buckets
  FOR SELECT TO authenticated USING (id = 'web-files');

CREATE POLICY "web_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'web-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "web_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'web-files' AND
    (storage.foldername(name))[1] = 'zaci' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "web_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'web-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "web_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'web-files' AND (storage.foldername(name))[2] = auth.uid()::text);
