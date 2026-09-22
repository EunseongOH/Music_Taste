/**
 * 딥링크 콜드스타트 검증.
 *
 * 미니앱은 항상 번들 루트(`/`)에서 시작한다. 공유 링크로 들어와도 WebView 의
 * 주소는 `/` 라서, `Environment.initialURL` 을 읽어 경로를 맞춰 주지 않으면
 * 공유된 취향표 대신 홈이 열린다.
 *
 * 실제 토스 앱 없이 확인하려고 `Environment.initialURL` 만 흉내 낸다.
 * SDK 모듈의 export 를 덮어쓸 수는 없으므로, 빌드된 번들을 그대로 쓰되
 * 파싱 규칙(initialRoute.ts 와 같은 정규식)이 맞는지를 먼저 보고,
 * 그 결과 경로로 앱이 올바른 화면을 여는지를 확인한다.
 *
 * 사용: node toss/baseline/deeplink-check.mjs
 */
import { chromium } from 'playwright';
import { announce, vite } from './base.mjs';

const BASE = vite();
announce(['기준 서버:', BASE]);
const SHARED_ID = '631ac9fe-0305-4b26-bad8-05908a5ccae4';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// initialRoute.ts 와 같은 규칙. 여기서 어긋나면 둘 중 하나가 바뀐 것이다.
const PATTERN = /^intoss(?:-private)?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/;
const parse = (url) => {
  const m = url.match(PATTERN);
  if (!m) return null;
  return `${m[1] ?? '/'}${m[2] ?? ''}`;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });

try {
  console.log('\n[1] 스킴 URL 파싱');
  const cases = [
    [`intoss://sortify-musictaste/shared?id=${SHARED_ID}`, `/shared?id=${SHARED_ID}`],
    ['intoss://sortify-musictaste', '/'],
    ['intoss://sortify-musictaste/', '/'],
    ['intoss://sortify-musictaste/archive', '/archive'],
    // 콘솔 QR 테스트용 비공개 스킴도 같은 모양이다.
    [`intoss-private://sortify-musictaste/shared?id=${SHARED_ID}`, `/shared?id=${SHARED_ID}`],
    ['https://example.com/shared?id=x', null], // 스킴이 다르면 무시
  ];
  for (const [url, expected] of cases) {
    const got = parse(url);
    check(got === expected, `${url.slice(0, 52)} → ${expected ?? '(무시)'}`, got === expected ? '' : `실제 ${got}`);
  }

  console.log('\n[2] 그 경로로 앱이 올바른 화면을 여는가');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const target = parse(`intoss://sortify-musictaste/shared?id=${SHARED_ID}`);
  await page.goto(`${BASE}${target}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const view = await page.evaluate(() => {
    const root = document.querySelector('main') ?? document.getElementById('root');
    return {
      text: (root?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      imgs: root?.querySelectorAll('img').length ?? 0,
    };
  });
  check(view.text.includes('공유된 취향표'), '공유된 취향표 화면이 열림', view.text);
  check(view.imgs > 0, '트랙 이미지가 렌더됨', `${view.imgs}개`);
  check(errors.length === 0, '콘솔/페이지 오류 없음', [...new Set(errors)].slice(0, 3).join(' | '));

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
