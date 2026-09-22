-- artist_coverage 를 화면에서 쓸 수 있게 만든다. 두 가지를 한다.
--   1) 뷰 정의를 고쳐 상관 서브쿼리를 없앤다 (결과는 완전히 같다)
--   2) 그 결과를 담은 materialized view 를 두고 화면은 그것을 읽는다
--
-- 왜: 같이 소트하기 진입이 운영에서 6~9초였다. 원인을 재 보니 두 겹이었다.
--
--   [1] 상관 서브쿼리 — 발매그룹마다 EXISTS 를 돌려 105,720번 인덱스를 찔렀다.
--       버퍼 443,791 중 401,575(90%)가 여기였다. LEFT JOIN 한 번으로 바꾸면
--       버퍼 7,704 (98% 감소), 2,809ms -> 734ms.
--
--   [2] distinct_tracks — 진짜 원인이다. count(DISTINCT unnest(h_base)) 가 트랙 해시
--       687,007행을 풀어 23.5MB 를 디스크로 정렬한다. 실측 7,315ms.
--       이건 인덱스로 해결되지 않는다. 요청마다 할 일이 아니라 배치로 할 일이다.
--
-- 정의(안 B)는 그대로다. docs/canonical-db/coverage-definition.md 가 artist_coverage 를
-- 단일 근거로 정해 뒀으므로 그 뷰를 정본으로 남기고, materialized view 는 그 뷰를
-- 그대로 복사한다 — 정의가 두 곳에 갈라지지 않게 하려는 것이다.
--
-- 갱신 주기: 매시 27분. "전곡 확보" 가 실시간이 아니게 되지만, 수집이 30분 주기라
-- 한 시간 지연은 이용자가 알아챌 수 있는 차이가 아니다.
-- REFRESH ... CONCURRENTLY 는 읽는 쪽을 막지 않는다 (그래서 UNIQUE 인덱스가 필요하다).
--
-- 추가 전용. 기존 artist_coverage 는 이름도 결과도 그대로 유지된다.

-- 1) 뷰 재정의 — 결과 동일함을 확인했다 (is_full 777 = 777, 차집합 양방향 0)
CREATE OR REPLACE VIEW public.artist_coverage AS
WITH filled_rg AS (
    -- 곡을 낼 수 있는 발매그룹을 한 번에 모은다. 예전에는 발매그룹마다 EXISTS 를 돌렸다.
    SELECT release_group_mbid FROM public.mb_rg_release WHERE tracks_filled_at IS NOT NULL
    UNION
    SELECT release_group_mbid FROM public.mb_album_release
     WHERE tracks_filled_at IS NOT NULL AND release_group_mbid IS NOT NULL
),
alb AS (
    -- Other·Broadcast·null 은 세지 않는다. 인터뷰·방송본이라 이용자가 "곡"으로 치지 않는다.
    SELECT g.artist_mbid,
           count(*) FILTER (WHERE g.primary_type IN ('Album', 'EP'))                                            AS core_albums,
           count(*) FILTER (WHERE g.primary_type IN ('Album', 'EP') AND f.release_group_mbid IS NOT NULL)       AS core_filled,
           count(*) FILTER (WHERE g.primary_type = 'Single')                                                    AS single_albums,
           count(*) FILTER (WHERE g.primary_type = 'Single' AND f.release_group_mbid IS NOT NULL)               AS single_filled
      FROM public.mb_release_group g
      LEFT JOIN filled_rg f ON f.release_group_mbid = g.mbid
     GROUP BY g.artist_mbid
),
rel AS (
    SELECT g.artist_mbid, r.release_mbid
      FROM public.mb_rg_release r
      JOIN public.mb_release_group g ON g.mbid = r.release_group_mbid
     WHERE r.tracks_filled_at IS NOT NULL
    UNION
    SELECT ar.artist_mbid, ar.release_mbid
      FROM public.mb_album_release_artist ar
     WHERE ar.tracks_filled_at IS NOT NULL
),
h AS (
    -- 세 출처의 곡을 한 자루에. h_base 는 판 표기를 뗀 제목의 해시라 songKey 와 같은 일을 한다.
    SELECT rel.artist_mbid, unnest(d.h_base) AS h
      FROM rel JOIN public.mb_release_digest d ON d.release_mbid = rel.release_mbid
    UNION ALL
    SELECT ar.mbid, unnest(d.h_base)
      FROM public.deezer_album_digest d
      JOIN public.deezer_album a   ON a.deezer_album_id = d.deezer_album_id
      JOIN public.deezer_artist ar ON ar.deezer_artist_id = a.deezer_artist_id
                                  AND ar.matched_by = 'name+album'
                                  AND ar.mbid IS NOT NULL
    UNION ALL
    SELECT ad.mbid, unnest(d.h_base)
      FROM public.discogs_release_digest d
      JOIN public.discogs_release dr   ON dr.release_id = d.release_id
      JOIN public.mb_artist_discogs ad ON ad.discogs_artist_id = dr.discogs_artist_id
),
tr AS (
    SELECT artist_mbid, count(DISTINCT h) AS distinct_tracks FROM h GROUP BY artist_mbid
)
SELECT m.spotify_id,
       a.mbid,
       a.name,
       a.name_ko,
       a.country,
       COALESCE(alb.core_albums, 0)    AS core_albums,
       COALESCE(alb.core_filled, 0)    AS core_filled,
       COALESCE(alb.single_albums, 0)  AS single_albums,
       COALESCE(alb.single_filled, 0)  AS single_filled,
       COALESCE(tr.distinct_tracks, 0) AS distinct_tracks,
       (COALESCE(alb.core_albums, 0) > 0
        AND alb.core_filled = alb.core_albums
        AND (alb.single_albums = 0
             OR alb.single_filled::numeric / alb.single_albums >= 0.8)) AS is_full,
       CASE WHEN COALESCE(alb.core_albums, 0) + COALESCE(alb.single_albums, 0) = 0 THEN 0
            ELSE round((COALESCE(alb.core_filled, 0) + COALESCE(alb.single_filled, 0))::numeric
                       / (alb.core_albums + alb.single_albums), 3)
       END AS coverage
  FROM public.mb_spotify_map m
  JOIN public.mb_artist a ON a.mbid = m.mbid
  LEFT JOIN alb ON alb.artist_mbid = a.mbid
  LEFT JOIN tr  ON tr.artist_mbid  = a.mbid
 WHERE m.entity = 'artist'
   AND m.confidence IN ('url_rel', 'manual', 'wikidata');

-- 2) 화면이 읽을 캐시. 정의는 위 뷰 하나뿐이고 이건 그 결과를 담아 둘 뿐이다.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.artist_coverage_cached AS
SELECT * FROM public.artist_coverage;

-- CONCURRENTLY 갱신에 반드시 필요하다. 없으면 갱신하는 동안 읽기가 막힌다.
CREATE UNIQUE INDEX IF NOT EXISTS artist_coverage_cached_pk
    ON public.artist_coverage_cached (spotify_id);
CREATE INDEX IF NOT EXISTS artist_coverage_cached_full
    ON public.artist_coverage_cached (is_full) WHERE is_full;
CREATE INDEX IF NOT EXISTS artist_coverage_cached_tracks
    ON public.artist_coverage_cached (distinct_tracks DESC);

COMMENT ON MATERIALIZED VIEW public.artist_coverage_cached IS
'artist_coverage 를 매시 27분에 담아 두는 캐시. 화면·API 는 이것을 읽는다.
정의를 바꾸려면 artist_coverage 뷰를 고친다 — 여기는 복사본이라 따로 고칠 것이 없다.
최대 1시간 낡을 수 있다. 수집이 30분 주기라 이용자가 알아챌 차이는 아니다.';

GRANT SELECT ON public.artist_coverage_cached TO anon, authenticated, service_role;

-- 3) 갱신. 다른 cron 과 분 단위를 비켜 둔다 (mb-worker 매분 · explore-genre-tags 10분 · draft-ttl 17분)
SELECT cron.schedule(
    'artist-coverage-refresh',
    '27 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.artist_coverage_cached$$
);

-- 되돌리기:
--   select cron.unschedule('artist-coverage-refresh');
--   drop materialized view public.artist_coverage_cached;
--   (artist_coverage 뷰는 그대로 두면 된다 — 재정의 전후 결과가 같다)
