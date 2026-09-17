-- 운영(main) 코드용 최소 가드: 엔드포인트 차단 확인 + 일별 호출 계수만 한다 (전역 토큰버킷 없음).
-- 브랜치 코드는 spotify_take_token_v2(전역 버킷 포함)를 계속 쓴다. 둘 다 같은 계수 테이블을 쓴다.
-- 429 가 나면 그 시점 누적 호출 수를 spotify_429_log 에 남겨 엔드포인트별 한도를 역산한다.
-- additive-only.

CREATE OR REPLACE FUNCTION public.spotify_endpoint_gate(ep TEXT)
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

CREATE TABLE IF NOT EXISTS public.spotify_429_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    endpoint     TEXT NOT NULL,
    reason       TEXT,
    retry_after  INT,
    calls_today  INT            -- 429 시점까지 그날 이 엔드포인트에 보낸 호출 수 (한도 근사치)
);

-- 429 를 받았을 때 한 번에: 로그 기록 + 엔드포인트 차단.
CREATE OR REPLACE FUNCTION public.spotify_record_429(ep TEXT, secs INT, why TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
    INSERT INTO public.spotify_429_log (endpoint, reason, retry_after, calls_today)
    SELECT ep, why, secs, (SELECT calls_today FROM public.spotify_endpoint_quota WHERE endpoint = ep);
    INSERT INTO public.spotify_endpoint_quota (endpoint, blocked_until, updated_at)
    VALUES (ep, NOW() + (secs || ' seconds')::INTERVAL, NOW())
    ON CONFLICT (endpoint) DO UPDATE
       SET blocked_until = EXCLUDED.blocked_until, updated_at = NOW();
$$;

REVOKE ALL ON FUNCTION public.spotify_endpoint_gate(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spotify_record_429(TEXT, INT, TEXT) FROM PUBLIC;
ALTER TABLE public.spotify_429_log ENABLE ROW LEVEL SECURITY;

-- 2026-09-16 실측 1건을 첫 기록으로 남긴다 (로컬 스크립트 약 120회 + 운영 트래픽, 계수 없던 시점이라 calls_today 는 미상)
INSERT INTO public.spotify_429_log (at, endpoint, reason, retry_after, calls_today)
SELECT '2026-09-16 04:07:00+00', '/v1/artists/{id}/albums', 'QUOTA_EXCEEDED', 85618, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.spotify_429_log);
