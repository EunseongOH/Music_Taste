-- Phase C: canonical 음악 메타데이터 층
--
-- Spotify Developer Terms IV.3.1 은 Spotify Content 의 DB 구축·무기한 저장을 금지한다.
-- 따라서 서술적 메타데이터(이름·발매일·트랙순서)의 출처를 CC0 소스로 갈아끼운다.
--   - 뼈대/한글표기: MusicBrainz core data (CC0 = 퍼블릭 도메인)
--   - 장르:         Discogs 덤프 styles (CC0) + Wikidata P136 (CC0) + 자체 큐레이션
--   - 롱테일 보강:  VocaDB (CC BY, 상업 이용 허용)
-- Spotify 는 ID·링크·커버아트 hotlink 용 보조로만 남는다.
--
-- additive-only: 전부 신규 테이블이다. 기존 것은 아무것도 건드리지 않는다.

CREATE TABLE IF NOT EXISTS public.mb_artist (
    mbid       UUID PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_name  TEXT,
    country    TEXT,
    -- MB core data. 한글 검색의 핵심이다.
    aliases    JSONB NOT NULL DEFAULT '[]'::jsonb,
    name_ko    TEXT,
    -- 주의: MB 의 tags/genres 는 CC-BY-NC-SA 라 광고 서비스에서 쓸 수 없다.
    -- 여기 들어가는 것은 sortify 자체 16 종 장르 라벨이다.
    genres     TEXT[] NOT NULL DEFAULT '{}',
    genre_src  TEXT,      -- discogs | wikidata | curated | user
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_artist_name    ON public.mb_artist (lower(name));
CREATE INDEX IF NOT EXISTS idx_mb_artist_name_ko ON public.mb_artist (name_ko);
CREATE INDEX IF NOT EXISTS idx_mb_artist_genres  ON public.mb_artist USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_mb_artist_aliases ON public.mb_artist USING GIN (aliases);

-- Spotify 앨범 1 개 ≈ MB release-group 1 개.
-- release(각국 반) 단위로 내려가면 행이 폭발하므로 release-group 에서 멈춘다.
CREATE TABLE IF NOT EXISTS public.mb_release_group (
    mbid               UUID PRIMARY KEY,
    artist_mbid        UUID NOT NULL REFERENCES public.mb_artist(mbid) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    primary_type       TEXT,     -- Album | Single | EP
    first_release_date DATE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_rg_artist
    ON public.mb_release_group (artist_mbid, first_release_date DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.mb_recording (
    mbid               UUID PRIMARY KEY,
    release_group_mbid UUID NOT NULL REFERENCES public.mb_release_group(mbid) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    length_ms          INTEGER,
    position           INTEGER,
    isrc               TEXT,     -- 매핑 2 단계용. 워커만 채운다
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_recording_rg   ON public.mb_recording (release_group_mbid, position);
CREATE INDEX IF NOT EXISTS idx_mb_recording_isrc ON public.mb_recording (isrc) WHERE isrc IS NOT NULL;

-- canonical 층과 Spotify 층을 잇는 유일한 다리.
-- confidence 가 url_rel 인 행만 자동 채택한다 (실측 정확도 100%).
-- name 은 실측 57% 라 격리해두고 자동 채택하지 않는다.
CREATE TABLE IF NOT EXISTS public.mb_spotify_map (
    spotify_id TEXT PRIMARY KEY,
    entity     TEXT NOT NULL CHECK (entity IN ('artist','album','track')),
    mbid       UUID NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('url_rel','isrc','name','manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_spotify_map_mbid   ON public.mb_spotify_map (mbid);
CREATE INDEX IF NOT EXISTS idx_mb_spotify_map_entity ON public.mb_spotify_map (entity, confidence);

-- Phase D 의 lazy-fill 큐. 읽기 경로에서 canonical miss 시 fire-and-forget 으로 넣는다.
CREATE TABLE IF NOT EXISTS public.mb_resolve_queue (
    spotify_id TEXT PRIMARY KEY,
    entity     TEXT NOT NULL,
    hint       TEXT,       -- 아티스트명 등. MB 이름 검색 폴백용
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_resolve_queue_attempts ON public.mb_resolve_queue (attempts, created_at);

-- 커버아트 컬럼을 두지 않는다. CAA URL 은 mbid 로부터 계산된다:
--   https://coverartarchive.org/release-group/{mbid}/front-500
-- CAA 커버리지는 66% 이고 편차가 크므로 없으면 Spotify CDN hotlink 로 폴백한다.

ALTER TABLE public.mb_artist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mb_release_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mb_recording     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mb_spotify_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mb_resolve_queue ENABLE ROW LEVEL SECURITY;

-- 읽기는 공개(익명 사용자도 아티스트 목록을 봐야 한다), 쓰기는 service_role 만.
CREATE POLICY mb_artist_read        ON public.mb_artist        FOR SELECT USING (true);
CREATE POLICY mb_release_group_read ON public.mb_release_group FOR SELECT USING (true);
CREATE POLICY mb_recording_read     ON public.mb_recording     FOR SELECT USING (true);
CREATE POLICY mb_spotify_map_read   ON public.mb_spotify_map   FOR SELECT USING (true);
