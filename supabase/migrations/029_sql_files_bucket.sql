-- SQL editor files storage
-- Files: sql-files/zaci/{student_id}/{project}/database.db + *.sql scripts

DROP POLICY IF EXISTS "sql_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "sql_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "sql_files_update"  ON storage.objects;
DROP POLICY IF EXISTS "sql_files_delete"  ON storage.objects;
DROP POLICY IF EXISTS "view_sql_buckets"  ON storage.buckets;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sql-files', 'sql-files', false, 20971520,
  ARRAY['text/plain','application/octet-stream','application/x-sqlite3']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "view_sql_buckets" ON storage.buckets
  FOR SELECT TO authenticated USING (id = 'sql-files');

CREATE POLICY "sql_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sql-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "sql_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sql-files' AND
    (storage.foldername(name))[1] = 'zaci' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "sql_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'sql-files' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "sql_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sql-files' AND (storage.foldername(name))[2] = auth.uid()::text);
