-- 상시 워커 스케줄: pg_cron 이 매분 mb-worker Edge Function 을 호출한다.
--
-- 호출 토큰은 vault 에서 SQL 안에서만 읽는다(코드·로그에 남지 않음).
-- 워커 안에 잠금이 있어서 실행이 길어져도 겹치지 않는다.
--
-- 끄기:   SELECT cron.unschedule('mb-worker');
-- 다시 켜기: 아래 cron.schedule 한 줄을 다시 실행
--
-- additive-only: 확장·함수·cron 잡 추가.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.mb_invoke_worker()
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT net.http_post(
    url := 'https://kgpwbxkaudeuoybdicqn.supabase.co/functions/v1/mb-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'mb_worker_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 70000
  );
$$;
REVOKE ALL ON FUNCTION public.mb_invoke_worker() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('mb-worker', '* * * * *', 'SELECT public.mb_invoke_worker()');
