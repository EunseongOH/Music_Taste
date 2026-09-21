-- Phase A-6: 아티스트 앨범 캐시 v2
--
-- 기존 spotify_cache_artist_albums 는 PK 가 (artist_id, locale, offset, limit) 라
-- 페이지 파라미터를 바꾸는 순간 캐시가 전멸한다. limit 을 10 -> 50 으로 올리면
-- 기존 캐시가 통째로 무효가 되므로 새 테이블로 간다.
--
-- 기존 테이블은 DROP 하지 않는다 — 배포된 main 이 계속 읽고 있다.
-- 이 테이블은 feat/canonical-db 브랜치 코드만 사용한다.

CREATE TABLE IF NOT EXISTS public.spotify_album_cache_v2 (
    artist_id  TEXT PRIMARY KEY,
    -- 절대 offset 으로 색인된 희소 배열. 아직 못 받은 구간은 null.
    items      JSONB NOT NULL,
    total      INTEGER NOT NULL,
    cached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spotify_album_cache_v2_expires
    ON public.spotify_album_cache_v2 (expires_at);

-- locale 컬럼을 두지 않는다: 앨범 제목은 원어이고, 기존 코드도 이미 locale='ko' 로
-- 하드코딩해 읽고 있어서 이 차원은 실질적으로 죽어 있었다.
