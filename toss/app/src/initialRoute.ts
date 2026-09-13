import { Environment } from '@apps-in-toss/web-framework';

/**
 * 딥링크로 들어왔을 때 첫 화면을 맞춘다.
 *
 * 미니앱은 항상 번들 루트(`/`)에서 시작한다. 공유 링크
 * (`intoss://sortify-musictaste/shared?id=<uuid>`)로 들어와도 WebView 의
 * 주소는 `/` 라서, 그대로 두면 공유된 취향표 대신 홈이 열린다.
 *
 * `Environment.initialURL` 이 진입 시 쓴 스킴 URL 을 준다. 거기서 경로와
 * 쿼리를 꺼내 history 에 반영한 뒤 앱을 그린다. 렌더 전에 끝나야
 * RouterProvider 가 처음부터 올바른 경로를 읽는다.
 *
 * 앱 안에서의 이동은 반영되지 않는 값이라(문서 명시) 콜드스타트에서만 쓴다.
 */
export function applyInitialRoute(): void {
  let initial: string;
  try {
    initial = Environment.initialURL;
  } catch {
    return; // 토스 앱 밖
  }
  if (!initial) return;

  // intoss://<appName>/<path>?<query> — 호스트는 appName 이라 버린다.
  const m = initial.match(/^intoss(?:-private)?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/);
  if (!m) return;

  const path = m[1] ?? '/';
  const query = m[2] ?? '';
  const target = `${path}${query}`;

  if (target === '/' || target === window.location.pathname + window.location.search) return;

  window.history.replaceState(null, '', target);
}
