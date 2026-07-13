-- Spotify 아티스트 캐시 테이블
CREATE TABLE IF NOT EXISTS public.spotify_cache_artists (
    id TEXT NOT NULL,
    locale TEXT NOT NULL,
    name TEXT NOT NULL,
    images JSONB,
    genres JSONB,
    popularity INTEGER,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, locale)
);

-- Spotify 아티스트별 앨범 목록 캐시 테이블
CREATE TABLE IF NOT EXISTS public.spotify_cache_artist_albums (
    artist_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    items JSONB NOT NULL,
    total INTEGER NOT NULL,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (artist_id, locale, "offset", "limit")
);

-- Spotify 앨범별 트랙 목록 캐시 테이블
CREATE TABLE IF NOT EXISTS public.spotify_cache_album_tracks (
    album_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    items JSONB NOT NULL,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (album_id, locale)
);

-- 인덱스 생성 (만료 기간이 지난 행의 청소 및 검색 속도 향상용)
CREATE INDEX IF NOT EXISTS idx_spotify_cache_artists_expires ON public.spotify_cache_artists (expires_at);
CREATE INDEX IF NOT EXISTS idx_spotify_cache_artist_albums_expires ON public.spotify_cache_artist_albums (expires_at);
CREATE INDEX IF NOT EXISTS idx_spotify_cache_album_tracks_expires ON public.spotify_cache_album_tracks (expires_at);
