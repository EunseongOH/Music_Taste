-- 같이 소트하기: 로그인 없이도 링크를 만들 수 있게 한다 — docs/together-sort.md
--
-- 공연 대기줄처럼 한자리에 모여 쓰는 상황을 상정한다. 곡만 정하면 바로 링크를 만들고,
-- 옆 사람이 코드를 받아 같이 줄 세운다. 로그인 사용자는 지금처럼 본인 id 로 만든다.
--
-- additive: 정책 하나만 추가한다(테이블 변경 없음).

DROP POLICY IF EXISTS "Anyone can create an anonymous sort challenge" ON public.sort_challenges;
CREATE POLICY "Anyone can create an anonymous sort challenge" ON public.sort_challenges
  FOR INSERT TO anon, authenticated
  WITH CHECK (creator_id IS NULL);
