-- 전곡 모드 첫 화면의 장르별 아티스트를 운영 코드 변경 없이 정한다. additive-only.
--
-- 운영(main) searchArtistsByGenres 는 spotify_cache_artists(locale='ko', expires_at > now) 중
-- genres @> [장르ID] 인 행을 장르당 17개 읽고, 모자라면 Spotify 검색을 부른다. Spotify 가 2026-02 이후
-- 장르를 주지 않아 태그가 비어 있었다. 선정한 아티스트 행에 우리 장르 ID 를 태그로 붙인다.
-- 검색 결과 저장(saveArtistsToDbCache)이 genres 를 [] 로 덮어쓰므로 10분마다 다시 붙인다.
-- 만료 시각(expires_at)은 건드리지 않는다 — Spotify 임시 캐시 수명은 그대로 둔다.

CREATE TABLE IF NOT EXISTS public.explore_genre_picks (
    genre      TEXT NOT NULL,
    spotify_id TEXT NOT NULL,
    rank       INT  NOT NULL,
    name       TEXT,
    picked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (genre, spotify_id)
);
ALTER TABLE public.explore_genre_picks ENABLE ROW LEVEL SECURITY;

-- 선정 결과 교체 (스크립트가 호출)
CREATE OR REPLACE FUNCTION public.replace_explore_genre_picks(picks JSONB)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE n INT;
BEGIN
    DELETE FROM public.explore_genre_picks WHERE TRUE;  -- pg_safeupdate 는 WHERE 없는 DELETE 를 막는다
    INSERT INTO public.explore_genre_picks (genre, spotify_id, rank, name)
    SELECT p->>'genre', p->>'spotify_id', (p->>'rank')::INT, p->>'name'
    FROM jsonb_array_elements(picks) p;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- 태그 반영: 선정된 아티스트의 ko 캐시 행 genres 를 선정 장르 목록으로 맞춘다
CREATE OR REPLACE FUNCTION public.apply_explore_genre_tags()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE n INT;
BEGIN
    UPDATE public.spotify_cache_artists a
       SET genres = t.tags
      FROM (SELECT spotify_id, to_jsonb(array_agg(genre ORDER BY genre)) AS tags
              FROM public.explore_genre_picks GROUP BY spotify_id) t
     WHERE a.id = t.spotify_id
       AND a.locale = 'ko'
       AND a.genres IS DISTINCT FROM t.tags;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_explore_genre_picks(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_explore_genre_tags() FROM PUBLIC;

-- 끄기: SELECT cron.unschedule('explore-genre-tags');
SELECT cron.schedule('explore-genre-tags', '*/10 * * * *', $$SELECT public.apply_explore_genre_tags()$$);
