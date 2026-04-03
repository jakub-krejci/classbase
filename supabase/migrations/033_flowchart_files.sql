-- Flowchart files bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('flowchart-files', 'flowchart-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: students can CRUD their own files
CREATE POLICY "flowchart_student_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'flowchart-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "flowchart_student_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flowchart-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "flowchart_student_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'flowchart-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "flowchart_student_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'flowchart-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
