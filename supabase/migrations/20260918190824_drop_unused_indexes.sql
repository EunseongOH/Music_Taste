-- 쓰이지 않는 인덱스 3개를 뺀다. 데이터는 그대로다. 필요하면 아래 주석의 문장으로 되살린다.
--   idx_mb_release_track_recording  17MB · 사용 5회 (녹음 ID 로 조회하는 코드가 없다)
--   mb_rg_release_release          4.9MB · 사용 0회
--   mb_rg_release_pending          1.5MB · 사용 0회 (mb_rg_release_queue 가 대신한다)
--
-- 되살리는 문장:
--   create index idx_mb_release_track_recording on public.mb_release_track (recording_mbid);
--   create index mb_rg_release_release on public.mb_rg_release (release_mbid);
--   create index mb_rg_release_pending on public.mb_rg_release (tracks_filled_at) where tracks_filled_at is null;
drop index if exists public.idx_mb_release_track_recording;
drop index if exists public.mb_rg_release_release;
drop index if exists public.mb_rg_release_pending;
