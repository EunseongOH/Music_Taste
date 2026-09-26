-- 같이 소트하기: **어떤 곡을 몰랐는지** 를 남긴다.
--
-- 지금은 `skipped_count` 뿐이라 "2곡을 몰랐다" 는 알아도 "어느 2곡인지" 는 모른다.
-- 그래서 결과 화면의 순위 비교에서 모르는 곡을 표시할 방법이 없었다.
--
-- **UI 보다 데이터 경계를 먼저 고친다.** 없는 값을 화면에서 추측하게 두지 않는다.
--
-- 배포 순서: 이 마이그레이션이 **먼저** 올라가고 코드가 나중에 온다. 그래서 지금
-- 운영 중인 main(v1 만 아는 코드)이 이 변경만으로 깨지면 안 된다.
--   - v1 의 시그니처를 바꾸지 않는다
--   - 새 컬럼은 기본값이 있다
--   - v1 이 쓰면 `skipped_track_ids` 를 **`[]` 로 명시한다**
--     (v2 가 적어 둔 곡 목록이 남아 있는데 옛 클라이언트가 순위만 새로 쓰면,
--      지난 판의 "모르는 곡" 이 새 순위에 붙어 거짓이 된다)

---------------------------------------------------------------------------
-- 1. 컬럼
---------------------------------------------------------------------------

alter table public.sort_challenge_entries
  add column if not exists skipped_track_ids jsonb not null default '[]'::jsonb;

-- 배열이 아닌 것이 들어오면 세는 쪽·읽는 쪽이 모두 터진다. 모양을 DB 가 지킨다.
alter table public.sort_challenge_entries
  drop constraint if exists sort_challenge_entries_skipped_track_ids_is_array;
alter table public.sort_challenge_entries
  add constraint sort_challenge_entries_skipped_track_ids_is_array
  check (jsonb_typeof(skipped_track_ids) = 'array');

comment on column public.sort_challenge_entries.skipped_track_ids is
  '"모르는 곡" 으로 뺀 곡 id. 순위가 아니다 — ranking 에 넣지 않는다. 일치율 계산에도 쓰지 않는다.';

---------------------------------------------------------------------------
-- 2. 공개 컬럼에 더한다
---------------------------------------------------------------------------

/*
 * 기본 테이블은 20260925100000 에서 컬럼 단위로 잠갔다. 새 컬럼은 **자동으로 열리지
 * 않는다.** 참여자 비교에 필요한 값이므로 이것만 연다.
 *
 * `grant select on table ...` 로 되돌리지 않는다 — `user_id`·`claim_token_hash` 는
 * 계속 밖에서 읽을 수 없어야 한다.
 */
grant select (skipped_track_ids) on table public.sort_challenge_entries to anon, authenticated;

---------------------------------------------------------------------------
-- 3. 저장 규칙은 한 곳에만 — v1·v2 가 나눠 쓴다
---------------------------------------------------------------------------

/*
 * 보안 규칙(증명 확인·계정 소유·합치기)을 두 함수에 복사하면 반드시 갈라진다.
 * 속을 하나로 두고 v1·v2 는 껍데기로 남긴다. 이 함수는 클라이언트가 부를 수 없다.
 */
create or replace function public._save_sort_challenge_entry(
  p_challenge_id uuid, p_participant_key text, p_claim_token text,
  p_nickname text, p_ranking jsonb, p_skipped_count integer,
  p_skipped_track_ids jsonb, p_imported boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := public.together_hash(p_claim_token);
  v_here public.sort_challenge_entries%rowtype;
  v_owned public.sort_challenge_entries%rowtype;
  v_mine boolean;
  v_skipped jsonb := coalesce(p_skipped_track_ids, '[]'::jsonb);
  v_count integer := coalesce(p_skipped_count, 0);
begin
  if p_challenge_id is null or coalesce(p_participant_key, '') = '' then
    raise exception 'challenge_id 와 participant_key 가 필요해요.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_skipped) <> 'array' then
    raise exception '모르는 곡 목록은 배열이어야 해요.' using errcode = '22023';
  end if;

  select * into v_here from public.sort_challenge_entries
   where challenge_id = p_challenge_id and participant_key = p_participant_key for update;

  /*
   * 참여 키 자리에 있는 행이 **내 것이라고 보였는가.**
   *   - 증명(claim secret)이 맞다
   *   - 로그인했고 그 행이 내 계정의 것이다
   * 증명이 없다는 건 "자유롭게 쓰라" 가 아니라 "누구 것인지 모른다" 다.
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

  -- 내 계정의 기록이 이 방에 있으면 거기에 쓴다. 참여 키 자리의 남의 행은 건드리지 않는다.
  if v_owned.id is not null then
    if v_mine and v_here.id is not null and v_here.id <> v_owned.id then
      delete from public.sort_challenge_entries where id = v_here.id;
    end if;
    update public.sort_challenge_entries
       set ranking = p_ranking, skipped_count = v_count, skipped_track_ids = v_skipped,
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
       set ranking = p_ranking, skipped_count = v_count, skipped_track_ids = v_skipped,
           imported = coalesce(p_imported, false), nickname = coalesce(p_nickname, nickname),
           user_id = coalesce(v_uid, user_id), claim_token_hash = coalesce(v_hash, claim_token_hash)
     where id = v_here.id;
    return v_here.id;
  end if;

  insert into public.sort_challenge_entries
    (challenge_id, participant_key, nickname, ranking, skipped_count, skipped_track_ids,
     imported, user_id, claim_token_hash)
  values (p_challenge_id, p_participant_key, p_nickname, p_ranking, v_count, v_skipped,
          coalesce(p_imported, false), v_uid, v_hash)
  returning id into v_here;
  return v_here.id;
end; $$;

-- 속은 밖에서 못 부른다. 껍데기(v1·v2)만 연다.
revoke execute on function public._save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public._save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, jsonb, boolean)
  to service_role;

---------------------------------------------------------------------------
-- 4. v1 — 시그니처 그대로. 운영 중인 main 이 계속 부른다
---------------------------------------------------------------------------

create or replace function public.save_sort_challenge_entry(
  p_challenge_id uuid, p_participant_key text, p_claim_token text,
  p_nickname text, p_ranking jsonb, p_skipped_count integer default 0,
  p_imported boolean default false
) returns uuid language sql security definer set search_path = public, pg_temp as $$
  -- 옛 클라이언트는 **어떤 곡을 몰랐는지 모른다.** 그러니 빈 배열로 적는다.
  -- 지난 판의 목록을 남겨 두면 새 순위에 붙어 거짓이 된다.
  select public._save_sort_challenge_entry(
    p_challenge_id, p_participant_key, p_claim_token, p_nickname, p_ranking,
    coalesce(p_skipped_count, 0), '[]'::jsonb, p_imported
  );
$$;

revoke execute on function public.save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, boolean)
  from public;
grant execute on function public.save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, boolean)
  to anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 5. v2 — 어떤 곡을 몰랐는지 함께 받는다
---------------------------------------------------------------------------

/*
 * 개수는 **서버가 센다.** 클라이언트가 `skipped_count = 3` 과
 * `skipped_track_ids = ['A']` 처럼 어긋나게 보낼 수 있는 길을 두지 않는다.
 */
create or replace function public.save_sort_challenge_entry_v2(
  p_challenge_id uuid, p_participant_key text, p_claim_token text,
  p_nickname text, p_ranking jsonb, p_skipped_track_ids jsonb default '[]'::jsonb,
  p_imported boolean default false
) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select public._save_sort_challenge_entry(
    p_challenge_id, p_participant_key, p_claim_token, p_nickname, p_ranking,
    jsonb_array_length(
      case when jsonb_typeof(coalesce(p_skipped_track_ids, '[]'::jsonb)) = 'array'
           then coalesce(p_skipped_track_ids, '[]'::jsonb) else '[]'::jsonb end
    ),
    coalesce(p_skipped_track_ids, '[]'::jsonb), p_imported
  );
$$;

-- 함수를 만들면 PUBLIC EXECUTE 가 기본으로 붙는다. v1 과 같은 원칙으로 걷는다.
revoke execute on function public.save_sort_challenge_entry_v2(uuid, text, text, text, jsonb, jsonb, boolean)
  from public;
grant execute on function public.save_sort_challenge_entry_v2(uuid, text, text, text, jsonb, jsonb, boolean)
  to anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 6. claim — 합칠 때 모르는 곡도 함께 옮긴다
---------------------------------------------------------------------------

/*
 * 시그니처는 그대로 둔다(운영 main 호환). 익명 기록을 계정 기록으로 합칠 때
 * 순위만 옮기고 모르는 곡을 두고 가면, 로그인하는 순간 "어떤 곡을 몰랐는지" 가 사라진다.
 */
create or replace function public.claim_sort_challenge_entry(
  p_challenge_id uuid, p_participant_key text, p_claim_token text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := public.together_hash(p_claim_token);
  v_here public.sort_challenge_entries%rowtype;
  v_owned public.sort_challenge_entries%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if v_hash is null then return null; end if;

  select * into v_here from public.sort_challenge_entries
   where challenge_id = p_challenge_id and participant_key = p_participant_key for update;
  if not found then return null; end if;

  -- 증명이 아예 없는 옛 기록. 붙일 근거가 없으므로 조용히 아무것도 하지 않는다.
  if v_here.claim_token_hash is null then return null; end if;

  if v_here.claim_token_hash <> v_hash then
    raise exception '이 기록의 주인임을 확인하지 못했어요.' using errcode = '42501';
  end if;
  if v_here.user_id = v_uid then return v_here.id; end if;
  if v_here.user_id is not null then
    raise exception '이미 다른 계정이 가진 기록이에요.' using errcode = '42501';
  end if;

  select * into v_owned from public.sort_challenge_entries
   where challenge_id = p_challenge_id and user_id = v_uid for update;

  if v_owned.id is not null then
    update public.sort_challenge_entries
       set ranking = v_here.ranking, skipped_count = v_here.skipped_count,
           skipped_track_ids = v_here.skipped_track_ids,
           imported = v_here.imported,
           nickname = coalesce(nullif(v_owned.nickname, ''), v_here.nickname),
           claim_token_hash = v_here.claim_token_hash
     where id = v_owned.id;
    delete from public.sort_challenge_entries where id = v_here.id;
    return v_owned.id;
  end if;

  update public.sort_challenge_entries set user_id = v_uid where id = v_here.id;
  return v_here.id;
end; $$;

revoke execute on function public.claim_sort_challenge_entry(uuid, text, text) from public, anon;
grant execute on function public.claim_sort_challenge_entry(uuid, text, text) to authenticated, service_role;

---------------------------------------------------------------------------
-- 7. 권한을 밖에서 확인하는 창구에 v2 를 더한다
---------------------------------------------------------------------------

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
                       'my_sort_challenge_entry', 'my_sort_challenge_rooms', 'together_hash');
$$;

revoke execute on function public.together_privileges_probe() from public, anon, authenticated;
grant execute on function public.together_privileges_probe() to service_role;
