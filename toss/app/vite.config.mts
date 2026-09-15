import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC = path.resolve(REPO, 'src');
const SHIMS = path.resolve(HERE, 'src/shims');

/**
 * 앱인토스 미니앱(토스 전용) Vite 빌드.
 *
 * 기존 Next 앱은 그대로 두고, `src/` 를 alias 로 공유해서 같은 UI·로직을 쓴다.
 * 앱인토스는 SSR 을 금지(CSR/SSG만)하므로 별도의 CSR 진입점이 필요하다.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, HERE, '');

  return {
    root: HERE,
    plugins: [react()],

    // 루트의 postcss.config.mjs(Tailwind v4)를 그대로 재사용한다.
    css: { postcss: REPO },

    resolve: {
      alias: [
        // Next 런타임이 없으므로 shim 으로 대체한다. `@/` 보다 먼저 와야 한다.
        { find: 'next/image', replacement: path.resolve(SHIMS, 'next-image.tsx') },
        { find: 'next/link', replacement: path.resolve(SHIMS, 'next-link.tsx') },
        { find: 'next/navigation', replacement: path.resolve(SHIMS, 'next-navigation.ts') },

        // 토스에서 그대로 쓸 수 없는 src/ 모듈을 치환한다. 원본은 건드리지 않는다.
        // 자체 뒤로가기 금지(앱인토스 네비게이션 바와 중복) → 아무것도 그리지 않음(제목이 좌우 같은 여백에 선다)
        { find: '@/components/BackButton', replacement: path.resolve(SHIMS, 'BackButton.tsx') },
        // 익명 식별키로만 로그인하므로 자체 로그인 UI 를 띄우지 않는다
        { find: '@/components/LoginModal', replacement: path.resolve(SHIMS, 'LoginModal.tsx') },
        // GA 스크립트가 없다. 앱인토스 Analytics 연결은 Phase 9.5
        { find: '@/utils/gtag', replacement: path.resolve(SHIMS, 'gtag.ts') },
        // "use server" 모듈은 다른 origin 에서 호출할 수 없다 → REST 디스패치 경유
        { find: '@/utils/spotify', replacement: path.resolve(SHIMS, 'spotify.ts') },
        // 저장·공유는 WebView 에서 웹 방식이 통하지 않는다 → 앱인토스 SDK
        { find: '@/utils/platform', replacement: path.resolve(HERE, 'src/platform.toss.ts') },

        // 그 밖의 `@/...` 는 실제 src/ 를 무수정으로 가리킨다.
        { find: /^@\//, replacement: SRC + '/' },
      ],
    },

    // src/ 의 모듈들이 `process.env.NEXT_PUBLIC_*` 를 읽는다. 객체 전체를 주입하면
    // 정의되지 않은 키를 읽어도 ReferenceError 없이 undefined 가 되어,
    // supabase/client.ts 같은 파일을 한 글자도 고치지 않고 재사용할 수 있다.
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: mode,
        NEXT_PUBLIC_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
      }),
    },

    server: {
      port: 5173,
      // root 밖(REPO/src)의 파일을 읽어야 한다.
      fs: { allow: [REPO] },
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
    },
  };
});
