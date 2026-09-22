-- "전곡 확보" 를 판정하는 단 하나의 뷰.
--
-- 왜 필요한가: 판정 기준이 코드 여덟 군데에 흩어져 각각 다른 것을 셌다. 같은 아티스트를 두고
-- 33 / 22 / 9 / 7 / 11 이 동시에 나왔고, "곡까지 낼 수 있다"고 표시된 62명 중 표시가 실제와
-- 맞는 사람은 30명뿐이었다 (2026-09-22 전수 점검). 계획: docs/canonical-db/coverage-definition.md
--
-- 정의 B (2026-09-22 사용자 결정)
--   정규 앨범·EP 의 곡은 빠짐없이, 싱글은 80% 이상 낼 수 있으면 "전곡 확보"다.
--   이용자는 싱글 리패키지를 하나도 빠짐없이 원하지 않는다. 정규 앨범에 구멍이 없으면
--   "전곡"이라 불러도 속이는 게 아니다.
--
-- 세는 근거는 dbCatalog 서빙 판정과 같아야 한다 — 화면이 실제로 내는 것과 같은 규칙이어야
-- 숫자가 거짓말을 하지 않는다. 그래서:
--   * 앨범 단위는 mb_release_group + tracks_filled_at (dbCatalog 가 곡을 낼 수 있는 조건)
--   * 곡 단위는 digest 의 h_base 를 센다. h_base = shortHash(cmpTrack(제목)) 이고
--     cmpTrack 은 판 표기를 뗀 제목이다. 즉 songKey 와 같은 일을 하는 값이 이미 DB 에 있다.
--     songKey 를 SQL 로 다시 구현하지 않는다 — 두 벌이 되면 반드시 어긋난다.
--
-- 추가 전용. 기존 뷰·테이블을 건드리지 않는다.

CREATE OR REPLACE VIEW public.artist_coverage AS
WITH rg AS (
    -- 발매그룹마다 "곡을 낼 수 있나". Spotify 앨범에 붙은 발매판이든 MB 단독이든 상관없다.
    SELECT g.artist_mbid,
           g.primary_type,
           (EXISTS (SELECT 1 FROM public.mb_rg_release r
                     WHERE r.release_group_mbid = g.mbid AND r.tracks_filled_at IS NOT NULL)
         OR EXISTS (SELECT 1 FROM public.mb_album_release ar
                     WHERE ar.release_group_mbid = g.mbid AND ar.tracks_filled_at IS NOT NULL)) AS has_tracks
      FROM public.mb_release_group g
),
alb AS (
    -- Other·Broadcast·null 은 세지 않는다. 인터뷰·방송본이라 이용자가 "곡"으로 치지 않는다.
    SELECT artist_mbid,
           count(*) FILTER (WHERE primary_type IN ('Album', 'EP'))                    AS core_albums,
           count(*) FILTER (WHERE primary_type IN ('Album', 'EP') AND has_tracks)     AS core_filled,
           count(*) FILTER (WHERE primary_type = 'Single')                            AS single_albums,
           count(*) FILTER (WHERE primary_type = 'Single' AND has_tracks)             AS single_filled
      FROM rg
     GROUP BY artist_mbid
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
    -- 세 출처의 곡을 한 자루에 담는다. 같은 곡이 출처마다 있어도 h_base 가 같아 한 번만 세진다.
    SELECT rel.artist_mbid, unnest(d.h_base) AS h
      FROM rel JOIN public.mb_release_digest d ON d.release_mbid = rel.release_mbid
    UNION ALL
    SELECT ar.mbid, unnest(d.h_base)
      FROM public.deezer_album_digest d
      JOIN public.deezer_album a  ON a.deezer_album_id = d.deezer_album_id
      JOIN public.deezer_artist ar ON ar.deezer_artist_id = a.deezer_artist_id
                                  AND ar.matched_by = 'name+album'     -- 이름만 맞은 연결은 믿지 않는다
                                  AND ar.mbid IS NOT NULL
    UNION ALL
    SELECT ad.mbid, unnest(d.h_base)
      FROM public.discogs_release_digest d
      JOIN public.discogs_release dr   ON dr.release_id = d.release_id
      JOIN public.mb_artist_discogs ad ON ad.discogs_artist_id = dr.discogs_artist_id
),
tr AS (
    SELECT artist_mbid, count(DISTINCT h) AS distinct_tracks
      FROM h GROUP BY artist_mbid
)
SELECT m.spotify_id,
       a.mbid,
       a.name,
       a.name_ko,
       a.country,
       COALESCE(alb.core_albums, 0)    AS core_albums,     -- 정규·EP 발매그룹 수
       COALESCE(alb.core_filled, 0)    AS core_filled,     -- 그중 곡을 낼 수 있는 것
       COALESCE(alb.single_albums, 0)  AS single_albums,
       COALESCE(alb.single_filled, 0)  AS single_filled,
       COALESCE(tr.distinct_tracks, 0) AS distinct_tracks, -- 판 표기를 뗀 기준 서로 다른 곡 수
       -- 정의 B. 정규·EP 가 하나도 없는 아티스트는 판정하지 않는다(false) —
       -- 싱글만 낸 아티스트를 "전곡 확보"라 부르면 말이 헐거워진다.
       (COALESCE(alb.core_albums, 0) > 0
        AND alb.core_filled = alb.core_albums
        AND (alb.single_albums = 0
             OR alb.single_filled::numeric / alb.single_albums >= 0.8)) AS is_full,
       -- 화면에서 순서를 정할 때 쓴다. is_full 이 아닌 아티스트끼리 비교하는 용도다.
       CASE WHEN COALESCE(alb.core_albums, 0) + COALESCE(alb.single_albums, 0) = 0 THEN 0
            ELSE round((COALESCE(alb.core_filled, 0) + COALESCE(alb.single_filled, 0))::numeric
                       / (alb.core_albums + alb.single_albums), 3)
       END AS coverage
  FROM public.mb_spotify_map m
  JOIN public.mb_artist a ON a.mbid = m.mbid
  LEFT JOIN alb ON alb.artist_mbid = a.mbid
  LEFT JOIN tr  ON tr.artist_mbid  = a.mbid
 WHERE m.entity = 'artist'
   -- 이름만 맞은 연결(실측 정확도 57%)은 넣지 않는다. 틀린 연결로 "확보"라고 하면 최악이다.
   AND m.confidence IN ('url_rel', 'manual', 'wikidata');

COMMENT ON VIEW public.artist_coverage IS
'"전곡 확보" 판정의 유일한 근거 (정의 B, 2026-09-22). 화면·API·스크립트는 여기만 읽는다.
artist_serve_snapshot 의 albums_servable·tracks_servable 은 출처별 행 수라 중복 계수한다 —
수집 진척을 볼 때만 쓰고 화면 판정에 쓰지 말 것.';
