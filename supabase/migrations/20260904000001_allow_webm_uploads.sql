-- Real blocker found while wiring up in-app recording (CameraCalibration.tsx):
-- MediaRecorder in the browser only produces webm, but the player-videos
-- bucket's allowed_mime_types never included video/webm -- every recorded
-- upload would have been rejected outright at the storage layer, before
-- ever reaching the app's own upload route.

update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm']
where id = 'player-videos';
