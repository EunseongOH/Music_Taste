-- 같이 소트하기: 참여 신원과 계정 소유권을 가른다.
--
-- 지금까지 `participant_key` 하나가 두 역할을 겸했다.
--   비로그인 → localStorage 의 anon_xxx
--   로그인   → 그 사람의 auth uid
-- 그래서 익명으로 소트한 뒤 로그인하면 **신원이 갈려** 자기 기록을 못 찾았고,
-- 결과 화면의 저장 effect 가 새 key 로 한 번 더 돌아 참가자가 한 명 늘었다.
--
-- 앞으로:
--   participant_key   참여 신원(기기). **로그인해도 바뀌지 않는다.**
--   user_id           계정 소유권. 비로그인은 null.
--   claim_token_hash  익명 기록을 계정에 붙일 때 쓰는 증명.
--
-- 전부 더하기만 한다. 기존 열·행을 지우거나 고쳐 쓰지 않는다.

alter table public.sort_challenge_entries
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  -- 원문은 브라우저에만 둔다. 여기에는 sha-256 만 남는다.
  add column if not exists claim_token_hash text;

comment on column public.sort_challenge_entries.user_id is
  '계정 소유권. 비로그인 참여는 null. 탈퇴하면 null 로 돌아가고 순위는 남는다.';
comment on column public.sort_challenge_entries.claim_token_hash is
  '익명 기록을 계정에 붙일 때 쓰는 증명의 sha-256. participant_key 는 관계도에 그대로 내려가므로 그것만으로는 소유권을 주장할 수 없게 한다.';

-- 지금까지 로그인 사용자의 participant_key 는 auth uid 그 자체였다.
-- **정확히 일치하는 것만** 옮긴다. 닉네임·시각·순위로 사람을 추측하지 않는다.
update public.sort_challenge_entries e
   set user_id = u.id
  from auth.users u
 where e.user_id is null
   and e.participant_key = u.id::text;

create index if not exists sort_challenge_entries_user_idx
  on public.sort_challenge_entries (user_id, created_at desc)
  where user_id is not null;

-- 한 계정이 한 방에 참가자 둘로 앉지 않게 한다.
-- (2026-09-24 운영 확인: 위반하는 행 0건)
create unique index if not exists sort_challenge_entries_user_once_idx
  on public.sort_challenge_entries (challenge_id, user_id)
  where user_id is not null;
