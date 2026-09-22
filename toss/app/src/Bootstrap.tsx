import { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { LayoutWrapper } from '@/components/LayoutWrapper';
import { RouterProvider } from './router';
import { establishSession, TossSessionError } from './tossSession';
import { startSafeArea } from './safeArea';
import { applyInitialRoute } from './initialRoute';
import App from './App';

/**
 * 세션을 세운 뒤에 앱을 그린다.
 *
 * 화면 없이 기다리거나, 실패했을 때 빈 화면으로 두면 안 된다(체크리스트).
 * 세 가지 실패 — 구버전 토스 앱 / 토스 밖에서 열림 / 서버 거절 — 모두
 * 사람이 읽을 수 있는 문구와 다시 시도 버튼으로 끝난다.
 *
 * AuthProvider 는 마운트 시점에 세션을 읽으므로, 이 컴포넌트가 성공한
 * 뒤에야 렌더된다. 그래야 AuthProvider 를 고치지 않아도 된다.
 */
export default function Bootstrap() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<TossSessionError | null>(null);

  const run = useCallback(() => {
    setState('loading');
    setError(null);
    establishSession().then(
      () => {
        // 공유 링크로 들어왔다면 그리기 전에 경로를 맞춘다.
        applyInitialRoute();
        setState('ready');
      },
      (err) => {
        /*
         * 개발 중에는 일반 브라우저에서 열기 때문에 토스 네이티브 브리지가
         * 없어 반드시 실패한다. 그때까지 화면을 막으면 Next 판과의 비교 검사를
         * 하나도 돌릴 수 없다. dev 에서만, 그리고 "토스 밖" 인 경우에만
         * 세션 없이 진행한다 — 웹의 비로그인 상태와 같은 화면이 된다.
         * 프로덕션 번들에서는 import.meta.env.DEV 가 false 라 해당되지 않는다.
         */
        if (import.meta.env.DEV && err instanceof TossSessionError && err.reason === 'not_toss') {
          console.warn('[toss] 토스 앱 밖 — 세션 없이 진행합니다 (개발 전용)');
          applyInitialRoute();
          setState('ready');
          return;
        }
        console.error('[toss] 세션 수립 실패', err);
        setError(err instanceof TossSessionError ? err : null);
        setState('failed');
      }
    );
  }, []);

  useEffect(run, [run]);

  // Safe Area 를 CSS 변수로 내보낸다. 회전·키보드로 값이 바뀌면 따라간다.
  useEffect(startSafeArea, []);

  if (state === 'ready') {
    return (
      <RouterProvider>
        <AuthProvider>
          <LayoutWrapper>
            <App />
          </LayoutWrapper>
        </AuthProvider>
      </RouterProvider>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center gap-5 px-8 text-center">
      <h1 className="text-3xl text-navy tracking-tight">Sortify</h1>

      {state === 'loading' ? (
        <p className="font-sans text-sm text-charcoal/60">불러오는 중...</p>
      ) : (
        <>
          <p className="font-sans text-sm text-charcoal/80 leading-relaxed whitespace-pre-line">
            {error?.message ?? '접속에 실패했어요.'}
          </p>
          {/* 원인 코드. 서버 응답의 오류 이름과 HTTP 상태만 — 식별키·토큰은 응답에 없다.
              2026-09-22 실제 기기에서 "접속에 실패했어요"만 떠서 원인을 못 갈랐던 일 때문에 둔다. */}
          {error && (
            <p className="font-sans text-[11px] text-charcoal/40 break-all">
              {[error.reason, error.cause instanceof Error ? error.cause.message.slice(0, 120) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {/* 구버전 앱은 다시 눌러도 같은 결과라, 안내만 남기고 버튼을 숨긴다. */}
          {error?.reason !== 'unsupported' && (
            <button
              type="button"
              onClick={run}
              className="px-6 py-3 bg-brand text-cream font-sans font-bold text-sm rounded-full hover:bg-brand/90 transition-colors"
            >
              다시 시도
            </button>
          )}
        </>
      )}
    </div>
  );
}
