-- 같이 소트하기: 이 참여 기록이 "이전 취향표를 불러온 것"인지.
--
-- 방장이 내 취향표로 방을 만들면 그 순위가 참여 기록으로 바로 들어간다. 그런데
-- 화면에서는 방금 누가 소트를 끝낸 것과 구분이 되지 않아, 방장이 자기 링크에서
-- "OO님이 소트를 끝냈어요" 를 보게 된다. 불러온 것은 불러왔다고 말해야 한다.
--
-- 시각으로 가늠할 수는 없다 — 다시 소트해도 upsert 가 created_at 을 그대로 두므로
-- "방을 만든 시각과 같으면 불러온 것" 이라는 추측은 다시 소트한 뒤에도 참이 된다.
--
-- 기본값 false 라 기존 기록은 모두 "직접 소트한 것" 이 된다. 맞다.
alter table public.sort_challenge_entries
  add column if not exists imported boolean not null default false;

comment on column public.sort_challenge_entries.imported is
  '이전 취향표를 불러와 만든 기록이면 true. 직접 소트하면 false 로 덮인다.';
