-- 같이 소트하기: 참여 기록 저장·소유권 연결을 함수로 옮기고 UPDATE 를 좁힌다.
--
-- 지금 UPDATE 정책은 이름만 "their own" 이고 실제로는 USING(true) WITH CHECK(true) 다 —
-- 아무나 아무 행이나 고칠 수 있다. 참여 기록은 관계도 때문에 누구나 읽을 수 있으므로
-- `participant_key` 는 응답에 그대로 실린다. 그 값만 알면 남의 순위를 덮어쓸 수 있었다.
--
-- 두 함수를 둔다(둘 다 SECURITY DEFINER, 한 트랜잭션).
--   save_sort_challenge_entry   참여 기록을 남긴다. 고칠 자격을 확인한다.
--   claim_sort_challenge_entry  익명 기록에 계정 소유권을 붙인다.
--
-- **user_id 는 절대 인자로 받지 않는다.** 언제나 auth.uid() 에서 가져온다.

-- 증명은 sha-256 으로만 비교한다. 원문은 브라우저에만 있다.
create or replace function public.together_hash(p_token text)
returns text
language sql
immutable
as $$
  select case when p_token is null or p_token = '' then null
              else encode(sha256(convert_to(p_token, 'utf8')), 'hex') end;
$$;

/*
 * 참여 기록을 남긴다(없으면 만들고, 있으면 고친다).
 *
 * 고칠 자격은 셋 중 하나다.
 *   1) 증명이 맞다            — 이 기기가 만든 기록
 *   2) 내 계정이 가진 기록이다
 *   3) 증명이 아예 없다        — 이 기능이 생기기 전의 기록(legacy). 그대로 둔다.
 *      보안을 올린다며 기존 방의 "다시 소트하기" 를 깨지 않는다.
 *
 * 로그인 상태면 이 방에 이미 내 계정 기록이 있는지 본다. 있으면 **그 기록을 고치고**
 * 지금 기기 기록은 지운다 — 한 계정이 한 방에 참가자 둘로 앉지 않게.
 */
create or replace function public.save_sort_challenge_entry(
  p_challenge_id uuid,
  p_participant_key text,
  p_claim_token text,
  p_nickname text,
  p_ranking jsonb,
  p_skipped_count integer default 0,
  p_imported boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_hash  text := public.together_hash(p_claim_token);
  v_here  public.sort_challenge_entries%rowtype;
  v_owned public.sort_challenge_entries%rowtype;
begin
  if p_challenge_id is null or coalesce(p_participant_key, '') = '' then
    raise exception 'challenge_id 와 participant_key 가 필요해요.' using errcode = '22023';
  end if;

  select * into v_here from public.sort_challenge_entries
   where challenge_id = p_challenge_id and participant_key = p_participant_key
   for update;

  if found and not (
       (v_here.claim_token_hash is not null and v_here.claim_token_hash = v_hash)
       or (v_uid is not null and v_here.user_id = v_uid)
       or v_here.claim_token_hash is null
     ) then
    raise exception '이 기록을 고칠 수 없어요.' using errcode = '42501';
  end if;

  if v_uid is not null then
    select * into v_owned from public.sort_challenge_entries
     where challenge_id = p_challenge_id and user_id = v_uid
     for update;
  end if;

  -- 같은 방에 내 계정 기록이 이미 있고 그게 지금 기기 기록과 다른 행이면, 하나로 합친다.
  if v_owned.id is not null and (v_here.id is null or v_owned.id <> v_here.id) then
    if v_here.id is not null then
      delete from public.sort_challenge_entries where id = v_here.id;
    end if;
    update public.sort_challenge_entries
       set ranking = p_ranking,
           skipped_count = coalesce(p_skipped_count, 0),
           imported = coalesce(p_imported, false),
           -- 닉네임은 이미 다른 참가자에게 보인 이름이다. 비어 있을 때만 채운다.
           nickname = coalesce(nullif(v_owned.nickname, ''), p_nickname),
           claim_token_hash = coalesce(v_hash, claim_token_hash)
     where id = v_owned.id;
    return v_owned.id;
  end if;

  if v_here.id is not null then
    update public.sort_challenge_entries
       set ranking = p_ranking,
           skipped_count = coalesce(p_skipped_count, 0),
           imported = coalesce(p_imported, false),
           nickname = coalesce(p_nickname, nickname),
           user_id = coalesce(v_uid, user_id),
           claim_token_hash = coalesce(v_hash, claim_token_hash)
     where id = v_here.id;
    return v_here.id;
  end if;

  insert into public.sort_challenge_entries
    (challenge_id, participant_key, nickname, ranking, skipped_count, imported, user_id, claim_token_hash)
  values
    (p_challenge_id, p_participant_key, p_nickname, p_ranking, coalesce(p_skipped_count, 0),
     coalesce(p_imported, false), v_uid, v_hash)
  returning id into v_here;
  return v_here.id;
end;
$$;

/*
 * 익명으로 남긴 기록에 계정 소유권을 붙인다.
 *
 * **증명이 맞을 때만** 붙인다. `participant_key` 는 관계도 응답에 실려 있으므로
 * 그것만으로 "내 것" 이라고 말할 수 있게 두면 남의 기록을 가져갈 수 있다.
 * 증명이 없는 옛 기록(claim_token_hash is null)은 붙이지 않는다 — 근거가 없다.
 * 그 기록은 화면에서 기기 신원으로 계속 "내 결과" 로 보인다.
 *
 * participant_key·id·ranking·created_at 은 그대로 둔다. 관계도의 내 자리가 움직이면 안 된다.
 */
create or replace function public.claim_sort_challenge_entry(
  p_challenge_id uuid,
  p_participant_key text,
  p_claim_token text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_hash  text := public.together_hash(p_claim_token);
  v_here  public.sort_challenge_entries%rowtype;
  v_owned public.sort_challenge_entries%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if v_hash is null then
    return null; -- 증명이 없으면 조용히 아무것도 하지 않는다(옛 기록).
  end if;

  select * into v_here from public.sort_challenge_entries
   where challenge_id = p_challenge_id and participant_key = p_participant_key
   for update;
  if not found then
    return null;
  end if;
  -- 증명이 아예 없는 옛 기록. 붙일 근거가 없으므로 조용히 아무것도 하지 않는다.
  -- 오류를 던지면 화면이 "주인임을 확인하지 못했어요" 를 띄우는데, 사용자가 잘못한 게 없다.
  if v_here.claim_token_hash is null then return null; end if;

  if v_here.claim_token_hash <> v_hash then
    raise exception '이 기록의 주인임을 확인하지 못했어요.' using errcode = '42501';
  end if;
  if v_here.user_id = v_uid then
    return v_here.id; -- 이미 내 것
  end if;
  if v_here.user_id is not null then
    raise exception '이미 다른 계정이 가진 기록이에요.' using errcode = '42501';
  end if;

  select * into v_owned from public.sort_challenge_entries
   where challenge_id = p_challenge_id and user_id = v_uid
   for update;

  -- 같은 방에 내 계정 기록이 이미 있으면, 방금 만든 이 결과를 최신으로 보고 하나로 합친다.
  if v_owned.id is not null then
    update public.sort_challenge_entries
       set ranking = v_here.ranking,
           skipped_count = v_here.skipped_count,
           imported = v_here.imported,
           nickname = coalesce(nullif(v_owned.nickname, ''), v_here.nickname),
           claim_token_hash = v_here.claim_token_hash
     where id = v_owned.id;
    delete from public.sort_challenge_entries where id = v_here.id;
    return v_owned.id;
  end if;

  update public.sort_challenge_entries set user_id = v_uid where id = v_here.id;
  return v_here.id;
end;
$$;

/*
 * 내가 이 방에서 가진 기록의 id. 남의 user_id 를 화면에 내려보내지 않기 위해,
 * 목록 조회에서는 user_id 를 빼고 이 함수로 내 것만 확인한다.
 */
create or replace function public.my_sort_challenge_entry(p_challenge_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select id from public.sort_challenge_entries
   where challenge_id = p_challenge_id and user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.together_hash(text) from public, anon, authenticated;
grant execute on function public.save_sort_challenge_entry(uuid, text, text, text, jsonb, integer, boolean) to anon, authenticated;
grant execute on function public.claim_sort_challenge_entry(uuid, text, text) to authenticated;
grant execute on function public.my_sort_challenge_entry(uuid) to authenticated;

/*
 * UPDATE 를 좁힌다.
 *
 * 지금까지 누구나 아무 행이나 고칠 수 있었다. 이제 **증명이 있는 행**은 위 함수로만
 * 고칠 수 있다(함수는 SECURITY DEFINER 라 이 정책을 지나지 않는다).
 *
 * 증명이 없는 옛 익명 행은 그대로 둔다 — 이미 배포된 화면이 그 행을 직접 고치고 있고,
 * 보안을 올린다며 기존 방을 못 쓰게 만들지 않는다. 그 행도 새로 소트하면 증명이 붙어
 * 다음부터는 좁은 쪽으로 넘어간다.
 */
drop policy if exists "Anyone can update their own sort challenge entry" on public.sort_challenge_entries;
create policy "Owned or legacy entries can be updated"
  on public.sort_challenge_entries for update
  using (
    (user_id is not null and user_id = auth.uid())
    or (user_id is null and claim_token_hash is null)
  )
  with check (
    (user_id is not null and user_id = auth.uid())
    or (user_id is null and claim_token_hash is null)
  );
