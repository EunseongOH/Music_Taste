-- 추가 전용. 이용자가 어떤 아티스트를 실제로 여는지 센다.
-- Spotify 콘텐츠가 아니라 우리 서비스의 이용 기록이므로 영구 보관에 제약이 없다.
create table if not exists public.artist_demand (
  spotify_id text primary key,
  opens      bigint      not null default 0,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists artist_demand_opens on public.artist_demand (opens desc);

-- 요청 경로에서 부담 없이 부를 수 있게 한 줄짜리 upsert 로 둔다.
create or replace function public.bump_artist_demand(p_id text)
returns void language sql security definer set search_path = public as $$
  insert into public.artist_demand (spotify_id, opens)
  values (p_id, 1)
  on conflict (spotify_id) do update
    set opens = public.artist_demand.opens + 1, last_seen = now();
$$;

-- 지금까지의 이용 기록으로 초기값을 채운다 (전곡 모드 결과에 남은 아티스트)
insert into public.artist_demand (spotify_id, opens)
select artist_id, count(*) from public.tournament_results
where artist_id is not null group by artist_id
on conflict (spotify_id) do update set opens = public.artist_demand.opens + excluded.opens;
