-- 추가 전용. 앨범 목록을 만들 때 트랙 행을 통째로 읽지 않기 위한 요약.
--
-- 지금은 곡 수를 세고 중복을 가리려고 그 아티스트의 모든 발매판 트랙을 다 읽는다.
-- 클래식처럼 앨범이 수백 장인 아티스트는 앨범 목록 한 번에 1.6MB 가 오간다.
-- Supabase 무료 대역폭이 월 5GB 라 이게 가장 먼저 닿는 벽이다.
--
-- 요약만 읽으면 같은 판단을 할 수 있다.
--   n_distinct  화면에 보일 곡 수 (같은 제목 제거 후)
--   h_raw       곡 제목 그대로의 짧은 해시 (앨범끼리 겹침 비교용)
--   h_base      판 표기를 뗀 제목의 짧은 해시 (표기가 달라도 같은 곡으로 본다)
--   durs        자리순 재생시간(초). 제목이 다른 언어일 때 같은 앨범인지 가린다
create table if not exists public.mb_release_digest (
  release_mbid uuid primary key,
  n_distinct   int  not null default 0,
  h_raw        text[] not null default '{}',
  h_base       text[] not null default '{}',
  durs         int[]  not null default '{}',
  built_at     timestamptz not null default now()
);

create table if not exists public.deezer_album_digest (
  deezer_album_id bigint primary key,
  n_distinct   int  not null default 0,
  h_raw        text[] not null default '{}',
  h_base       text[] not null default '{}',
  durs         int[]  not null default '{}',
  built_at     timestamptz not null default now()
);
