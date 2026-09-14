-- Phase B: Spotify 호출용 전역 토큰버킷 + 서킷브레이커 + 계측
--
-- 프로세스 메모리 캐시는 서버리스 다중 인스턴스에서 무의미하다.
-- 단일 행 토큰버킷을 DB 에 두고 UPDATE ... RETURNING 의 행 락으로 원자성을 얻는다.
--
-- additive-only: 신규 테이블·함수만 추가한다. 기존 테이블은 건드리지 않는다.

CREATE TABLE IF NOT EXISTS public.spotify_quota (
    id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    tokens        REAL NOT NULL DEFAULT 150,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    day           DATE NOT NULL DEFAULT CURRENT_DATE,
    calls_today   INT NOT NULL DEFAULT 0
);

INSERT INTO public.spotify_quota (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 조정 노브는 두 개뿐이다: 버킷 크기 150, 충전 속도 2.5/s = 150 req/min.
-- Dev Mode 실측 상한 180 req/min 의 83%.
CREATE OR REPLACE FUNCTION public.spotify_take_token()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    t REAL;
    b TIMESTAMPTZ;
    d DATE;
BEGIN
    -- 충전 + 날짜 롤오버를 한 번의 UPDATE 로. 행 락이 여기서 잡힌다.
    UPDATE public.spotify_quota SET
        tokens      = LEAST(150, tokens + EXTRACT(EPOCH FROM (NOW() - updated_at)) * 2.5),
        updated_at  = NOW(),
        calls_today = CASE WHEN day <> CURRENT_DATE THEN 0 ELSE calls_today END,
        day         = CURRENT_DATE
    WHERE id = 1
    RETURNING tokens, blocked_until, day INTO t, b, d;

    IF NOT FOUND THEN
        RETURN TRUE;  -- 행이 없으면 가드를 통과시킨다 (fail-open)
    END IF;

    IF b IS NOT NULL AND b > NOW() THEN
        RETURN FALSE;  -- 서킷 열림
    END IF;

    IF t < 1 THEN
        RETURN FALSE;  -- 버킷 고갈
    END IF;

    UPDATE public.spotify_quota
       SET tokens = tokens - 1,
           calls_today = calls_today + 1
     WHERE id = 1;

    RETURN TRUE;
END;
$$;

-- Spotify 가 Retry-After 로 긴 대기를 요구하면 전 인스턴스를 함께 멈춘다.
CREATE OR REPLACE FUNCTION public.spotify_trip_breaker(secs INT DEFAULT 60)
RETURNS VOID
LANGUAGE sql
AS $$
    UPDATE public.spotify_quota
       SET blocked_until = NOW() + (secs || ' seconds')::INTERVAL,
           tokens = 0
     WHERE id = 1;
$$;

-- service_role 로만 호출한다. anon/authenticated 에는 노출하지 않는다.
REVOKE ALL ON FUNCTION public.spotify_take_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spotify_trip_breaker(INT) FROM PUBLIC;

ALTER TABLE public.spotify_quota ENABLE ROW LEVEL SECURITY;
