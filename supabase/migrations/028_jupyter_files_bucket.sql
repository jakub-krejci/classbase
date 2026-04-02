-- Jupyter Notebook files storage
-- Files: jupyter-files/zaci/{student_id}/{project}/{notebook}.ipynb
-- Folders: jupyter-files/zaci/{student_id}/{project}/{folder}/...

DROP POLICY IF EXISTS "jupyter_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "jupyter_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "jupyter_files_update"  ON storage.objects;
DROP POLICY IF EXISTS "jupyter_files_delete"  ON storage.objects;
DROP POLICY IF EXISTS "view_jupyter_buckets"  ON storage.buckets;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jupyter-files', 'jupyter-files', false, 10485760,
  ARRAY['text/plain','text/csv','application/json','application/octet-stream',
        'image/png','image/jpeg','image/gif','image/webp','image/svg+xml',
        'text/x-python','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "view_jupyter_buckets" ON storage.buckets
  FOR SELECT TO authenticated USING (id = 'jupyter-files');

CREATE POLICY "jupyter_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'jupyter-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "jupyter_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'jupyter-files' AND
    (storage.foldername(name))[1] = 'zaci' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "jupyter_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'jupyter-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "jupyter_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'jupyter-files' AND (storage.foldername(name))[2] = auth.uid()::text);
