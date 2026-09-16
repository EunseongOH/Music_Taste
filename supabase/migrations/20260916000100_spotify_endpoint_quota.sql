-- Spotify Dev Mode 쿼터는 계정 단위 + 엔드포인트별 일일 한도로 동작한다 (2026-09-16 실측:
-- /v1/artists/{id}/albums 만 429 QUOTA_EXCEEDED, Retry-After 85618s, 나머지 엔드포인트는 정상).
-- 전역 차단기(spotify_quota.blocked_until)는 rate limit 용으로 남기고, 쿼터 초과는 해당
-- 엔드포인트만 Retry-After 동안 막는다. 일별 호출 수를 엔드포인트별로 세어 한도에 가까운 곳을 미리 본다.
-- additive-only: 기존 테이블·함수는 손대지 않는다.

CREATE TABLE IF NOT EXISTS public.spotify_endpoint_quota (
    endpoint      TEXT PRIMARY KEY,          -- 예: /v1/artists/{id}/albums
    day           DATE NOT NULL DEFAULT CURRENT_DATE,
    calls_today   INT  NOT NULL DEFAULT 0,
    blocked_until TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 엔드포인트 차단 확인 → 전역 토큰버킷 → 엔드포인트 일별 계수. FALSE 면 호출하지 말 것.
CREATE OR REPLACE FUNCTION public.spotify_take_token_v2(ep TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    b TIMESTAMPTZ;
BEGIN
    SELECT blocked_until INTO b FROM public.spotify_endpoint_quota WHERE endpoint = ep;
    IF b IS NOT NULL AND b > NOW() THEN
        RETURN FALSE;
    END IF;
    IF NOT public.spotify_take_token() THEN
        RETURN FALSE;
    END IF;
    INSERT INTO public.spotify_endpoint_quota (endpoint, day, calls_today, updated_at)
    VALUES (ep, CURRENT_DATE, 1, NOW())
    ON CONFLICT (endpoint) DO UPDATE
       SET calls_today = CASE WHEN public.spotify_endpoint_quota.day <> CURRENT_DATE THEN 1
                              ELSE public.spotify_endpoint_quota.calls_today + 1 END,
           day         = CURRENT_DATE,
           updated_at  = NOW();
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.spotify_block_endpoint(ep TEXT, secs INT)
RETURNS VOID
LANGUAGE sql
AS $$
    INSERT INTO public.spotify_endpoint_quota (endpoint, blocked_until, updated_at)
    VALUES (ep, NOW() + (secs || ' seconds')::INTERVAL, NOW())
    ON CONFLICT (endpoint) DO UPDATE
       SET blocked_until = EXCLUDED.blocked_until, updated_at = NOW();
$$;

REVOKE ALL ON FUNCTION public.spotify_take_token_v2(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spotify_block_endpoint(TEXT, INT) FROM PUBLIC;

ALTER TABLE public.spotify_endpoint_quota ENABLE ROW LEVEL SECURITY;
