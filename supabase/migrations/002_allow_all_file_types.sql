-- 002_allow_all_file_types.sql
--
-- Dus Chat attachments: any file type can be sent (PDF, ZIP, audio, video,
-- documents, ...). Only .txt files open in the popup viewer; every other
-- file is a download attachment. Images still show inline.
--
-- Setting allowed_mime_types to NULL removes the MIME restriction entirely
-- (the bucket stays private, 10 MB per file, and storage RLS is unchanged).
-- The app still compresses images and caps .txt files at 2 MB / other files
-- at 10 MB before upload.

update storage.buckets
set allowed_mime_types = null
where id = 'chat-files';
