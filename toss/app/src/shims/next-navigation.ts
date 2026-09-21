import { nav, useLocation } from '../router';

/**
 * `next/navigation` 대체. 실제로 쓰이는 것만 둔다.
 * (`useSearchParams` · `redirect` 는 src/ 전체에서 사용 0건)
 */

export const useRouter = () => nav;

export const usePathname = () => useLocation().pathname;

/**
 * `taste/[id]/page.tsx` 가 쓰는 `params.id` 를 만들어 준다. 두 경로를 모두 받는다.
 *
 *  - `/taste/<uuid>` : 앱 안에서의 이동. archive 화면이 이 형태로 보낸다
 *    (archive/page.tsx:801). 클라이언트 라우팅이라 정적 파일이 필요 없다.
 *  - `/shared?id=<uuid>` : 딥링크·공유 링크용. 정적 호스팅에서는 임의의
 *    `/taste/<uuid>/index.html` 을 미리 만들어 둘 수 없어서, 밖에서 들어오는
 *    링크는 쿼리 형태를 쓴다.
 *
 * 같이 소트하기도 같은 방식이다.
 *  - `/together/<code>` · `/together/<code>/result` : 참여 링크. 코드를 여기서 뽑는다.
 *
 * 동적 세그먼트를 쓰는 라우트가 둘뿐이라 경로 패턴 엔진을 두지 않는다.
 */
export function useParams(): Record<string, string> {
  const { pathname, search } = useLocation();
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(search));
  const fromPath = pathname.match(/^\/taste\/(.+)$/);
  if (fromPath) params.id = decodeURIComponent(fromPath[1]);
  const code = pathname.match(/^\/together\/([^/]+)(?:\/result)?$/);
  if (code && code[1] !== 'new') params.code = decodeURIComponent(code[1]);
  return params;
}

/**
 * `notFound()` 대체.
 *
 * 개발 전용 화면(`src/app/dev/**`)이 운영에서 열리지 않게 이 함수를 부른다.
 * 그 화면들은 토스 라우트 표에 없어서 번들에 들어가지 않지만, 타입 검사는
 * `src/` 전체를 보므로 이 이름이 없으면 토스 빌드의 tsc 가 깨진다.
 *
 * Next 처럼 렌더를 멈추게만 하면 된다 — 토스에는 404 화면이 따로 없다.
 * 라우트 표에 없는 경로는 App.tsx 가 홈으로 떨어뜨린다.
 */
export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}
