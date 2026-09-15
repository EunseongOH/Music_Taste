import { nav, useLocation } from '../router';

/**
 * `next/navigation` 대체. 실제로 쓰이는 것만 둔다.
 * (`useSearchParams` · `redirect` · `notFound` 는 src/ 전체에서 사용 0건)
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
 * 동적 세그먼트를 쓰는 라우트가 이 하나뿐이라 경로 패턴 엔진을 두지 않는다.
 */
export function useParams(): Record<string, string> {
  const { pathname, search } = useLocation();
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(search));
  const fromPath = pathname.match(/^\/taste\/(.+)$/);
  if (fromPath) params.id = decodeURIComponent(fromPath[1]);
  return params;
}
