-- 상시 워커 인프라 + 동시 이용자 대비 인덱스
--
-- 구조: 요청 경로는 MusicBrainz 를 절대 부르지 않고 "수요 큐"에 기록만 한다.
-- 단 하나의 워커(Edge Function mb-worker, pg_cron 이 매분 호출)가 MB 속도 제한(IP 당 초당 1회)을
-- 지키며 큐를 소비한다. 그래서 MB 부하는 동시 이용자 수와 무관하다.
--
-- additive-only: 확장·인덱스·신규 테이블·뷰·함수만 추가한다. 기존 데이터는 바꾸지 않는다.

-- 1) 검색 인덱스 --------------------------------------------------------------
-- 아티스트 검색은 name / name_ko 에 대한 ILIKE '%검색어%' 다. btree 는 앞에 % 가 붙으면 못 쓰고
-- 매번 전체를 훑는다. 아티스트가 늘어날수록 느려지므로 trigram GIN 인덱스를 둔다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_mb_artist_name_trgm    ON public.mb_artist USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mb_artist_name_ko_trgm ON public.mb_artist USING gin (name_ko gin_trgm_ops);

-- canonical_artist 뷰가 아티스트마다 취향표 등장 횟수를 센다(인기도). 인덱스가 없어서 취향표가
-- 쌓일수록 검색 한 번에 전체 스캔이 아티스트 수만큼 반복된다. 데이터는 안 바꾸는 순수 추가다.
CREATE INDEX IF NOT EXISTS idx_results_artist_id ON public.tournament_results (artist_id);

-- 2) 수요 큐 정렬 -----------------------------------------------------------
-- 사용자가 방금 찾은 아티스트가 대량 시드보다 먼저 처리되도록 최신 요청 순으로 꺼낸다.
-- 요청 경로가 upsert 로 created_at 을 갱신해서 "다시 찾음"을 표시한다.
CREATE INDEX IF NOT EXISTS idx_mb_resolve_queue_recent ON public.mb_resolve_queue (created_at DESC);

-- 3) 아티스트별 발매판 조회 --------------------------------------------------
-- mb_album_release 에는 아티스트 컬럼이 없고 PostgREST 는 FK 없이 조인을 못 한다.
CREATE OR REPLACE VIEW public.mb_album_release_artist AS
SELECT ar.spotify_album_id, ar.release_mbid, ar.tracks_filled_at, rg.artist_mbid
FROM public.mb_album_release ar
JOIN public.mb_release_group rg ON rg.mbid = ar.release_group_mbid;

-- 4) 워커 잠금 --------------------------------------------------------------
-- pg_cron 이 매분 부르는데 한 번 실행이 길어지면 겹칠 수 있다. 겹치면 MB 속도 제한을 둘이 나눠
-- 쓰게 되므로 한 번에 하나만 돌게 한다. 만료 시간이 있어서 워커가 죽어도 다음 실행이 이어받는다.
CREATE TABLE IF NOT EXISTS public.mb_worker_lease (
    id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    holder     TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.mb_worker_lease (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.mb_worker_lease ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mb_take_lease(p_holder TEXT, p_secs INT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  WITH t AS (
    UPDATE public.mb_worker_lease
       SET holder = p_holder, expires_at = NOW() + make_interval(secs => p_secs)
     WHERE id = 1 AND (expires_at < NOW() OR holder = p_holder)
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM t);
$$;

CREATE OR REPLACE FUNCTION public.mb_release_lease(p_holder TEXT)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE public.mb_worker_lease SET expires_at = '-infinity' WHERE id = 1 AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION public.mb_take_lease(TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mb_release_lease(TEXT) FROM PUBLIC, anon, authenticated;

-- 5) 워커 호출 토큰 ----------------------------------------------------------
-- Edge Function 은 URL 이 공개라 누구나 부를 수 있다. 호출 토큰을 DB 금고(vault)에서 만들어
-- 두고, pg_cron 은 금고에서 읽어 헤더로 보내고, 워커는 이 함수로 대조한다.
-- 토큰은 DB 밖으로(코드·로그·대화) 나가지 않는다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'mb_worker_token') THEN
    PERFORM vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'mb_worker_token');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mb_check_worker_token(p_token TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
     WHERE name = 'mb_worker_token' AND decrypted_secret = p_token
  );
$$;
REVOKE ALL ON FUNCTION public.mb_check_worker_token(TEXT) FROM PUBLIC, anon, authenticated;
