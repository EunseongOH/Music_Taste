-- 들어볼 곡: 월드컵 중 "모르는 곡"으로 뺀 곡을 모아 둔다.
--
-- 월드컵 화면에서 곡을 위로 올려 빼면 여기에 쌓이고, 내 취향 스페이스의
-- "들어볼 곡" 탭에서 본다. 나중에 스트리밍 플레이리스트로 보낼 때를 위해
-- 트랙 id(Spotify id)와 미발매 여부를 함께 저장한다(미발매곡은 보낼 수 없다).
--
-- additive: 새 테이블 + tournament_drafts 에 기본값 있는 컬럼 하나.

CREATE TABLE IF NOT EXISTS public.listen_later_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  track_id text NOT NULL,
  title text NOT NULL,
  artist_name text,
  album_title text,
  album_image text,
  album_id text,
  is_unreleased boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 곡을 여러 번 빼도 한 번만 남는다.
  UNIQUE (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_listen_later_user_created
  ON public.listen_later_tracks (user_id, created_at DESC);

ALTER TABLE public.listen_later_tracks ENABLE ROW LEVEL SECURITY;

-- tournament_drafts 와 같은 패턴: 본인 것만 읽고 쓴다.
DROP POLICY IF EXISTS "Users manage their own listen later tracks" ON public.listen_later_tracks;
CREATE POLICY "Users manage their own listen later tracks" ON public.listen_later_tracks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 진행 중인 월드컵의 뺀 곡(이어하기용).
ALTER TABLE public.tournament_drafts
  ADD COLUMN IF NOT EXISTS skipped_tracks jsonb NOT NULL DEFAULT '[]'::jsonb;
