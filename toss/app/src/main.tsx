import { createRoot } from 'react-dom/client';
// 전역 fetch 를 감싸 `/api/*` 를 기존 Next 서버로 돌린다.
// 어떤 페이지가 요청을 보내기 전에 적용돼야 하므로 맨 위에 둔다.
import './apiBase';
import './toss.css';
import Bootstrap from './Bootstrap';

/**
 * 토스 미니앱 진입점.
 *
 * Bootstrap 이 익명 식별키로 Supabase 세션을 세운 뒤에야 앱 트리를 그린다.
 * 트리 구조는 src/app/layout.tsx 와 같다:
 *   <div class="bg-grain"> 는 index.html 에 두고 (layout.tsx 의 body 첫 자식)
 *   AuthProvider > LayoutWrapper > 페이지
 * RouterProvider 는 Next 에서 런타임이 암묵적으로 제공하던 자리라 제일 바깥에 둔다.
 *
 * StrictMode 는 쓰지 않는다. effect 가 두 번 돌면 세션 발급과 초기 요청이
 * 중복된다 — 얻을 게 없고 WebView 에서는 손해다.
 */
createRoot(document.getElementById('root')!).render(<Bootstrap />);
