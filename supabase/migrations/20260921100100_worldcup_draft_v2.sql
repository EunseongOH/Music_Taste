-- 월드컵 임시저장 v2 — 1/2: 추가만 (docs/worldcup-draft-plan.md 5-1)
-- 옛 코드(main)에 무해하므로 먼저 적용해 둔다.

-- 진행 상태(곡 ID 만) + 임시저장(확정) 시각
alter table public.tournament_drafts
  add column if not exists progress jsonb,
  add column if not exists saved_at timestamptz;

-- 완료 결과에 매치별 선택 기록 [[라운드 크기, 이긴 곡, 진 곡], ...] (곡 ID 만)
alter table public.tournament_results
  add column if not exists picks jsonb;
