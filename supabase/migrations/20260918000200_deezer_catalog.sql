-- Deezer 카탈로그. 출처가 분리되도록 deezer_* 테이블에만 넣는다. 적용일 2026-09-18.
-- 사용자 결정(2026-09-18): 비상업 전제의 Deezer 약관을 알고도 당분간 사용한다.
-- 수익화(광고 등)를 시작하면 이 테이블들을 지우고 그 출처 데이터를 서비스에서 뺀다.
-- 이미지·미리듣기 URL 은 저장하지 않는다. additive-only.
CREATE TABLE IF NOT EXISTS public.deezer_artist (
    deezer_artist_id BIGINT PRIMARY KEY,
    mbid             UUID,
    name             TEXT NOT NULL,
    nb_album         INT,
    nb_fan           BIGINT,
    matched_by       TEXT,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deezer_artist_mbid ON public.deezer_artist (mbid);

CREATE TABLE IF NOT EXISTS public.deezer_album (
    deezer_album_id  BIGINT PRIMARY KEY,
    deezer_artist_id BIGINT NOT NULL,
    title            TEXT NOT NULL,
    release_date     TEXT,
    record_type      TEXT,
    nb_tracks        INT,
    upc              TEXT,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deezer_album_artist ON public.deezer_album (deezer_artist_id);

CREATE TABLE IF NOT EXISTS public.deezer_track (
    deezer_album_id BIGINT NOT NULL,
    idx             INT NOT NULL,
    disk            INT,
    position        INT,
    title           TEXT NOT NULL,
    duration_s      INT,
    isrc            TEXT,
    deezer_track_id BIGINT,
    PRIMARY KEY (deezer_album_id, idx)
);

CREATE TABLE IF NOT EXISTS public.deezer_album_match (
    spotify_album_id TEXT PRIMARY KEY,
    deezer_album_id  BIGINT NOT NULL,
    verified         TEXT,
    matched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deezer_artist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deezer_album ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deezer_track ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deezer_album_match ENABLE ROW LEVEL SECURITY;
