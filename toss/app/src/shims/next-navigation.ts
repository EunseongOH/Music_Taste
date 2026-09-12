import { nav, useLocation } from '../router';

/**
 * `next/navigation` 대체. 실제로 쓰이는 것만 둔다.
 * (`useSearchParams` · `redirect` · `notFound` 는 src/ 전체에서 사용 0건)
 */

export const useRouter = () => nav;

export const usePathname = () => useLocation().pathname;

/**
 * 토스 빌드는 `/taste/[id]` 를 `/shared?id=<uuid>` 로 마운트한다.
 * (`/taste` 정적 경로와 겹쳐서 동적 세그먼트를 쓸 수 없다)
 * 쿼리스트링을 그대로 params 로 돌려주면 `taste/[id]/page.tsx` 의
 * `params.id` 가 무수정으로 동작한다.
 */
export function useParams(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(useLocation().search));
}
