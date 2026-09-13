/**
 * 토스 빌드에서 `/api/*` 호출이 어디로 갈지 정한다.
 *
 * 미니앱 번들은 토스가 호스팅하는 origin(`https://sortify-musictaste.apps.tossmini.com`)에서
 * 돌아간다. 거기에는 API 서버가 없으므로 상대 경로 `/api/...` 는 존재하지 않는
 * 주소가 된다. 기존 Next 서버로 돌려야 한다.
 *
 * `src/` 안에서 브라우저가 직접 `fetch` 를 부르는 곳은 단 한 군데
 * (`app/tracks/page.tsx:577` 의 `/api/spotify-search`)다. 그 한 줄을 고치는
 * 대신 전역 fetch 를 감싼다 — `src/` 를 건드리지 않고, 나중에 호출이 늘어도
 * 자동으로 따라온다.
 *
 * dev 에서도 같은 절대 URL 경로를 탄다. Vite 프록시로 같은 출처인 척하면
 * CORS·절대 URL 경로가 dev 에서 한 번도 실행되지 않아, 운영에서 처음 터진다.
 */
export const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3000'
  : (import.meta.env.VITE_API_BASE ?? 'https://sortify.kr');

const originalFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  // 상대 경로 `/api/...` 만 바꾼다. 절대 URL(Supabase 등)은 그대로 둔다.
  // Request 객체는 생성 시점에 이미 절대 URL 로 확정되므로 여기 걸리지 않는다.
  if (typeof input === 'string' && input.startsWith('/api/')) {
    return originalFetch(`${API_BASE}${input}`, init);
  }
  return originalFetch(input, init);
};
