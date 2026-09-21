-- 추가 전용. artist_serve_coverage 뷰는 큰 표 네 개를 훑어서 한 번 읽는 데도 오래 걸린다.
-- 결과를 표에 담아 두고 필요할 때 갱신한다 (artist_coverage_snapshot 과 같은 방식).
create table if not exists public.artist_serve_snapshot (
  spotify_id text primary key,
  mbid uuid, name text, name_ko text, country text, confidence text,
  sp_albums int, mb_albums int, dz_albums int,
  albums_servable int, tracks_servable int, release_groups int,
  refreshed_at timestamptz not null default now()
);
create index if not exists artist_serve_snapshot_tracks on public.artist_serve_snapshot (tracks_servable desc);

create or replace function public.refresh_artist_serve_snapshot()
returns int language plpgsql set statement_timeout to '240s' as $$
declare n int;
begin
  insert into public.artist_serve_snapshot as s
    (spotify_id, mbid, name, name_ko, country, confidence,
     sp_albums, mb_albums, dz_albums, albums_servable, tracks_servable, release_groups, refreshed_at)
  select v.spotify_id, v.mbid, v.name, v.name_ko, v.country, v.confidence,
         v.sp_albums, v.mb_albums, v.dz_albums, v.albums_servable, v.tracks_servable, v.release_groups, now()
  from public.artist_serve_coverage v
  on conflict (spotify_id) do update set
    mbid = excluded.mbid, name = excluded.name, name_ko = excluded.name_ko, country = excluded.country,
    confidence = excluded.confidence, sp_albums = excluded.sp_albums, mb_albums = excluded.mb_albums,
    dz_albums = excluded.dz_albums, albums_servable = excluded.albums_servable,
    tracks_servable = excluded.tracks_servable, release_groups = excluded.release_groups, refreshed_at = now();
  get diagnostics n = row_count;
  return n;
end; $$;
