import type { ComponentType } from 'react';
import Home from '@/app/page';
import Genres from '@/app/genres/page';
import Explore from '@/app/explore/page';
import Tracks from '@/app/tracks/page';
import WorldCup from '@/app/worldcup/page';
import Taste from '@/app/taste/page';
import { useLocation } from './router';

/**
 * 토스 빌드의 라우트 표.
 *
 * `src/app/**` 의 페이지 컴포넌트를 그대로 가져다 쓴다(무수정).
 * 관리자 화면(`/manager-taste-control`)은 **여기에 올리지 않는다** —
 * 표에 없으면 번들에도 들어가지 않는다.
 *
 * Phase 4.2 에서 /explore-taste · /archive · /shared 를 추가한다.
 */
const routes: Record<string, ComponentType> = {
  '/': Home,
  // 월드컵 본선까지의 기본 동선
  '/genres': Genres,
  '/explore': Explore,
  '/tracks': Tracks,
  '/worldcup': WorldCup,
  '/taste': Taste,
};

export default function App() {
  const { pathname } = useLocation();
  // Phase 4 까지는 미등록 경로가 홈으로 떨어진다. 라우트를 다 올린 뒤
  // 404 처리 방식을 정한다(딥 경로 콜드스타트와 함께 봐야 한다).
  const Page = routes[pathname] ?? routes['/'];
  return <Page />;
}
