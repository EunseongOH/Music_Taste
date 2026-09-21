-- 추가 전용. 새로 들일지 검토 중인 아티스트.
create table if not exists public.artist_candidate (
  mbid        uuid primary key,
  name        text not null,
  name_ko     text,
  country     text,
  latest_date date,                 -- MusicBrainz 에서 본 가장 최근 발매일
  releases    int  not null default 0,
  spotify_id  text,                 -- MusicBrainz URL 관계에서 얻은 것만 (추정하지 않는다)
  nb_fan      int,                  -- Deezer 팬 수 (인기 판단용)
  status      text not null default 'new',   -- new | checked | added | skipped
  note        text,
  found_at    timestamptz not null default now()
);
create index if not exists artist_candidate_status on public.artist_candidate (status, nb_fan desc nulls last);
