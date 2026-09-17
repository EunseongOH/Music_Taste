-- Discogs 월간 덤프(CC0) 기반 트랙리스트. API 는 쓰지 않는다 (API 약관은 저장 제한). additive-only.
-- 적용일 2026-09-17. DB 에는 Spotify 앨범과 연결된 발매판만 올린다 (scripts/discogs-dump.ts).
CREATE TABLE IF NOT EXISTS public.mb_artist_discogs (
    mbid              UUID NOT NULL,
    discogs_artist_id BIGINT NOT NULL,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mbid, discogs_artist_id)
);
CREATE INDEX IF NOT EXISTS idx_mb_artist_discogs_did ON public.mb_artist_discogs (discogs_artist_id);

CREATE TABLE IF NOT EXISTS public.discogs_release (
    release_id        BIGINT PRIMARY KEY,
    discogs_artist_id BIGINT NOT NULL,
    master_id         BIGINT,
    is_main_release   BOOLEAN,
    title             TEXT NOT NULL,
    released          TEXT,
    country           TEXT,
    formats           TEXT[],
    genres            TEXT[],
    styles            TEXT[],
    barcode           TEXT,
    track_count       INT NOT NULL,
    dump              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discogs_release_artist ON public.discogs_release (discogs_artist_id);

CREATE TABLE IF NOT EXISTS public.discogs_track (
    release_id BIGINT NOT NULL,
    idx        INT NOT NULL,
    position   TEXT,
    title      TEXT NOT NULL,
    duration   TEXT,
    PRIMARY KEY (release_id, idx)
);

CREATE TABLE IF NOT EXISTS public.discogs_album_match (
    spotify_album_id TEXT PRIMARY KEY,
    release_id       BIGINT NOT NULL,
    matched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mb_artist_discogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discogs_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discogs_track ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discogs_album_match ENABLE ROW LEVEL SECURITY;
