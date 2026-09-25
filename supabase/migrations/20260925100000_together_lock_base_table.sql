-- 같이 소트하기: 증명 없는 수정 통로를 닫고, 기본 테이블을 잠근다.
--
-- Audit 에서 나온 것 — 운영 31건 중 **30건이 증명 없는 행**이었고, 로그인한 아무나
-- 방의 `participant_key` 를 읽어 그 행들을 자기 계정으로 가져갈 수 있었다. 통로가 둘이다.
--
--  1) `save_sort_challenge_entry` 안의 `or v_here.claim_token_hash is null`
--     증명이 없다는 사실 자체를 수정 권한으로 인정했다. 그리고 그 아래
--     `user_id = coalesce(v_uid, user_id)` 가 부르는 사람의 계정으로 덮어썼다.
--     → 남의 기록이 내 것이 된다.
--
--  2) UPDATE RLS 정책의 둘째 갈래
--     `(user_id is null and claim_token_hash is null)` 은 **아무나** 통과한다.
--     기본 테이블에 anon·authenticated 가 전 컬럼 UPDATE 권한을 갖고 있었으므로
--     RPC 를 거치지 않고 바로 쓸 수 있었다. `user_id` 를 자기 uuid 로 적으면
--     WITH CHECK 의 첫 갈래를 만족해 통과한다.
--
-- `participant_key` 는 anon 이 SELECT 로 읽을 수 있어 추측할 필요조차 없었다.
--
-- 이 마이그레이션이 정하는 규칙:
--
--   증명(claim_token_hash)이 맞다              -> 고칠 수 있다
--   증명이 없지만 **내 계정의 기록**이다        -> 그 계정만 고칠 수 있다   (17건)
--   증명도 없고 주인도 없다                    -> 아무도 못 고친다(읽기 전용) (13건)
--
-- 옛 행을 지우지 않는다. 닉네임·순위가 같다는 이유로 계정에 붙이지도 않는다.
-- 증명 없이 secure 행으로 승격시키지 않는다 — 그게 위 1)번이 하던 일이다.

---------------------------------------------------------------------------
-- 1. 증명 없는 수정 통로를 없앤다
---------------------------------------------------------------------------

create or replace function public.save_sort_challenge_entry(
  p_challenge_id uuid, p_participant_key text, p_claim_token text,
  p_nickname text, p_ranking jsonb, p_skipped_count integer default 0,
  p_imported boolean default false
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := public.together_hash(p_claim_token);
  v_here public.sort_challenge_entries%rowtype;
  v_owned public.sort_challenge_entries%rowtype;
  v_mine boolean;
begin
  if p_challenge_id is null or coalesce(p_participant_key, '') = '' then
    raise exception 'challenge_id 와 participant_key 가 필요해요.' using errcode = '22023';
  end if;

  select * into v_here from public.sort_challenge_entries
   where challenge_id = p_challenge_id and participant_key = p_participant_key for update;

  /*
   * 참여 키 자리에 있는 행이 **내 것이라고 보였는가.**
   *
   *   - 증명(claim secret)이 맞다
   *   - 로그인했고 그 행이 내 계정의 것이다
   *
   * 예전에는 여기에 `or v_here.claim_token_hash is null` 이 있었다. 증명이 **없는** 행은
   * 누구나 고칠 수 있었다는 뜻이다. 참여 키는 방을 보면 읽히니 사실상 무주공산이었고,
   * 아래 update 의 `user_id = coalesce(v_uid, user_id)` 가 남의 기록을 부르는 사람의
   * 계정으로 만들었다. 증명이 없다는 건 "자유롭게 쓰라" 가 아니라 "누구 것인지 모른다" 다.
   *
   * `found` 는 다음 select 가 덮어쓰므로 여기서 붙잡아 둔다.
   */
  v_mine := found and (
      (v_here.claim_token_hash is not null and v_here.claim_token_hash = v_hash)
      or (v_uid is not null and v_here.user_id is not null and v_here.user_id = v_uid)
  );

  if v_uid is not null then
    select * into v_owned from public.sort_challenge_entries
     where challenge_id = p_challenge_id and user_id = v_uid for update;
  end if;

  /*
   * 내 계정의 기록이 이 방에 있으면 **거기에 쓴다.** 참여 키 자리에 남의(또는 주인
   * 모를) 행이 있어도 내 저장을 막지 않는다 — 그 행을 건드리지만 않으면 된다.
   */
  if v_owned.id is not null then
    -- 참여 키 자리의 행이 내 것으로 확인됐고 계정 기록과 다르면 하나로 합친다.
    if v_mine and v_here.id is not null and v_here.id <> v_owned.id then
      delete from public.sort_challenge_entries where id = v_here.id;
    end if;
    update public.sort_challenge_entries
       set ranking = p_ranking, skipped_count = coalesce(p_skipped_count, 0),
           imported = coalesce(p_imported, false),
           nickname = coalesce(nullif(v_owned.nickname, ''), p_nickname),
           claim_token_hash = coalesce(v_hash, claim_token_hash)
     where id = v_owned.id;
    return v_owned.id;
  end if;

  -- 계정 기록이 없다. 참여 키 자리의 행을 고치려면 자격을 보여야 한다.
  if v_here.id is not null then
    if not v_mine then
      raise exception '이 기록을 고칠 수 없어요.' using errcode = '42501';
    end if;
    update public.sort_challenge_entries
       set ranking = p_ranking, skipped_count = coalesce(p_skipped_count, 0),
           imported = coalesce(p_imported, false), nickname = coalesce(p_nickname, nickname),
           user_id = coalesce(v_uid, user_id), claim_token_hash = coalesce(v_hash, claim_token_hash)
     where id = v_here.id;
    return v_here.id;
  end if;

  insert into public.sort_challenge_entries
    (challenge_id, participant_key, nickname, ranking, skipped_count, imported, user_id, claim_token_hash)
  values (p_challenge_id, p_participant_key, p_nickname, p_ranking, coalesce(p_skipped_count, 0),
          coalesce(p_imported, false), v_uid, v_hash)
  returning id into v_here;
  return v_here.id;
end; $$;

-- 익명 참여가 같이 소트하기의 전제다. anon 을 막지 않는다.
grant execute on function public.save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, boolean)
  to anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 2. 내 계정의 방 목록 — `user_id` 를 읽지 않고 묻는다
---------------------------------------------------------------------------

/*
 * 내 취향 스페이스의 "같이 소트한 방" 은 `user_id` 로 걸러 찾고 있었다. 그래서
 * `user_id` 를 public read 에서 뺄 수 없었다 — 프론트가 그 컬럼에 기대고 있었다.
 *
 * 계정 소유는 밖에서 적어 보내는 것이 아니라 `auth.uid()` 가 아는 것이다. 여기로 옮기면
 * 컬럼을 닫을 수 있고, 남의 uuid 를 적어 남의 방 목록을 캐낼 길도 없어진다.
 */
create or replace function public.my_sort_challenge_rooms()
returns table (challenge_id uuid, created_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select e.challenge_id, e.created_at
    from public.sort_challenge_entries e
   where auth.uid() is not null and e.user_id = auth.uid()
   order by e.created_at desc
   limit 50;
$$;

revoke execute on function public.my_sort_challenge_rooms() from public, anon;
grant execute on function public.my_sort_challenge_rooms() to authenticated, service_role;

---------------------------------------------------------------------------
-- 3. 기본 테이블 직접 쓰기를 닫는다
---------------------------------------------------------------------------

/*
 * 쓰기의 유일한 길은 RPC 다.
 *   저장  -> save_sort_challenge_entry
 *   귀속  -> claim_sort_challenge_entry
 *
 * 앱에서 이 테이블에 직접 쓰는 곳은 없다(탈퇴 라우트만 service_role 로 닉네임을 지운다).
 * 그러니 이 권한은 쓰는 데가 아니라 뚫리는 데만 쓰였다.
 */
revoke insert, update, delete, truncate on table public.sort_challenge_entries
  from anon, authenticated, public;

-- 권한을 닫았으니 허용만 하던 쓰기 정책은 남길 이유가 없다. RPC 는 SECURITY DEFINER 로
-- 테이블 주인(postgres) 자격으로 돌아 RLS 를 지나지 않으므로, 지워도 저장·귀속은 그대로다.
drop policy if exists "Anyone can add a sort challenge entry" on public.sort_challenge_entries;
drop policy if exists "Owned or legacy entries can be updated" on public.sort_challenge_entries;

---------------------------------------------------------------------------
-- 4. 민감 컬럼을 public read 에서 뺀다
---------------------------------------------------------------------------

/*
 * 프론트가 안 읽는 것은 보안 경계가 아니다. `fetchEntries` 는 필요한 컬럼만 고르지만,
 * PostgREST 에 `select=user_id,claim_token_hash` 를 직접 물으면 그대로 나왔다.
 *
 *   user_id          방을 건너 같은 계정을 잇는 열쇠
 *   claim_token_hash 소유 증명의 해시
 *
 * 테이블 단위 SELECT 를 걷고, 참가자 화면에 실제로 필요한 컬럼만 컬럼 단위로 준다.
 * `select=*` 는 이제 거부된다 — 앱은 이 테이블에 `*` 를 쓰지 않는다.
 */
revoke select on table public.sort_challenge_entries from anon, authenticated, public;

grant select (id, challenge_id, participant_key, nickname, ranking, skipped_count, imported, created_at)
  on table public.sort_challenge_entries to anon, authenticated;

-- 읽기 정책은 그대로 둔다(방은 누구나 본다). 컬럼 권한이 무엇을 보여 줄지 정한다.
