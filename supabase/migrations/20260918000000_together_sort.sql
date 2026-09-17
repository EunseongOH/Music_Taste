-- 같이 소트하기(실험) — docs/together-sort.md
--
-- 한 사람이 자기 취향표의 곡 세트로 "같은 곡으로 해보기" 링크를 만들고,
-- 그 링크로 들어온 사람들이 같은 곡을 줄 세운 뒤 서로의 일치율을 본다.
--
-- additive: 새 테이블 2개만 만든다. 기존 테이블은 건드리지 않는다.

CREATE TABLE IF NOT EXISTS public.sort_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 공유 링크에 쓰는 짧은 문자열(/together/<code>)
  code text NOT NULL UNIQUE,
  creator_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  creator_nickname text,
  artist_name text,
  title text NOT NULL,
  -- [{ id, title, artistName, albumImage }] — 참여자가 그대로 줄 세우는 곡 세트
  tracks jsonb NOT NULL,
  -- 어떤 취향표에서 만들었는지(참고용)
  source_result_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sort_challenges_creator
  ON public.sort_challenges (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sort_challenge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sort_challenges (id) ON DELETE CASCADE,
  -- 로그인 사용자는 auth uid, 아니면 기기에 저장한 uuid
  participant_key text NOT NULL,
  nickname text,
  -- 곡 id 배열(1위부터). 곡 정보는 챌린지의 tracks 에 있다.
  ranking jsonb NOT NULL,
  -- "모르는 곡"으로 뺀 곡 수(일치율은 두 사람 모두 줄 세운 곡으로만 잰다)
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 사람이 다시 하면 덮어쓴다
  UNIQUE (challenge_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_sort_challenge_entries_challenge
  ON public.sort_challenge_entries (challenge_id, created_at DESC);

ALTER TABLE public.sort_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sort_challenge_entries ENABLE ROW LEVEL SECURITY;

-- 링크를 받은 사람은 누구나 읽을 수 있어야 한다.
DROP POLICY IF EXISTS "Anyone can read sort challenges" ON public.sort_challenges;
CREATE POLICY "Anyone can read sort challenges" ON public.sort_challenges
  FOR SELECT TO anon, authenticated
  USING (true);

-- 만들기는 로그인 사용자만, 본인 이름으로만.
DROP POLICY IF EXISTS "Users create their own sort challenges" ON public.sort_challenges;
CREATE POLICY "Users create their own sort challenges" ON public.sort_challenges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- 일치율을 보여주려면 참여 기록도 모두 읽을 수 있어야 한다.
DROP POLICY IF EXISTS "Anyone can read sort challenge entries" ON public.sort_challenge_entries;
CREATE POLICY "Anyone can read sort challenge entries" ON public.sort_challenge_entries
  FOR SELECT TO anon, authenticated
  USING (true);

-- 참여는 로그인 없이도 가능하다(링크를 받은 사람 누구나).
DROP POLICY IF EXISTS "Anyone can add a sort challenge entry" ON public.sort_challenge_entries;
CREATE POLICY "Anyone can add a sort challenge entry" ON public.sort_challenge_entries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 다시 하면 자기 기록만 덮어쓴다(참여자 키는 기기/계정마다 다르다).
DROP POLICY IF EXISTS "Anyone can update their own sort challenge entry" ON public.sort_challenge_entries;
CREATE POLICY "Anyone can update their own sort challenge entry" ON public.sort_challenge_entries
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);
