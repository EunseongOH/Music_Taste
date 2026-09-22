-- 탐색 화면 장르 피드를 우리 DB 로 채우기 위한 조회용 뷰.
-- 장르는 Wikidata P136(CC0)에서 왔다. MusicBrainz 의 tags 는 CC-BY-NC-SA 라 쓰지 않는다.
-- 연결을 믿을 수 있는 아티스트만 낸다 (이름만 맞은 연결은 실측 정확도가 57% 라 뺀다).
-- 뷰만 추가한다. 기존 테이블은 건드리지 않는다.
CREATE OR REPLACE VIEW public.artist_genre_feed AS
SELECT
    m.spotify_id,
    a.mbid,
    a.name,
    a.name_ko,
    a.country,
    g.genre,
    COALESCE(s.tracks_servable, 0) AS tracks_servable
FROM public.mb_artist a
JOIN LATERAL unnest(a.genres) AS g(genre) ON TRUE
JOIN public.mb_spotify_map m
     ON m.mbid = a.mbid
    AND m.entity = 'artist'
    AND m.confidence IN ('url_rel', 'manual', 'wikidata')
LEFT JOIN public.artist_serve_snapshot s ON s.spotify_id = m.spotify_id;
