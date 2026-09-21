-- 추가 전용: 뷰 1개. 기존 테이블 무변경.
-- 트랙리스트가 "일부만" 채워진 아티스트(잔나비 류)를 먼저 집기 위한 목록.
create or replace view public.artist_deezer_target as
select s.spotify_id, s.mbid, s.name, s.name_ko, s.country, s.confidence,
       s.albums_with_tracks,
       coalesce(rg.total, 0) as release_groups,
       greatest(coalesce(rg.total, 0) - s.albums_with_tracks, 0) as gap
from public.artist_coverage_snapshot s
left join (select artist_mbid, count(*) as total from public.mb_release_group group by 1) rg
  on rg.artist_mbid = s.mbid;
