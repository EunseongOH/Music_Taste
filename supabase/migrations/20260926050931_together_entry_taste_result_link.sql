-- 같이 소트한 방과 그 판으로 남은 개인 취향표를 명시적으로 잇는다.
--
-- 로그인한 사람이 16곡 이상 같이 소트를 끝내면 두 곳에 남는다.
--   sort_challenge_entries   이 방에서의 참여
--   tournament_results       개인 취향표
-- 한 활동인데 기록이 둘이다. 프로필의 "완료한 취향표" 를 한 목록으로 합치면서 같은
-- 활동이 두 줄로 보이게 됐다.
--
-- 닮았다고 합치지 않는다. 제목·아티스트·날짜·1위·순위는 같은 활동이라는 증거가
-- 아니라 닮았다는 것뿐이고, 실제로 다른 활동을 지울 수 있다. challenge_id 하나로도
-- 안 된다 — 같은 방을 다시 소트하면 판이 여러 개이고, 지난 판의 취향표까지 숨는다.
--
-- 그래서 정확히 어느 취향표인지를 적는다. 이을 근거는 이미 있다: 결과 화면이
-- tasteResultId 를 미리 정해 그 id 로 tournament_results 에 넣는다. 추측이 필요 없다.
--
-- 어느 쪽에 적는가: tournament_results.source_challenge_id 가 아니라 참여 쪽이다.
-- 한 계정의 한 방 참여는 늘 하나이고 "지금 이 참여" 를 뜻한다. 방 id 만으로는 여러 판
-- 중 어느 것이 지금인지 가릴 수 없다.

alter table public.sort_challenge_entries
  add column if not exists linked_taste_result_id uuid
  references public.tournament_results (id) on delete set null;

comment on column public.sort_challenge_entries.linked_taste_result_id is
  '이 참여로 남은 개인 취향표 id. 목록에서 한 활동을 두 줄로 보이지 않게 하는 데만 쓴다. 취향표를 지우면 null 이 되고 방 기록은 그대로 남는다.';

-- 새 순위가 들어오면 지난 판의 연결은 무효다.
--
-- 이걸 저장 함수 안에 적으면 v1·v2·claim 세 곳에 같은 줄을 넣어야 하고, 앞으로 쓰기
-- 경로가 하나 더 생기면 또 빠뜨린다. 이건 한 함수의 규칙이 아니라 **자료의 규칙**이다.
-- 그래서 표에 붙인다 — 어느 길로 들어와도 지켜진다.
--
-- 연결만 새로 적는 link RPC 는 ranking 을 건드리지 않으므로 이 방아쇠에 걸리지 않는다.
create or replace function public.together_entry_clear_stale_link()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.ranking is distinct from old.ranking then
    new.linked_taste_result_id := null;
  end if;
  return new;
end; $$;

drop trigger if exists together_entry_clear_stale_link on public.sort_challenge_entries;
create trigger together_entry_clear_stale_link
  before update on public.sort_challenge_entries
  for each row execute function public.together_entry_clear_stale_link();

-- "이 취향표가 내 것이다" 는 클라이언트의 말을 믿지 않는다. 서버가 둘 다 확인한다.
--   그 취향표가 내 계정의 것이다
--   이 방에 내 계정의 참여가 있다
-- 어느 쪽이든 아니면 조용히 null — 오류로 화면을 막을 일이 아니다.
-- 기본 표에 직접 쓰는 길은 계속 막혀 있고, 잇는 길은 이 함수뿐이다.
create or replace function public.link_sort_challenge_taste_result(
  p_challenge_id uuid, p_result_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_entry uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_challenge_id is null or p_result_id is null then
    raise exception 'challenge_id 와 result_id 가 필요해요.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tournament_results r
     where r.id = p_result_id and r.user_id = v_uid
  ) then
    return null;
  end if;

  update public.sort_challenge_entries
     set linked_taste_result_id = p_result_id
   where challenge_id = p_challenge_id and user_id = v_uid
   returning id into v_entry;

  return v_entry;
end; $$;

revoke execute on function public.link_sort_challenge_taste_result(uuid, uuid) from public, anon;
grant execute on function public.link_sort_challenge_taste_result(uuid, uuid) to authenticated, service_role;

-- 기존 my_sort_challenge_rooms() 는 바꾸지 않는다 — 운영 중인 main 이 부른다.
-- 연결까지 필요한 새 화면은 v2 를 쓴다.
--
-- linked_taste_result_id 를 공개 컬럼으로 열지 않는다. 참가자 비교에 쓰이는 값이
-- 아니고, 남에게 내 취향표 id 를 알려 줄 이유가 없다. 계정 자신은 이 RPC 로 받는다.
create or replace function public.my_sort_challenge_rooms_v2()
returns table (challenge_id uuid, created_at timestamptz, linked_taste_result_id uuid)
language sql security definer set search_path = public, pg_temp as $$
  select e.challenge_id, e.created_at, e.linked_taste_result_id
    from public.sort_challenge_entries e
   where auth.uid() is not null and e.user_id = auth.uid()
   order by e.created_at desc
   limit 50;
$$;

revoke execute on function public.my_sort_challenge_rooms_v2() from public, anon;
grant execute on function public.my_sort_challenge_rooms_v2() to authenticated, service_role;

create or replace function public.together_privileges_probe()
returns table (proname text, public_exec boolean, anon_exec boolean, auth_exec boolean)
language sql security definer set search_path = public, pg_temp as $$
  select p.proname::text,
         has_function_privilege('public', p.oid, 'execute'),
         has_function_privilege('anon', p.oid, 'execute'),
         has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_sort_challenge_entry', 'save_sort_challenge_entry_v2',
                       '_save_sort_challenge_entry', 'claim_sort_challenge_entry',
                       'my_sort_challenge_entry', 'my_sort_challenge_rooms',
                       'my_sort_challenge_rooms_v2', 'link_sort_challenge_taste_result',
                       'together_hash');
$$;

revoke execute on function public.together_privileges_probe() from public, anon, authenticated;
grant execute on function public.together_privileges_probe() to service_role;
