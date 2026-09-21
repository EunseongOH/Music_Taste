-- 홍보 전 사전 확보 대상. additive-only.
CREATE TABLE IF NOT EXISTS public.prelaunch_targets (
    spotify_id     TEXT PRIMARY KEY,
    name           TEXT,
    tier           TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B')),
    sources        TEXT[] NOT NULL DEFAULT '{}',
    spotify_albums INT,          -- 앨범 목록으로 확인한 Spotify 앨범 수
    albums_warmed_at TIMESTAMPTZ, -- 운영 캐시(spotify_cache_artist_albums, ko, limit 10) 채운 시각
    tracks_missing INT,          -- 운영 트랙 캐시가 없는 앨범 수
    checked_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.prelaunch_targets ENABLE ROW LEVEL SECURITY;
