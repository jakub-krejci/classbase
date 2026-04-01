-- Update web-files bucket to allow image MIME types
-- Run this if images fail to upload (Supabase rejects unsupported mime types)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'text/plain', 'text/html', 'text/css', 'application/javascript',
  'application/octet-stream',
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
  'image/webp', 'image/svg+xml', 'image/x-icon', 'image/ico'
]
WHERE id = 'web-files';
