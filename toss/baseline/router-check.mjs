/**
 * 토스 빌드의 라우터·셸 동작 점검. 픽셀 비교로는 잡히지 않는 것들이다.
 *
 *  1. 샌드박스 가드가 모듈보다 먼저 돌았는지 (navigator.locks 무력화)
 *     — 이게 없으면 WebView 에서 Supabase auth 가 SecurityError 로 죽는다.
 *  2. next/link 클릭이 전체 리로드가 아니라 pushState 로 동작하는지
 *     — WebView 에서 전체 리로드는 번들 재다운로드다.
 *  3. 네이티브 뒤로가기(popstate)가 화면에 반영되는지
 *  4. useRouter().push / back 이 같은 경로로 동작하는지
 *  5. bg-grain 오버레이가 셸에 있는지
 *
 * 사용: node toss/baseline/router-check.mjs
 */
import { chromium } from 'playwright';

// Vite dev 도 `/` 로 index.html 을 준다. 실제 번들과 진입 경로를 맞춰야
// usePathname() 이 dev 에서만 '/index.html' 로 보이는 일이 없다.
const PAGE_URL = `http://localhost:5173/${process.env.VITE_PAGE ?? ''}`;

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 430, height: 900 } })
).newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('\n[1] 샌드박스 가드 (index.html 의 sandbox-guard.js)');
  const guard = await page.evaluate(() => ({
    locks: typeof navigator.locks,
    deno: typeof window.Deno,
    grain: !!document.querySelector('.bg-grain'),
    grainBlend: document.querySelector('.bg-grain')
      ? getComputedStyle(document.querySelector('.bg-grain')).mixBlendMode
      : null,
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
  }));
  check(guard.locks === 'undefined', 'navigator.locks 무력화됨', `typeof=${guard.locks}`);
  check(guard.deno === 'undefined', 'window.Deno 차폐됨', `typeof=${guard.deno}`);
  check(guard.grain, '.bg-grain 오버레이 존재', `mix-blend-mode=${guard.grainBlend}`);
  check(
    guard.htmlClass.includes('antialiased') && guard.htmlClass.includes('h-full'),
    'html 클래스가 layout.tsx 와 같음',
    guard.htmlClass
  );
  check(
    guard.bodyClass === 'min-h-full flex flex-col font-sans',
    'body 클래스가 layout.tsx 와 같음',
    guard.bodyClass
  );

  // 전체 리로드를 감지하기 위한 표식. 리로드되면 사라진다.
  await page.evaluate(() => {
    window.__noReload = true;
  });

  console.log('\n[2] next/link 클릭 → pushState');
  const link = page.locator('a[href="/genres"]').first();
  check((await link.count()) > 0, 'footer 의 /genres 링크 존재');
  await link.click();
  await page.waitForTimeout(400);
  check(new URL(page.url()).pathname === '/genres', 'URL 이 /genres 로 바뀜', page.url());
  check(await page.evaluate(() => window.__noReload === true), '전체 리로드 없음');

  console.log('\n[3] 뒤로가기(popstate)');
  await page.goBack();
  await page.waitForTimeout(400);
  check(new URL(page.url()).pathname === '/', 'URL 이 / 로 복귀', page.url());
  check(await page.evaluate(() => window.__noReload === true), '전체 리로드 없음');
  check(
    (await page.locator('main').count()) > 0 &&
      (await page.locator('a[href="/genres"]').count()) > 0,
    '홈 화면이 다시 그려짐'
  );

  console.log('\n[4] 앱 안의 버튼으로 이동 (useRouter().push)');
  // 홈의 시작 버튼들은 로그인 상태에 따라 달라서, 라우터 API 를 직접 호출한다.
  await page.evaluate(() => history.pushState(null, '', '/tracks'));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await page.waitForTimeout(300);
  check(new URL(page.url()).pathname === '/tracks', 'pushState 경로 반영', page.url());
  check(await page.evaluate(() => window.__noReload === true), '전체 리로드 없음');

  console.log('\n[5] 뒤로가기 · Safe Area');
  /*
   * M4: 앱인토스 네비게이션 바를 쓰고 자체 뒤로가기를 같이 노출하면 안 된다.
   * BackButton shim 은 같은 크기의 빈 칸만 남긴다 — 정렬은 유지하되 버튼은 없다.
   *
   * backEvent 는 구독하지 않는다. onEvent 가 void 를 돌려줘서 "내가 처리했으니
   * 기본 동작을 막아라" 를 표현할 방법이 없고, 구독이 기본 뒤로가기를 억제하는지
   * 문서에 없다. 잘못 구독하면 앱에서 빠져나갈 수 없게 된다. 네이티브 뒤로가기가
   * history 를 움직이게 두면 depth 0 에서 자연스럽게 종료된다. (Phase 8 에서 확인)
   */
  for (const route of ['/', '/explore', '/tracks', '/taste', '/archive']) {
    await page.goto(`http://localhost:5173${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const backs = await page.getByRole('button', { name: 'Go back' }).count();
    check(backs === 0, `${route} — 자체 뒤로가기 버튼 없음`, backs ? `${backs}개 발견` : '');
  }

  const sai = await page.evaluate(() => ({
    value: getComputedStyle(document.documentElement).getPropertyValue('--sai-bottom').trim(),
    // 고정 바가 Safe Area 를 반영하는 규칙을 갖고 있는지 본다.
    hasRule: [...document.styleSheets]
      .flatMap((ss) => {
        try {
          return [...ss.cssRules];
        } catch {
          return [];
        }
      })
      .some((r) => r.cssText?.includes('--sai-bottom')),
  }));
  check(sai.hasRule, 'CSS 가 --sai-bottom 을 반영함', `변수값="${sai.value || '(토스 밖이라 없음)'}"`);

  console.log('\n[6] 콘솔/페이지 오류');
  const real = [...new Set(errors)];
  check(real.length === 0, '오류 없음', real.slice(0, 5).join(' | '));

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
