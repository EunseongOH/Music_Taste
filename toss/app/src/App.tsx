import type { ComponentType } from 'react';
import Home from '@/app/page';
// 믹스 매치(여러 아티스트)는 내려 두었다 — 표에 없으면 번들에도 안 들어간다.
// 되살리려면 이 줄과 아래 '/genres' 줄의 주석을 푼다. docs/mode-pivot.md §10
// import Genres from '@/app/genres/page';
import Explore from '@/app/explore/page';
import Tracks from '@/app/tracks/page';
import WorldCup from '@/app/worldcup/page';
import Taste from '@/app/taste/page';
import MyTaste from '@/app/my-taste/page';
import ExploreTaste from '@/app/explore-taste/page';
import ArchivePage from '@/app/archive/page';
import SharedTaste from '@/app/taste/[id]/page';
import { useLocation } from './router';

/**
 * 토스 빌드의 라우트 표.
 *
 * `src/app/**` 의 페이지 컴포넌트를 그대로 가져다 쓴다(무수정).
 * 관리자 화면(`/manager-taste-control`)은 **여기에 올리지 않는다** —
 * 표에 없으면 번들에도 들어가지 않는다.
 */
const routes: Record<string, ComponentType> = {
  '/': Home,
  // 월드컵 본선까지의 기본 동선
  // '/genres': Genres,
  '/explore': Explore,
  '/tracks': Tracks,
  '/worldcup': WorldCup,
  '/taste': Taste,
  // 저장해 둔 취향표 다시 보기. id 는 쿼리(?id=)로 받는다(정적 호스팅).
  '/my-taste': MyTaste,
  // 보관·탐색
  '/explore-taste': ExploreTaste,
  '/archive': ArchivePage,
  // 공유된 취향표. 딥링크는 이 형태로 들어온다 (`?id=<uuid>`).
  // 정적 호스팅에서는 임의의 `/taste/<uuid>/index.html` 을 미리 만들 수 없다.
  '/shared': SharedTaste,
};

export default function App() {
  const { pathname } = useLocation();

  // 앱 안에서의 이동은 `/taste/<uuid>` 형태로도 들어온다(archive 화면).
  // 클라이언트 라우팅이라 정적 파일이 없어도 된다. id 는 useParams shim 이
  // 경로에서 뽑는다.
  const Page =
    routes[pathname] ?? (pathname.startsWith('/taste/') ? SharedTaste : undefined) ?? Home;

  return <Page />;
}
