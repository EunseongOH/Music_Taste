-- 확보 현황 스냅샷 (canonical_coverage 뷰가 느려서 한 번에 집계). additive-only.
CREATE TABLE IF NOT EXISTS public.artist_coverage_snapshot (
    spotify_id         TEXT PRIMARY KEY,
    mbid               UUID,
    name               TEXT,
    name_ko            TEXT,
    country            TEXT,
    confidence         TEXT,
    albums_with_tracks INT,
    tracks             INT,
    refreshed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.artist_coverage_snapshot ENABLE ROW LEVEL SECURITY;
-- 함수 본문은 DB 에 적용된 refresh_artist_coverage_snapshot() 참고 (2026-09-17)
