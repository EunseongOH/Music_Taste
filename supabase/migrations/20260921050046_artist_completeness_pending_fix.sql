-- rg_pending 이 과대 집계됐다. Spotify 앨범 연결 경로로 이미 트랙리스트를 받은 발매그룹까지
-- "아직 못 받음" 으로 세고 있었다 (트와이스 실제 20건인데 26건으로 나왔다).
create or replace view public.artist_completeness as
with rg as (select artist_mbid, count(*) total from public.mb_release_group group by 1),
filled_sp as (
  select g.artist_mbid, count(distinct g.mbid) n
  from public.mb_release_group g
  join public.mb_album_release al on al.release_group_mbid = g.mbid
  join public.mb_album_release_artist ar on ar.spotify_album_id = al.spotify_album_id
  where ar.tracks_filled_at is not null
  group by 1
),
filled_mb as (
  select g.artist_mbid, count(*) n
  from public.mb_release_group g
  join public.mb_rg_release r on r.release_group_mbid = g.mbid and r.tracks_filled_at is not null
  group by 1
),
-- 어느 경로로도 트랙리스트를 못 받았고, 아직 포기하지도 않은 발매그룹
pending as (
  select g.artist_mbid, count(*) n
  from public.mb_release_group g
  where not exists (
          select 1 from public.mb_rg_release r
          where r.release_group_mbid = g.mbid and (r.tracks_filled_at is not null or r.attempts >= 3))
    and not exists (
          select 1 from public.mb_album_release al
          join public.mb_album_release_artist ar on ar.spotify_album_id = al.spotify_album_id
          where al.release_group_mbid = g.mbid and ar.tracks_filled_at is not null)
  group by 1
)
select v.spotify_id, v.mbid, v.name, v.name_ko, v.country, v.confidence,
       coalesce(d.opens, 0) as opens,
       coalesce(rg.total, 0) as release_groups,
       least(coalesce(filled_sp.n, 0) + coalesce(filled_mb.n, 0), coalesce(rg.total, 0)) as rg_filled,
       coalesce(pending.n, 0) as rg_pending,
       v.albums_servable, v.tracks_servable,
       v.dz_albums,
       case when coalesce(rg.total, 0) = 0 then false else coalesce(pending.n, 0) = 0 end as cc0_complete
from public.artist_serve_coverage v
left join public.artist_demand d on d.spotify_id = v.spotify_id
left join rg on rg.artist_mbid = v.mbid
left join filled_sp on filled_sp.artist_mbid = v.mbid
left join filled_mb on filled_mb.artist_mbid = v.mbid
left join pending on pending.artist_mbid = v.mbid;
