-- Phase E: canonical 아티스트 읽기용 뷰
--
-- mb_spotify_map.mbid 는 artist/album/track 을 모두 가리키므로 mb_artist 로 FK 를 걸 수 없고,
-- 따라서 PostgREST 임베드(select=...)가 안 된다. 뷰로 조인을 미리 해둔다.
--
-- confidence 는 url_rel / manual 만 노출한다.
-- name 매칭은 실측 정확도 57% (빌스택스->Vasco Rossi 같은 오매칭)라 자동 채택하지 않는다.
--
-- 이미지는 canonical 에 없다(MB 는 아티스트 이미지를 갖고 있지 않다).
-- 기존 Spotify 임시 캐시(TTL 21일, 약관 IV.3.2 허용 범위)에서 끌어와 hotlink 로만 쓴다.
--
-- popularity 는 Spotify 것을 쓰지 않는다. 2026-02 개편에서 artist.popularity 가
-- 제거되어 캐시에 0 만 쌓여 있다(실측 확인). 자체 데이터인 "취향표 등장 횟수"로
-- 대체한다 — 어차피 이쪽이 이 서비스의 인기도 정의에 더 맞다.

CREATE OR REPLACE VIEW public.canonical_artist AS
SELECT
    m.spotify_id,
    a.mbid,
    a.name,
    a.name_ko,
    a.genres,
    a.country,
    m.confidence,
    c.images,
    COALESCE(p.uses, 0)::int AS popularity
FROM public.mb_artist a
JOIN public.mb_spotify_map m
       ON m.mbid = a.mbid
      AND m.entity = 'artist'
      AND m.confidence IN ('url_rel', 'manual')
LEFT JOIN LATERAL (
    SELECT sc.images
      FROM public.spotify_cache_artists sc
     WHERE sc.id = m.spotify_id
     ORDER BY (sc.locale = 'ko') DESC
     LIMIT 1
) c ON TRUE
LEFT JOIN LATERAL (
    SELECT count(*) AS uses
      FROM public.tournament_results tr
     WHERE tr.artist_id = m.spotify_id
) p ON TRUE;

-- 릴리스그룹도 Spotify ID 로 조회할 수 있게 같이 만들어 둔다.
-- 앨범 단위 매핑(mb_spotify_map entity='album')이 채워지면 이 뷰가 getArtistAlbums 를 받는다.
CREATE OR REPLACE VIEW public.canonical_release_group AS
SELECT
    am.spotify_id AS artist_spotify_id,
    rg.mbid,
    rg.artist_mbid,
    rg.title,
    rg.primary_type,
    rg.first_release_date,
    alm.spotify_id AS album_spotify_id
FROM public.mb_release_group rg
JOIN public.mb_spotify_map am
       ON am.mbid = rg.artist_mbid
      AND am.entity = 'artist'
      AND am.confidence IN ('url_rel', 'manual')
LEFT JOIN public.mb_spotify_map alm
       ON alm.mbid = rg.mbid
      AND alm.entity = 'album';
