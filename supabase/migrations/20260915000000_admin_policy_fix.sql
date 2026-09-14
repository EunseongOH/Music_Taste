-- [보안] 관리자 판정에서 user_metadata 를 제거한다.
--
-- 기존 정책은 auth.jwt()->'user_metadata'->>'is_admin' = true 도 관리자로 인정했다.
-- user_metadata 는 로그인한 사용자가 supabase.auth.updateUser({ data }) 로 직접 쓸 수
-- 있으므로, 누구나 스스로 관리자가 되어 미발매곡·가사 제안을 수정·삭제할 수 있었다.
--
-- 관리자 판정은 public.is_admin() 하나로 모은다. profiles.is_admin 을 읽고,
-- protect_profile_admin_trigger 가 authenticated 역할의 변경을 되돌린다.
--
-- 적용 시점(2026-09-15) user_metadata.is_admin 을 가진 사용자는 0명이었다.
-- 실제 관리자는 profiles.is_admin 이 true 라 이 변경으로 권한을 잃지 않는다.
-- 부수 효과: 기존 ALL 정책이 user_metadata 만 봤기 때문에 실제 관리자는 남의
-- 승인 대기 곡을 SELECT 하지 못했다. 이제 볼 수 있다(관리자 페이지 의도대로).
--
-- additive-only 원칙의 예외(정책 교체). 사용자 승인 후 적용.

-- unreleased_tracks ---------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access on unreleased tracks" ON public.unreleased_tracks;
DROP POLICY IF EXISTS "Allow admin update" ON public.unreleased_tracks;
DROP POLICY IF EXISTS "Allow admin delete" ON public.unreleased_tracks;

CREATE POLICY "Admins manage unreleased tracks" ON public.unreleased_tracks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- unreleased_lyric_suggestions ----------------------------------------------
DROP POLICY IF EXISTS "Allow admin update on suggestions" ON public.unreleased_lyric_suggestions;
DROP POLICY IF EXISTS "Update lyric suggestions" ON public.unreleased_lyric_suggestions;
DROP POLICY IF EXISTS "Allow admin delete on suggestions" ON public.unreleased_lyric_suggestions;
DROP POLICY IF EXISTS "Delete lyric suggestions" ON public.unreleased_lyric_suggestions;

CREATE POLICY "Admins manage lyric suggestions" ON public.unreleased_lyric_suggestions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
