-- 새로 저장하면 지난 판의 취향표 연결은 무효다 — **값이 달라졌는지 보지 않는다.**
--
-- 20260926050931 은 이 규칙을 표의 방아쇠로 두고 `ranking` 이 바뀌었는지 보았다.
-- 그게 틀렸다. 같은 순위가 다시 저장될 수 있다.
--   같은 방을 다시 소트했는데 순위가 우연히 같았다
--   순위는 같고 "모르는 곡" 만 달라졌다
--   순위와 모르는 곡이 모두 같았다
-- 이때 지난 판의 linked_taste_result_id 가 남아, 새 판의 참여가 **옛 취향표를**
-- 가리킨다. 목록에서 지금 판이 옛 취향표를 숨기거나, 지운 취향표를 가리킨다.
--
-- 경계는 값의 변화가 아니라 **저장 호출 그 자체**다. save RPC 가 불렸다면 그것은
-- "이 참여를 지금 판으로 다시 적는다" 는 뜻이고, 그 판의 취향표는 아직 없다.
-- 그 사실을 아는 곳은 표가 아니라 RPC 다. 그래서 규칙을 RPC 로 옮긴다.

---------------------------------------------------------------------------
-- 1. 방아쇠를 걷는다
---------------------------------------------------------------------------

/*
 * 남겨 두지 않는 이유.
 *
 *   - 잡지 못하는 경우가 있다. 위의 세 경우가 그대로 통과한다.
 *   - RPC 와 책임이 겹친다. 두 곳이 같은 규칙을 들면 반드시 갈라진다.
 *   - **표만 보면 규칙이 완전해 보인다.** 다음 사람이 여기까지 읽고 안심한다.
 *
 * 방어를 한 겹 더 둘 자리가 있는지 확인했다. 기본 표에 write 권한을 가진 role 은
 * postgres 와 service_role 뿐이고(anon, authenticated 는 20260925100000 에서 닫혔다),
 * ranking 을 쓰는 길은 _save_sort_challenge_entry 와 claim_sort_challenge_entry
 * 두 함수뿐이다. 서버가 service_role 로 직접 쓰는 곳은 탈퇴 처리의 닉네임 지우기
 * 하나이고 순위를 건드리지 않는다. 즉 방아쇠가 덮어 주는 경로가 남아 있지 않다.
 */
drop trigger if exists together_entry_clear_stale_link on public.sort_challenge_entries;
drop function if exists public.together_entry_clear_stale_link();

---------------------------------------------------------------------------
-- 2. 저장 — 기존 참여를 고치는 모든 길에서 연결을 끊는다
---------------------------------------------------------------------------

/*
 * 시그니처는 그대로다. v1, v2 껍데기(운영 중인 main 이 부르는 v1 포함)는 손대지 않는다.
 * 달라진 곳은 세 군데의 linked_taste_result_id 뿐이다.
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
   * found 는 다음 select 가 덮어쓰므로 여기서 붙잡아 둔다.
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
           claim_token_hash = coalesce(v_hash, claim_token_hash),
           -- 이 호출이 새 판의 저장이다. 순위가 같아도 옛 취향표 연결은 무효다.
           linked_taste_result_id = null
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
           user_id = coalesce(v_uid, user_id), claim_token_hash = coalesce(v_hash, claim_token_hash),
           linked_taste_result_id = null
     where id = v_here.id;
    return v_here.id;
  end if;

  -- 새 참여. 아직 취향표가 없으므로 연결도 없다(기본값에 기대지 않고 적는다).
  insert into public.sort_challenge_entries
    (challenge_id, participant_key, nickname, ranking, skipped_count, skipped_track_ids,
     imported, user_id, claim_token_hash, linked_taste_result_id)
  values (p_challenge_id, p_participant_key, p_nickname, p_ranking, v_count, v_skipped,
          coalesce(p_imported, false), v_uid, v_hash, null)
  returning id into v_here;
  return v_here.id;
end; $$;

revoke execute on function public._save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public._save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, jsonb, boolean)
  to service_role;

---------------------------------------------------------------------------
-- 3. 합치기 — 게스트 판이 계정 행을 덮으면 계정의 옛 연결도 끊긴다
---------------------------------------------------------------------------

/*
 * 시그니처는 그대로다(운영 main 호환). 달라진 곳은 linked_taste_result_id 뿐이다.
 *
 * 합치기는 게스트로 끝낸 판의 순위를 계정 행에 옮긴다. 그 순간 계정 행이 가리키던
 * 취향표는 **다른 판의 것**이다. 남겨 두면 지난 판의 취향표가 이 참여에 붙는다.
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
           claim_token_hash = v_here.claim_token_hash,
           -- 게스트 판으로 덮는다. 계정의 옛 판이 남긴 연결은 이 판의 것이 아니다.
           linked_taste_result_id = null
     where id = v_owned.id;
    delete from public.sort_challenge_entries where id = v_here.id;
    return v_owned.id;
  end if;

  /*
   * 게스트 행이 그대로 계정 것이 된다. 순위는 그대로이므로 끊을 연결이 있을 수 없고,
   * 애초에 게스트 행은 연결을 가질 수 없다(link RPC 는 user_id = auth.uid() 인 행만
   * 고친다). 그 사실을 다른 함수에서 증명해 와야 알 수 있게 두지 않고 여기서 적는다.
   */
  update public.sort_challenge_entries
     set user_id = v_uid, linked_taste_result_id = null
   where id = v_here.id;
  return v_here.id;
end; $$;

revoke execute on function public.claim_sort_challenge_entry(uuid, text, text) from public, anon;
grant execute on function public.claim_sort_challenge_entry(uuid, text, text) to authenticated, service_role;
