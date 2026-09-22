-- 추가 전용: 컬럼 1개.
-- 트랙리스트를 받는 순서. 작을수록 먼저. (아티스트 중요도 × 10) + 발매 종류.
alter table public.mb_rg_release add column if not exists rank int;
create index if not exists mb_rg_release_queue on public.mb_rg_release (rank, checked_at) where tracks_filled_at is null;
