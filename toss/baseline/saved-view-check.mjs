/**
 * "저장된 취향표 보기"(/my-taste?id=) 검사.
 *
 * 예전에는 내 취향 스페이스의 "불러와서 공유하기"가 월드컵 결과 화면(/taste)을
 * 재사용해서, 로그인한 채로 16곡 이상 취향표를 열면 같은 취향표가 DB 에 또 저장됐다.
 * 이 화면은 저장을 절대 하지 않아야 한다.
 *
 * 안전장치: Supabase REST 쓰기 요청(POST/PATCH/PUT/DELETE)은 전부 **차단하고 센다**.
 * 버그가 되살아나도 운영 DB 에는 아무것도 쓰이지 않는다.
 *
 * 사용: node toss/baseline/saved-view-check.mjs                # 웹(:3000), 게스트 + 로그인(가짜 세션)
 *       TARGET=toss node toss/baseline/saved-view-check.mjs    # 토스(:5173), 게스트
 *       BASE=http://localhost:3100 node ...                    # 포트 변경
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOSS = process.env.TARGET === 'toss';
const BASE = process.env.BASE ?? (TOSS ? 'http://localhost:5173' : 'http://localhost:3000');
/**
 * 실제 공개 취향표(43곡). 읽기만 한다.
 * 자동 저장은 16곡 이상일 때만 돌기 때문에, 16곡 미만 취향표로는 옛 버그가 재현되지 않는다.
 * 이 취향표가 삭제·비공개로 바뀌면 SAVED_ID 로 다른 공개 취향표(16곡 이상)를 지정한다.
 */
const SHARED_ID = process.env.SAVED_ID ?? '18241653-d904-4095-ada5-5ade85c9e4b7';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/**
 * 브라우저 문맥을 만들고 Supabase 요청을 가로챈다.
 *  - REST 쓰기(POST/PATCH/PUT/DELETE)는 전부 차단하고 writes 에 센다.
 *  - fakeLogin: 가짜 세션 쿠키를 심어 앱이 "로그인 상태"로 동작하게 한다.
 *    실제 로그인 프로필(.profile)을 쓰면 토큰 갱신이 원본 세션을 무효화하므로 쓰지 않는다.
 *    가짜 토큰은 서버가 거절하므로 읽기는 익명 키로 바꿔 보내고, 인증 서버 요청은 막는다.
 */
async function makeContext(fakeLogin) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] });
  const writes = [];
  await ctx.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const m = req.method();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
      writes.push(`${m} ${req.url().slice(0, 80)}`);
      return route.abort();
    }
    if (!fakeLogin) return route.continue();
    const h = req.headers();
    return route.continue({ headers: { ...h, authorization: `Bearer ${h.apikey}` } });
  });
  if (fakeLogin) {
    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const user = { id: '00000000-0000-4000-8000-00000000c0de', aud: 'authenticated', role: 'authenticated', email: 'saved-view-check@example.invalid', app_metadata: { provider: 'google' }, user_metadata: { nickname: '검사용리스너', nickname_confirmed: true }, created_at: '2026-01-01T00:00:00Z' };
    // 저장 로직은 쓰기 전에 getUser 로 세션을 확인한다. 가짜 사용자로 답하고, 나머지 인증 요청은 막는다.
    await ctx.route('**/auth/v1/**', (route) =>
      new URL(route.request().url()).pathname.endsWith('/auth/v1/user') && route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
        : route.abort());
    const session = { access_token: `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, exp, role: 'authenticated' })}.fake`, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'fake', user };
    await ctx.addCookies([{ name: 'sb-kgpwbxkaudeuoybdicqn-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: BASE }]);
  }
  return { ctx, writes };
}

async function run(label, fakeLogin) {
  console.log(`\n[${label}]`);
  const { ctx, writes } = await makeContext(fakeLogin);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // 진행 중인 월드컵이 있는 상태를 흉내 낸다. 이 화면을 나가도 지워지면 안 된다.
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      sessionStorage.setItem('worldcup_progress', '{"keep":true}');
      localStorage.setItem('worldcup_progress', '{"keep":true}');
    }
    // Next dev 모드의 표시 버튼(왼쪽 아래)이 하단 "저장하기" 버튼을 가려 클릭을 막는다. 개발 전용이라 숨긴다.
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = 'nextjs-portal{display:none!important}';
      document.head.appendChild(st);
    });
    window.__copied = null;
    if (navigator.clipboard) navigator.clipboard.writeText = async (t) => { window.__copied = t; };
  });

  // 실제 흐름처럼 앱 안의 다른 화면에서 들어온다(나가기 = 뒤로 가기가 앱 화면으로 돌아가야 한다).
  await page.goto(`${BASE}/explore-taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.goto(`${BASE}/my-taste?id=${SHARED_ID}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const tab = page.getByRole('button', { name: '피라미드형' });
  await tab.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  check((await tab.count()) > 0, '연출 없이 바로 완성된 취향표가 뜬다');
  await page.waitForTimeout(6000); // 예전 자동 저장이 돌던 시간만큼 기다린다

  const title = (await page.locator('h1').first().textContent())?.trim();
  check(!!title && title !== '취향 기록표', '헤더 제목이 불러온 취향표 제목', title);
  check(writes.length === 0, '저장 요청 0건', writes.join(' | ') || '없음');

  await page.getByRole('button', { name: '저장하기' }).first().click();
  await page.waitForTimeout(800);
  check((await page.getByRole('button', { name: /내 취향 스페이스에 저장/ }).count()) === 0, '저장 시트에 "내 취향 스페이스에 저장" 없음');
  await page.keyboard.press('Escape');
  await page.mouse.click(215, 80);
  await page.waitForTimeout(600);

  if (!TOSS) {
    await page.getByRole('button', { name: '공유하기' }).first().click();
    await page.waitForTimeout(800);
    const copy = page.getByRole('button', { name: '취향표 링크 복사하기' });
    if (await copy.count()) {
      await copy.click();
      await page.waitForTimeout(1500);
      const copied = await page.evaluate(() => window.__copied);
      check(typeof copied === 'string' && copied.trimEnd().endsWith(`/taste/${SHARED_ID}`), '공유 링크가 이 취향표 주소', copied?.split('\n').pop());
    }
    check(writes.length === 0, '공유 후에도 저장 요청 0건', writes.join(' | '));
    await page.keyboard.press('Escape');
    await page.mouse.click(215, 80);
    await page.waitForTimeout(600);
  }

  await page.locator('button[title="종료하기"]').click();
  await page.waitForTimeout(1500);
  check(new URL(page.url()).pathname === '/explore-taste', '나가기 = 들어온 화면으로 돌아감', new URL(page.url()).pathname);
  const kept = await page.evaluate(() => ({ s: sessionStorage.getItem('worldcup_progress'), l: localStorage.getItem('worldcup_progress') }));
  check(kept.s === '{"keep":true}' && kept.l === '{"keep":true}', '나가도 진행 중인 월드컵 기록 유지');
  check(writes.length === 0, '최종 저장 요청 0건');
  await ctx.close();
}

const browser = await chromium.launch();
try {
  console.log(`대상: ${BASE}${TOSS ? ' (토스)' : ' (웹)'}`);
  await run('게스트', false);

  // 토스 빌드의 로그인은 토스 세션이라 가짜 쿠키가 통하지 않는다. 자동 저장 로직은 두 빌드 공통이므로 웹에서만 본다.
  if (!TOSS) {
    await run('로그인(가짜 세션)', true);

    /*
     * 대조군: 월드컵 직후 결과 화면(/taste)은 로그인 + 16곡 이상이면 자동 저장한다.
     * 같은 가짜 세션으로 여기서 쓰기 요청이 잡혀야 위 "0건" 판정이 믿을 만하다
     * (요청은 차단되므로 운영 DB 에는 쓰이지 않는다).
     */
    console.log('\n[대조군: 월드컵 직후 /taste]');
    const ranking = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
    const { ctx, writes } = await makeContext(true);
    const page = await ctx.newPage();
    await page.addInitScript((r) => sessionStorage.setItem('worldcup_ranking', JSON.stringify(r)), ranking);
    await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(8000);
    check(writes.some((w) => w.includes('tournament_results')), '결과 화면은 자동 저장을 시도함(가짜 세션이 로그인으로 인식됨)', `${writes.length}건 차단 ${writes.join(' | ')}`);
    await ctx.close();
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
