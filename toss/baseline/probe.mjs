/**
 * 저장된 프로필에 실제로 어떤 인증 흔적이 남았는지 확인하는 진단 스크립트.
 * 로그인 감지가 실패했을 때 원인을 좁히는 용도.
 *
 *   node toss/baseline/probe.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { announce, nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, '.profile');
const BASE = nextBase();
announce(['기준 서버:', BASE]);

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 430, height: 932 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForTimeout(4000); // AuthProvider 가 세션을 복원할 시간

console.log('=== 컨텍스트 쿠키 ===');
const cookies = await context.cookies();
for (const c of cookies) {
  console.log(`  ${c.name}  (${c.domain})  len=${String(c.value).length}`);
}
if (!cookies.length) console.log('  (없음)');

const dump = await page.evaluate(() => {
  const ls = [];
  const ss = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      ls.push({ k, len: (localStorage.getItem(k) || '').length });
    }
  } catch (e) {
    ls.push({ k: 'ERROR: ' + e.message, len: 0 });
  }
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      ss.push({ k, len: (sessionStorage.getItem(k) || '').length });
    }
  } catch (e) {
    ss.push({ k: 'ERROR: ' + e.message, len: 0 });
  }
  return { ls, ss, cookie: document.cookie };
});

console.log('\n=== localStorage ===');
dump.ls.length ? dump.ls.forEach((e) => console.log(`  ${e.k}  len=${e.len}`)) : console.log('  (없음)');
console.log('\n=== sessionStorage ===');
dump.ss.length ? dump.ss.forEach((e) => console.log(`  ${e.k}  len=${e.len}`)) : console.log('  (없음)');
console.log('\n=== document.cookie ===');
console.log('  ' + (dump.cookie || '(없음)'));

// 앱이 실제로 로그인 상태로 보이는지: 헤더에 로그인 버튼이 있으면 로그아웃 상태.
const loginBtn = await page
  .getByRole('button', { name: /로그인|Log In/i })
  .count()
  .catch(() => -1);
console.log(`\n헤더의 로그인 버튼 개수: ${loginBtn}  → ${loginBtn === 0 ? '로그인된 것으로 보임' : '로그아웃 상태로 보임'}`);

await page.screenshot({ path: join(HERE, 'probe.png') });
console.log(`스크린샷: ${join(HERE, 'probe.png')}`);

await context.close();
