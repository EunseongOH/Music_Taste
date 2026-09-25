-- 저장 RPC 의 권한을 **적은 대로만** 둔다.
--
-- PostgreSQL 은 함수를 만들면 EXECUTE 를 PUBLIC 에 기본으로 준다. 앞선 마이그레이션들은
-- `grant execute ... to anon, authenticated` 를 적었지만, 기본 PUBLIC 권한은 그대로
-- 남아 있었다. 나머지 세 함수는 20260925000000 에서 걷었는데 이것만 빠졌다.
--
-- 지금 당장 누가 더 할 수 있는 일은 없다 — PostgREST 로 오는 역할은 anon 과
-- authenticated 뿐이고 둘 다 이미 허용이다. 다만 **적힌 것과 실제가 다르다.** 나중에
-- 역할을 하나 더 만들면 아무도 의도하지 않은 채로 이 함수를 부를 수 있게 된다.
--
-- 익명 참여는 같이 소트하기의 전제다. `anon` 은 그대로 둔다 — 여기서 막으면 로그인
-- 없이는 방에 참여할 수 없다.
--
-- 목표
--   save   public false · anon true  · authenticated true
--   claim  public false · anon false · authenticated true   (이미 그렇다)
--   my_*   public false · anon false · authenticated true   (이미 그렇다)
--   hash   클라이언트 전부 false                             (이미 그렇다)

revoke execute on function public.save_sort_challenge_entry(
  uuid, text, text, text, jsonb, integer, boolean
) from public;

grant execute on function public.save_sort_challenge_entry(
  uuid, text, text, text, jsonb, integer, boolean
) to anon, authenticated, service_role;

-- 권한을 **밖에서 확인할 수 있게** 한 칸 연다.
--
-- 검사 스크립트(toss/baseline/together-db-security-check.mjs)는 REST 로만 말할 수 있어서
-- pg_proc 을 직접 못 본다. 응답 코드로 미루어 짐작하면 "401 이니까 막혔겠지" 가 되는데,
-- 그건 막힌 이유를 말해 주지 않는다. 권한을 그대로 읽어 돌려주는 창구를 하나 둔다.
--
-- 읽기만 하고, 함수 이름도 고정 목록이며, `service_role` 만 부를 수 있다.
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
     and p.proname in ('save_sort_challenge_entry', 'claim_sort_challenge_entry',
                       'my_sort_challenge_entry', 'my_sort_challenge_rooms', 'together_hash');
$$;

revoke execute on function public.together_privileges_probe() from public, anon, authenticated;
grant execute on function public.together_privileges_probe() to service_role;
