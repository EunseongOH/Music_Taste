DROP VIEW IF EXISTS public.canonical_artist;
CREATE VIEW public.canonical_artist AS
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
