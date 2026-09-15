-- 닉네임 기준값 전환(20260915000001)의 하위 호환.
--
-- 운영 사이트(main)는 아직 예전 코드다. 예전 코드는 닉네임을 user_metadata 에만
-- 쓰고 profiles 는 건드리지 않는다. 그런데 결과 사본 트리거(sync_result_nickname)는
-- profiles 값을 쓰므로, 예전 프로필 화면에서 이름을 바꾸면 결과 카드가 옛 이름으로
-- 되돌아간다. 또 가입 트리거가 profiles 에 이름을 넣다가 유니크 인덱스에 걸리면
-- 가입 자체가 실패한다(예전 가입 화면의 중복 검사는 공개 결과만 본다).
--
-- 1) user_metadata.nickname 이 바뀌면 profiles 에도 반영한다(규정·중복을 통과할 때만).
--    예외를 던지지 않는다 — auth.users 갱신(로그인 등)을 절대 막지 않기 위해서.
-- 2) 가입 시 이름이 규정 위반이거나 이미 쓰이면 'User' 로 넣는다. 그러면 기존
--    AuthProvider 가 자동 닉네임을 붙인다(기존 OAuth 가입과 같은 경로).
--
-- 새 코드(set_my_nickname)는 profiles 를 먼저 쓰므로 1) 은 아무 일도 하지 않는다.

CREATE OR REPLACE FUNCTION public.sync_profile_nickname_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n text := btrim(NEW.raw_user_meta_data->>'nickname');
BEGIN
  IF n IS NULL
     OR n IS NOT DISTINCT FROM btrim(OLD.raw_user_meta_data->>'nickname')
     OR public.nickname_error(n) IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(nickname) = lower(n) AND id <> NEW.id) THEN
    RETURN NEW;
  END IF;
  BEGIN
    UPDATE public.profiles SET nickname = n, updated_at = now()
    WHERE id = NEW.id AND nickname IS DISTINCT FROM n;
  EXCEPTION WHEN OTHERS THEN
    -- 동시 가입 등으로 인한 유니크 충돌. 로그인·메타데이터 갱신은 그대로 진행.
    NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_profile_nickname_from_auth_trigger ON auth.users;
CREATE TRIGGER sync_profile_nickname_from_auth_trigger
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_nickname_from_auth();

-- 가입 트리거: 이름이 규정 위반이거나 이미 쓰이면 'User' 로 둔다(가입 실패 방지).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n text := btrim(new.raw_user_meta_data->>'nickname');
BEGIN
  IF n IS NULL
     OR public.nickname_error(n) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(nickname) = lower(n)) THEN
    n := 'User';
  END IF;

  INSERT INTO public.profiles (id, nickname, avatar_url, is_admin)
  VALUES (
    new.id,
    n,
    new.raw_user_meta_data->>'avatar_url',
    false -- 신규 가입 유저는 기본적으로 일반 유저(false)
  );
  RETURN new;
END;
$function$;
