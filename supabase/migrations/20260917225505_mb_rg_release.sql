-- 추가 전용. 기존 테이블 무변경.
-- Spotify 앨범 ID 가 없는 발매그룹도 화면에 낼 수 있게, 발매그룹마다 대표 발매판 1개를 정해 둔다.
-- 트랙리스트는 기존 mb_release_track (발매판 기준) 을 그대로 쓴다.
create table if not exists public.mb_rg_release (
  release_group_mbid uuid primary key,
  release_mbid       uuid not null,
  track_count        int,
  status             text,              -- Official 등 MusicBrainz 발매 상태
  tracks_filled_at   timestamptz,
  attempts           int not null default 0,
  checked_at         timestamptz not null default now()
);
create index if not exists mb_rg_release_pending on public.mb_rg_release (tracks_filled_at) where tracks_filled_at is null;
create index if not exists mb_rg_release_release on public.mb_rg_release (release_mbid);
