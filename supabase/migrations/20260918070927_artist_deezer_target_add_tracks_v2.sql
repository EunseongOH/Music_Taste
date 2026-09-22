drop view if exists public.artist_deezer_target;
create view public.artist_deezer_target as
select s.spotify_id, s.mbid, s.name, s.name_ko, s.country, s.confidence,
       s.albums_with_tracks,
       coalesce(rg.total, 0) as release_groups,
       greatest(coalesce(rg.total, 0) - s.albums_with_tracks, 0) as gap,
       s.tracks
from public.artist_coverage_snapshot s
left join (select artist_mbid, count(*) as total from public.mb_release_group group by 1) rg
  on rg.artist_mbid = s.mbid;
