-- 확보 현황 조회용 뷰: 아티스트별로 발매그룹 / Spotify 앨범 매핑 / 트랙리스트 채움 정도를 한 줄로 본다.
-- Supabase 대시보드 Table Editor 에서 필터·정렬해서 보는 용도. additive-only.
CREATE OR REPLACE VIEW public.canonical_coverage AS
SELECT
    a.name,
    a.name_ko,
    a.country,
    m.spotify_id,
    m.confidence,
    CASE
        WHEN m.confidence IN ('url_rel', 'manual')
             AND EXISTS (SELECT 1 FROM public.mb_album_release_artist ar
                          WHERE ar.artist_mbid = a.mbid AND ar.tracks_filled_at IS NOT NULL)
            THEN 'tracklist'     -- 앨범·트랙리스트까지 확보, 서비스에 노출됨
        WHEN m.confidence IN ('url_rel', 'manual')
            THEN 'albums_only'   -- 발매 목록만, 트랙리스트 아직
        ELSE 'quarantined'       -- 이름 매칭이라 비노출
    END AS status,
    (SELECT count(*) FROM public.mb_release_group rg WHERE rg.artist_mbid = a.mbid)                                   AS release_groups,
    (SELECT count(*) FROM public.mb_album_release_artist ar WHERE ar.artist_mbid = a.mbid)                            AS albums_mapped,
    (SELECT count(*) FROM public.mb_album_release_artist ar WHERE ar.artist_mbid = a.mbid AND ar.tracks_filled_at IS NOT NULL) AS albums_with_tracks,
    (SELECT count(*) FROM public.mb_release_track t
       JOIN public.mb_album_release_artist ar ON ar.release_mbid = t.release_mbid
      WHERE ar.artist_mbid = a.mbid)                                                                                  AS tracks,
    a.updated_at,
    a.mbid
FROM public.mb_artist a
JOIN public.mb_spotify_map m ON m.mbid = a.mbid AND m.entity = 'artist';
