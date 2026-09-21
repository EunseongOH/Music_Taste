-- 추가 전용: 뷰 1개.
-- 아티스트별로 "MusicBrainz 가 아는 발매그룹을 우리가 전부 채웠는가" 와 수요를 함께 본다.
-- 영구 보관 목표는 CC0 출처(MusicBrainz·Discogs)만으로 완비하는 것이다.
-- Deezer 는 수익화 시 빼야 하므로 얼마나 기대고 있는지 따로 센다.
create or replace view public.artist_completeness as
with rg as (select artist_mbid, count(*) total from public.mb_release_group group by 1),
filled_sp as (
  select artist_mbid, count(distinct release_group_mbid) n
  from public.mb_album_release_artist ar
  join public.mb_album_release al on al.spotify_album_id = ar.spotify_album_id
  where ar.tracks_filled_at is not null and al.release_group_mbid is not null
  group by 1
),
filled_mb as (
  select g.artist_mbid, count(*) n
  from public.mb_release_group g
  join public.mb_rg_release r on r.release_group_mbid = g.mbid and r.tracks_filled_at is not null
  group by 1
),
pending as (
  select g.artist_mbid, count(*) n
  from public.mb_release_group g
  left join public.mb_rg_release r on r.release_group_mbid = g.mbid
  where r.release_group_mbid is null or (r.tracks_filled_at is null and r.attempts < 3)
  group by 1
)
select v.spotify_id, v.mbid, v.name, v.name_ko, v.country, v.confidence,
       coalesce(d.opens, 0) as opens,
       coalesce(rg.total, 0) as release_groups,
       least(coalesce(filled_sp.n, 0) + coalesce(filled_mb.n, 0), coalesce(rg.total, 0)) as rg_filled,
       coalesce(pending.n, 0) as rg_pending,
       v.albums_servable, v.tracks_servable,
       v.dz_albums,
       case when coalesce(rg.total, 0) = 0 then false
            else coalesce(pending.n, 0) = 0 end as cc0_complete
from public.artist_serve_coverage v
left join public.artist_demand d on d.spotify_id = v.spotify_id
left join rg on rg.artist_mbid = v.mbid
left join filled_sp on filled_sp.artist_mbid = v.mbid
left join filled_mb on filled_mb.artist_mbid = v.mbid
left join pending on pending.artist_mbid = v.mbid;
