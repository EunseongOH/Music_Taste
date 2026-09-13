import { getAppsInTossGlobals, User } from '@apps-in-toss/web-framework';
import { createClient } from '@/utils/supabase/client';
import { API_BASE } from './apiBase';

/**
 * 토스 익명 식별키로 Supabase 세션을 세운다.
 *
 * 화면을 그리기 **전에** 끝나야 한다. `AuthProvider` 는 마운트 시점에
 * `getSession()` 을 읽으므로, 그 전에 `setSession()` 이 끝나 있으면
 * AuthProvider·supabase/client.ts 를 한 글자도 고치지 않고 그대로 쓸 수 있다.
 *
 * 키는 설치·기기가 바뀌어도 같은 값이라, 앱을 지웠다 깔아도 이전 취향표가
 * 그대로 보인다. (`signInAnonymously` 로는 이게 안 된다 — 설치마다 새 계정이라
 * 스토리지를 지우면 기록이 고아가 된다)
 */

export type SessionFailure =
  | 'unsupported' // 토스 앱 버전이 낮음 (5.232.0 미만)
  | 'not_toss' // 토스 앱 밖에서 열림
  | 'key_failed' // 식별키를 받지 못함
  | 'server_failed'; // 세션 발급 서버가 거절

export class TossSessionError extends Error {
  constructor(
    readonly reason: SessionFailure,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
  }
}

/**
 * 토스 앱 안에서 열렸는지 먼저 본다.
 *
 * 이걸 건너뛰고 `isSupported()` 를 부르면 토스 밖에서는 앱인토스 전역 객체가
 * 없어 `TypeError: Cannot read properties of undefined` 로 죽는다 —
 * "구버전 앱" 과 "토스 밖" 을 구분할 수 없게 되고, 사용자에게 엉뚱한 안내가 간다.
 */
function inTossApp(): boolean {
  try {
    return !!getAppsInTossGlobals();
  } catch {
    return false;
  }
}

async function getAnonymousKey(): Promise<string> {
  if (!inTossApp()) {
    throw new TossSessionError('not_toss', '토스 앱에서 열어 주세요.');
  }

  // 독립 함수 getAnonymousKey 는 deprecated 다. User 네임스페이스를 쓴다.
  if (!User.getAnonymousKey.isSupported()) {
    throw new TossSessionError(
      'unsupported',
      '토스 앱을 최신 버전으로 업데이트해 주세요.'
    );
  }

  let res;
  try {
    res = await User.getAnonymousKey();
  } catch (err) {
    // 토스 앱 밖에서는 "웹뷰 환경이 아니에요" 로 throw 한다.
    const msg = String((err as Error)?.message ?? '');
    throw new TossSessionError(
      /웹뷰 환경/.test(msg) ? 'not_toss' : 'key_failed',
      '사용자 정보를 불러오지 못했어요.',
      err
    );
  }

  const hash = (res as { hash?: string })?.hash;
  if (!hash) {
    throw new TossSessionError('key_failed', '사용자 정보를 불러오지 못했어요.');
  }
  return hash;
}

export async function establishSession(): Promise<void> {
  const hash = await getAnonymousKey();

  let payload: { access_token: string; refresh_token: string };
  try {
    const r = await fetch(`${API_BASE}/api/toss/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${await r.text().catch(() => '')}`);
    }
    payload = await r.json();
  } catch (err) {
    throw new TossSessionError('server_failed', '접속에 실패했어요.', err);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (error) {
    throw new TossSessionError('server_failed', '접속에 실패했어요.', error);
  }
}
