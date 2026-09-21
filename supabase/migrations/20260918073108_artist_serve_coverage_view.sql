-- 추가 전용: 뷰 1개.
-- 지금 화면에 실제로 낼 수 있는 앨범·곡 수. 세 갈래를 모두 센다.
--   sp_albums  Spotify 앨범 ID 가 붙고 트랙리스트까지 있는 MusicBrainz 앨범
--   mb_albums  Spotify 앨범 ID 가 없지만 대표 발매판 트랙리스트가 채워진 발매그룹 ("mb:" 앨범)
--   dz_albums  Deezer 에서만 있는 앨범 ("deezer:" 앨범)
-- (화면에서는 제목+연도로 한 번 더 중복을 걸러내므로 실제 표시 수는 이보다 조금 적다)
create or replace view public.artist_serve_coverage as
with sp as (
  select artist_mbid, count(distinct spotify_album_id) n
  from public.mb_album_release_artist where tracks_filled_at is not null group by 1
),
sp_tracks as (
  select ar.artist_mbid, count(*) n
  from public.mb_release_track t join public.mb_album_release_artist ar on ar.release_mbid = t.release_mbid
  group by 1
),
linked_rg as (select distinct release_group_mbid from public.mb_album_release where release_group_mbid is not null),
mb as (
  select g.artist_mbid, count(*) n, coalesce(sum(r.track_count), 0) tracks
  from public.mb_release_group g
  join public.mb_rg_release r on r.release_group_mbid = g.mbid and r.tracks_filled_at is not null
  where not exists (select 1 from linked_rg l where l.release_group_mbid = g.mbid)
  group by 1
),
dz as (
  select d.mbid as artist_mbid, count(*) n, coalesce(sum(a.nb_tracks), 0) tracks
  from public.deezer_artist d join public.deezer_album a on a.deezer_artist_id = d.deezer_artist_id
  where d.matched_by = 'name+album' and d.mbid is not null and coalesce(a.nb_tracks, 0) > 0
  group by 1
)
select m.spotify_id, a.mbid, a.name, a.name_ko, a.country, m.confidence,
       coalesce(sp.n, 0) sp_albums,
       coalesce(mb.n, 0) mb_albums,
       coalesce(dz.n, 0) dz_albums,
       coalesce(sp.n, 0) + coalesce(mb.n, 0) + coalesce(dz.n, 0) albums_servable,
       coalesce(sp_tracks.n, 0) + coalesce(mb.tracks, 0) + coalesce(dz.tracks, 0) tracks_servable,
       coalesce(rg.total, 0) release_groups
from public.mb_spotify_map m
join public.mb_artist a on a.mbid = m.mbid
left join sp on sp.artist_mbid = a.mbid
left join sp_tracks on sp_tracks.artist_mbid = a.mbid
left join mb on mb.artist_mbid = a.mbid
left join dz on dz.artist_mbid = a.mbid
left join (select artist_mbid, count(*) total from public.mb_release_group group by 1) rg on rg.artist_mbid = a.mbid
where m.entity = 'artist';
