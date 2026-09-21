-- feedback 테이블의 정책·제약이 실제로 지켜지는지 확인한다.
-- 계획: docs/feedback-plan.md
--
--   psql "$DATABASE_URL" -f scripts/check_feedback_policy.sql
--
-- 전부 롤백하므로 실제 데이터를 남기지 않는다. 하나라도 어긋나면 에러로 멈춘다.
-- 확인하는 것:
--   1) 비로그인(anon)도 의견을 낼 수 있다  ← 이게 막히면 웹 사용자 대부분이 의견을 못 낸다
--   2) 비로그인은 남의 의견(이메일 포함)을 읽을 수 없다
--   3) 너무 짧은 내용과 잘못된 이메일 형식은 DB 가 거절한다

begin;

do $$
declare
  readable int;
  inserted int;
begin
  -- 1) anon insert
  set local role anon;
  insert into public.feedback (kind, message, context)
    values ('service', '테스트 의견입니다', '{"path":"/tracks"}'::jsonb);
  get diagnostics inserted = row_count;
  if inserted <> 1 then
    raise exception 'FAIL(1): anon 이 의견을 낼 수 없다';
  end if;

  -- 2) anon select 차단 (RLS 는 에러가 아니라 0행으로 나온다)
  select count(*) into readable from public.feedback;
  if readable <> 0 then
    raise exception 'FAIL(2): anon 이 의견 %건을 읽었다 — 이메일이 노출된다', readable;
  end if;

  -- 3) 길이 제약
  begin
    insert into public.feedback (kind, message) values ('service', '짧');
    raise exception 'FAIL(3a): 5자 미만이 통과했다';
  exception when check_violation then null;
  end;

  -- 3) 이메일 형식 제약
  begin
    insert into public.feedback (kind, message, email)
      values ('service', '테스트 의견입니다', 'not-an-email');
    raise exception 'FAIL(3b): 잘못된 이메일 형식이 통과했다';
  exception when check_violation then null;
  end;

  reset role;
  raise notice 'OK: feedback 정책·제약 4가지 모두 통과';
end $$;

rollback;
