import { createRoot } from 'react-dom/client';
import './toss.css';
import { AuthProvider } from '@/components/AuthProvider';
import { LayoutWrapper } from '@/components/LayoutWrapper';
import { RouterProvider } from './router';
import App from './App';

/**
 * 토스 미니앱 진입점.
 *
 * 트리 구조는 src/app/layout.tsx 와 같게 맞춘다:
 *   <div class="bg-grain"> 는 index.html 에 두고 (layout.tsx 의 body 첫 자식)
 *   AuthProvider > LayoutWrapper > 페이지
 * RouterProvider 는 Next 에서 런타임이 암묵적으로 제공하던 자리라 제일 바깥에 둔다.
 * (LayoutWrapper 가 usePathname 을 쓰므로 그보다 위에 있어야 한다)
 *
 * StrictMode 는 쓰지 않는다. effect 가 두 번 돌면 AuthProvider 의 세션 조회와
 * 페이지들의 초기 요청이 중복된다 — 얻을 게 없고 WebView 에서는 손해다.
 *
 * Phase 5 에서 이 위에 익명 식별키 → Supabase 세션 수립이 들어간다.
 */
createRoot(document.getElementById('root')!).render(
  <RouterProvider>
    <AuthProvider>
      <LayoutWrapper>
        <App />
      </LayoutWrapper>
    </AuthProvider>
  </RouterProvider>
);
