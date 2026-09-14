-- 닉네임 규정 + 쓰기 경로 단일화.
--
-- 이전: 닉네임이 세 곳에 흩어져 있었다.
--   auth.users.user_metadata.nickname  — 실제로 쓰이던 값(사용자가 직접 쓸 수 있음)
--   tournament_results.user_nickname    — 결과마다 저장된 사본. 모든 화면이 이걸 읽는다
--   profiles.nickname                   — 아무도 안 씀. 가입 트리거가 'User' 로 채움
-- 검증은 빈 값 체크뿐이었고, 중복 검사는 공개 결과의 사본만 봤다.
--
-- 이후: profiles.nickname 을 기준으로 삼는다.
--   - 규정(nickname_error)과 대소문자 무시 유니크 인덱스를 DB 가 강제한다
--   - 결과 사본은 트리거가 profiles 에서 채운다(클라이언트가 임의 값을 못 넣는다)
--   - 바꾸는 길은 set_my_nickname 하나. profiles·결과 사본·user_metadata 를 함께 갱신
--
-- additive: 기존 컬럼·정책은 건드리지 않는다. 적용 시점 기존 닉네임 18개는 모두
-- 규정을 만족하고 서로 겹치지 않았다.

-- 1. 규정 ------------------------------------------------------------------
-- 오류 코드(too_short|too_long|invalid_chars|banned) 또는 null.
-- src/utils/nickname.ts 의 validateNickname 과 같아야 한다(즉시 피드백용 사본).
CREATE OR REPLACE FUNCTION public.nickname_error(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL OR char_length(btrim(p)) < 2 THEN 'too_short'
    WHEN char_length(btrim(p)) > 12 THEN 'too_long'
    WHEN btrim(p) !~ '^[가-힣A-Za-z0-9_.]+$' THEN 'invalid_chars'
    -- 사칭: 포함되면 금지
    WHEN lower(btrim(p)) ~ '(관리자|운영자|admin|sortify|공식|official)' THEN 'banned'
    -- 사칭: 그 자체인 경우만 금지(토스트·소트라 같은 평범한 이름은 허용)
    WHEN lower(btrim(p)) IN ('toss', '토스', '소트', 'sort', '토스팀', 'tossteam') THEN 'banned'
    -- ponytail: 욕설은 작은 정적 목록. 신고·운영 이슈가 생기면 테이블로 옮긴다.
    WHEN lower(btrim(p)) ~ '(시발|씨발|ㅅㅂ|병신|븅신|개새|좆|존나|섹스|fuck|shit|bitch|sex)' THEN 'banned'
    ELSE NULL
  END
$$;

-- 2. 기준값 백필 + 유니크 -----------------------------------------------------
UPDATE public.profiles p
SET nickname = u.raw_user_meta_data->>'nickname'
FROM auth.users u
WHERE u.id = p.id
  AND u.raw_user_meta_data->>'nickname' IS NOT NULL
  AND p.nickname IS DISTINCT FROM u.raw_user_meta_data->>'nickname';

-- 'User' 는 가입 트리거의 기본값이라 여러 명이 가질 수 있다. 제외한다.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_lower_key
  ON public.profiles (lower(nickname))
  WHERE nickname IS NOT NULL AND nickname <> 'User';

-- 3. profiles 를 직접 고쳐도 규정은 지킨다 -------------------------------------
-- profiles 에는 "소유자 UPDATE 허용" 정책이 있어 클라이언트가 직접 바꿀 수 있다.
CREATE OR REPLACE FUNCTION public.enforce_profile_nickname()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE e text;
BEGIN
  IF NEW.nickname IS DISTINCT FROM OLD.nickname
     AND current_setting('role', true) = 'authenticated' THEN
    e := public.nickname_error(NEW.nickname);
    IF e IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'nickname_' || e;
    END IF;
    NEW.nickname := btrim(NEW.nickname);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_profile_nickname_trigger ON public.profiles;
CREATE TRIGGER enforce_profile_nickname_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_nickname();

-- 4. 결과 사본은 profiles 에서 채운다 ------------------------------------------
-- 클라이언트가 보낸 user_nickname 은 profiles 에 유효한 값이 있으면 덮어쓴다.
-- 'User'(OAuth 가입 직후 기본값)거나 없으면 보낸 값을 그대로 둔다 — 자동 닉네임이
-- 채워지기 전의 짧은 창 동안 저장이 막히지 않게.
CREATE OR REPLACE FUNCTION public.sync_result_nickname()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n text;
BEGIN
  SELECT nickname INTO n FROM public.profiles WHERE id = NEW.user_id;
  IF n IS NOT NULL AND n <> 'User' THEN
    NEW.user_nickname := n;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_result_nickname_trigger ON public.tournament_results;
CREATE TRIGGER sync_result_nickname_trigger
  BEFORE INSERT OR UPDATE ON public.tournament_results
  FOR EACH ROW EXECUTE FUNCTION public.sync_result_nickname();

-- 옛 이름으로 남은 사본을 한 번 맞춘다(트리거가 profiles 값으로 채운다).
UPDATE public.tournament_results r
SET user_nickname = p.nickname
FROM public.profiles p
WHERE p.id = r.user_id
  AND p.nickname IS NOT NULL AND p.nickname <> 'User'
  AND r.user_nickname IS DISTINCT FROM p.nickname;

-- 5. 쓰기 경로 ----------------------------------------------------------------
-- 'ok' 또는 오류 코드(not_authenticated|too_short|too_long|invalid_chars|banned|taken).
-- p_confirm: 사용자가 직접 확인한 이름인지. 자동 생성은 false 로 부른다.
CREATE OR REPLACE FUNCTION public.set_my_nickname(p_nickname text, p_confirm boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n text := btrim(coalesce(p_nickname, ''));
  e text;
BEGIN
  IF uid IS NULL THEN RETURN 'not_authenticated'; END IF;

  e := public.nickname_error(n);
  IF e IS NOT NULL THEN RETURN e; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(nickname) = lower(n) AND id <> uid) THEN
    RETURN 'taken';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, nickname) VALUES (uid, n)
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    RETURN 'taken';
  END;

  UPDATE public.tournament_results SET user_nickname = n
  WHERE user_id = uid AND user_nickname IS DISTINCT FROM n;

  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('nickname', n)
    || CASE WHEN p_confirm THEN jsonb_build_object('nickname_confirmed', true) ELSE '{}'::jsonb END
  WHERE id = uid;

  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.set_my_nickname(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_nickname(text, boolean) TO authenticated;

-- 가입 전(anon)에도 부를 수 있어야 한다. 규정 + 중복만 본다.
CREATE OR REPLACE FUNCTION public.nickname_available(p text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.nickname_error(p) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE lower(nickname) = lower(btrim(p))
         AND id IS DISTINCT FROM auth.uid()
     )
$$;

GRANT EXECUTE ON FUNCTION public.nickname_available(text) TO anon, authenticated;
