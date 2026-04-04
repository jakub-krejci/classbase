INSERT INTO storage.buckets (id, name, public)
VALUES ('microbit-files', 'microbit-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mb_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'microbit-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "mb_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'microbit-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "mb_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'microbit-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "mb_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'microbit-files' AND (storage.foldername(name))[1] = 'zaci' AND (storage.foldername(name))[2] = auth.uid()::text);
