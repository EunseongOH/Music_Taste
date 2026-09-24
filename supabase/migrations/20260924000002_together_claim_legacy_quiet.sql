-- 증명이 없는 옛 기록에는 조용히 아무것도 하지 않는다.
--
-- 20260924000001 의 claim 함수는 `claim_token_hash` 가 다르면 오류를 던졌다. 그런데
-- `is distinct from` 는 **값이 없는 것도 "다르다"** 로 본다. 소유권 구조가 생기기 전에
-- 남은 기록은 해시가 아예 없어서, 그 사람이 로그인하면 "이 기록의 주인임을 확인하지
-- 못했어요" 가 떴다 — 사용자가 잘못한 게 없는데 화면이 사용자를 탓했다.
--
-- 붙일 근거가 없는 것은 맞으니 붙이지는 않는다. 다만 **말없이 지나간다.** 그 사람은
-- 그냥 새로 참여하면 되고, 익명으로 남긴 옛 기록은 그대로 있는다.
--
-- 이 파일은 운영에 이미 올라간 것(20260924133214)을 저장소로 되돌린 것이다.

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
  -- 오류를 던지면 화면이 "주인임을 확인하지 못했어요" 를 띄우는데, 사용자가 잘못한 게 없다.
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
