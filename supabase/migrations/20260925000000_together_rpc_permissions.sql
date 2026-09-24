-- 같이 소트하기 RPC: 로그인 사용자만 쓰는 함수는 로그인 사용자에게만 연다.
--
-- PostgreSQL 은 함수를 만들면 **EXECUTE 를 PUBLIC 에 기본으로 준다.** 앞선
-- 마이그레이션(20260924000001)에서 `grant execute ... to authenticated` 만 적었기
-- 때문에, 기본 PUBLIC 권한이 남아 anon 도 부를 수 있는 상태였다.
--
-- 함수 안에서 `auth.uid()` 를 확인하므로 지금 당장 남의 기록을 가져갈 수 있는 것은
-- 아니다. 다만 **뜻과 권한이 어긋나 있다.** 안에서 막는 것과 밖에서 잠그는 것은 다르고,
-- 다음에 함수를 고치는 사람이 그 검사를 믿고 빼면 그때 뚫린다.
--
-- `save_sort_challenge_entry` 는 다르다 — 로그인하지 않은 참여자도 결과를 남겨야 하므로
-- anon 을 막지 않는다. 그게 같이 소트하기의 전제다.
--
-- `together_hash` 는 이미 잠겨 있다(anon·authenticated 둘 다 실행 불가). 그대로 둔다.

-- 익명 기록에 계정 소유권을 붙이는 함수. 로그인하지 않으면 할 일이 없다.
revoke execute on function
  public.claim_sort_challenge_entry(uuid, text, text)
from public, anon;

grant execute on function
  public.claim_sort_challenge_entry(uuid, text, text)
to authenticated, service_role;

-- 내 계정이 가진 기록의 id. 계정이 없으면 물어볼 것이 없다.
revoke execute on function
  public.my_sort_challenge_entry(uuid)
from public, anon;

grant execute on function
  public.my_sort_challenge_entry(uuid)
to authenticated, service_role;
