import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * pushState 기반 최소 라우터.
 *
 * react-router 를 쓰지 않는 이유: `src/` 의 페이지들이 `useSearchParams` 대신
 * `window.location.search` 를 직접 파싱한다(9곳). 따라서 해시 라우터는 쓸 수 없고
 * (`location.search` 가 비고 `Location` 은 재정의 불가), 필요한 API 도
 * Next 형태(`useRouter().push` / `usePathname` / `useParams`) 뿐이다.
 * 라이브러리를 감싸는 어댑터를 쓰는 것보다 이쪽이 코드가 적다.
 */

type Loc = { pathname: string; search: string };

const read = (): Loc => ({
  pathname: window.location.pathname,
  search: window.location.search,
});

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** `useRouter()` 가 돌려주는 객체. 훅 밖에서도 쓸 수 있게 모듈 상수로 둔다. */
export const nav = {
  push(url: string) {
    window.history.pushState(null, '', url);
    notify();
  },
  replace(url: string) {
    window.history.replaceState(null, '', url);
    notify();
  },
  back() {
    window.history.back();
  },
  forward() {
    window.history.forward();
  },
  /**
   * Next 에서는 서버 데이터 재요청이지만, 토스 빌드는 전부 CSR 이라 재렌더로 충분하다.
   * 실제 호출처 2곳(언어 토글 · 로그인 성공)도 상태 변경 후 재렌더가 목적이다.
   */
  refresh() {
    notify();
  },
  prefetch() {},
};

const Ctx = createContext<Loc>({ pathname: '/', search: '' });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(read);

  useEffect(() => {
    // read() 가 매번 새 객체를 주므로 refresh() 로도 재렌더가 일어난다.
    const sync = () => setLoc(read());
    subs.add(sync);
    // 네이티브 뒤로가기는 WebView 의 history 를 움직이므로 popstate 로 들어온다.
    window.addEventListener('popstate', sync);
    return () => {
      subs.delete(sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // Next App Router 와 같게 경로 이동 시 스크롤을 맨 위로 되돌린다.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return <Ctx.Provider value={loc}>{children}</Ctx.Provider>;
}

export const useLocation = () => useContext(Ctx);
