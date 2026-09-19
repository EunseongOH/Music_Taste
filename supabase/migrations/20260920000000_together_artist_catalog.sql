-- 같이 소트하기(실험) — "전곡이 확실히 있는 아티스트"를 고르기 위한 집계 뷰.
--
-- Spotify 를 부르지 않고 이미 받아 둔 캐시만 센다.
--   coverage = 곡까지 받아 둔 앨범 / 스포티파이가 말한 앨범 수
--   coverage 가 1 이면 전곡을 낼 수 있다는 뜻이다.
-- 캐시 테이블은 RLS 로 잠겨 있고 이 뷰도 그대로 잠긴다(서버에서 service role 로만 읽는다).

create or replace view together_artist_catalog as
with pairs as (
  -- 한 아티스트의 앨범 목록은 페이지로 나뉘어 여러 행에 들어 있다. 중복을 없앤다.
  select distinct aa.artist_id, e ->> 'id' as album_id
  from spotify_cache_artist_albums aa
  cross join lateral jsonb_array_elements(aa.items) e
  where e ->> 'id' is not null
),
totals as (
  select artist_id, max(total) as sp_total
  from spotify_cache_artist_albums
  group by artist_id
),
tracks as (
  -- 같은 앨범이 로케일별로 여러 번 있을 수 있다. 최근 것 하나만 쓴다.
  select distinct on (album_id) album_id, items
  from spotify_cache_album_tracks
  order by album_id, cached_at desc
),
agg as (
  select p.artist_id,
         count(*) as albums_listed,
         count(t.album_id) as albums_with_tracks,
         coalesce(sum(jsonb_array_length(t.items)), 0)::int as track_count
  from pairs p
  left join tracks t on t.album_id = p.album_id
  group by p.artist_id
),
artist as (
  select distinct on (id) id, name, images, popularity
  from spotify_cache_artists
  order by id, cached_at desc
)
select a.id,
       a.name,
       a.images,
       coalesce(a.popularity, 0) as popularity,
       g.track_count,
       g.albums_listed,
       coalesce(t.sp_total, g.albums_listed) as albums_total,
       round(g.albums_with_tracks::numeric
             / nullif(greatest(g.albums_listed, coalesce(t.sp_total, 0)), 0), 3) as coverage
from agg g
join artist a on a.id = g.artist_id
left join totals t on t.artist_id = g.artist_id
where g.track_count > 0;

comment on view together_artist_catalog is '같이 소트하기: 캐시에 곡까지 있는 아티스트와 그 확보율(coverage). Spotify 호출 없음.';
