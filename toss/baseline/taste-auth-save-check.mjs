/**
 * 취향 기록표 — 로그인하면 하던 저장이 이어지는지 검사한다.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/taste-auth-save-check.mjs
 *
 * 예전에는 [저장하기] 를 누른 비로그인 사용자에게 로그인 창만 띄우고 끝이었다.
 * 게다가 LoginModal 은 `onSuccess` 가 없으면 /explore 로 보내서 화면 자체를 잃었다.
 *
 * 운영 DB 에는 쓰지 않는다 — Supabase 호출을 가로채 답하고, 쓰기는 세어만 둔다.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = nextBase();
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace('https://', '').replace('.supabase.co', '') || 'kgpwbxkaudeuoybdicqn';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: USER_ID, role: 'authenticated', aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
  user_metadata: { nickname: '나', nickname_confirmed: true },
})}.sig`;
const SESSION = {
  access_token: JWT, refresh_token: 'r', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'x@example.com',
    app_metadata: {}, user_metadata: { nickname: '나', nickname_confirmed: true },
    created_at: '2026-01-01T00:00:00Z',
  },
};

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
console.log(`대상 ${BASE}\n`);

/**
 * 결과 화면을 연다.
 *  - `songs` 로 곡 수를 정한다. 16곡 미만은 **자동 저장이 아예 돌지 않는** 구간이라
 *    직접 누른 저장이 유일한 길이다(옛 버그가 가장 확실히 드러나던 자리).
 *  - `existingResult` 를 주면 같은 아티스트의 기존 기록이 있는 것으로 답한다.
 */
async function open({ songs = 20, existingResult = null } = {}) {
  const ranking = RANKING.slice(0, songs);
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const inserts = [];
  await ctx.route('**://i.scdn.co/**', (r) =>
    r.fulfill({
      status: 200, contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#8c7f6d"/></svg>',
    })
  );
  await page.addInitScript((r) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id: 'art1', name: '카더가든', image: '' }]));
    sessionStorage.setItem('locale', 'ko');
  }, ranking);

  await page.route((u) => u.href.includes('.supabase.co/'), async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/auth/v1/')) return json({ user: SESSION.user });
    if (req.method() === 'POST' && url.includes('/tournament_results')) {
      inserts.push(req.postData() ?? '');
      return json([{ id: `res-${inserts.length}` }]);
    }
    if (req.method() !== 'GET') return json([]);
    if (url.includes('/tournament_results')) {
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (!existingResult) return json(single ? null : []);
      return json(single ? existingResult : [existingResult]);
    }
    return json([]);
  });

  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  return { ctx, page, inserts };
}

/** 저장하기 → 내 취향 스페이스에 저장. 비로그인이면 여기서 로그인 창이 뜬다. */
async function clickSaveToSpace(page) {
  await page.getByRole('button', { name: '저장하기' }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /내 취향 스페이스/ }).first().click();
  await page.waitForTimeout(900);
}

/**
 * 로그인 성공을 흉내 낸다.
 *
 * 쿠키를 심고(@supabase/ssr 은 세션을 쿠키에 둔다) LoginModal 의 구글 경로와 같은 모양으로
 * `AUTH_SUCCESS` 를 흘린다 — 실제 팝업이 돌려주는 메시지다.
 */
async function signIn(ctx, page) {
  await ctx.addCookies([{
    name: `sb-${PROJECT_REF}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(SESSION)).toString('base64')}`,
    url: BASE,
  }]);
  await page.evaluate((session) => {
    window.postMessage({ type: 'AUTH_SUCCESS', session }, window.location.origin);
  }, SESSION);
  await page.waitForTimeout(3000);
}

const path = (page) => new URL(page.url()).pathname;

/* ── CASE A — 8곡. 자동 저장이 돌지 않는 구간 ─────────────── */
{
  console.log('CASE A — 8곡 · 저장하기 → 로그인');
  const { ctx, page, inserts } = await open({ songs: 8 });
  await clickSaveToSpace(page);
  const armed = await page.evaluate(() => sessionStorage.getItem('taste_pending_auth_action'));
  check(armed === 'save-to-space', '하려던 일을 적어 둠', String(armed));
  await signIn(ctx, page);

  check(path(page) === '/taste', '화면을 떠나지 않음', path(page));
  check(/Harmony/.test(await page.locator('body').innerText()), '로그인 전 순위가 그대로');
  check(inserts.length === 1, '저장 1회', `${inserts.length}회`);
  const left = await page.evaluate(() => sessionStorage.getItem('taste_pending_auth_action'));
  check(left === null, '이어서 할 일은 지워짐');
  await ctx.close();
  console.log('');
}

/* ── CASE B — 20곡. 자동 저장과 겹치는 구간 ───────────────── */
{
  console.log('CASE B — 20곡 · 자동 저장과 겹쳐도 한 번만');
  const { ctx, page, inserts } = await open({ songs: 20 });
  await clickSaveToSpace(page);
  await signIn(ctx, page);
  check(inserts.length === 1, '저장 정확히 1회', `${inserts.length}회`);
  check(path(page) === '/taste', '화면을 떠나지 않음', path(page));
  await ctx.close();
  console.log('');
}

/* ── CASE D — 로그인 취소 ─────────────────────────────────── */
{
  console.log('CASE D — 로그인 창을 닫으면 나중에도 저장되지 않는다');
  const { ctx, page, inserts } = await open({ songs: 8 });
  await clickSaveToSpace(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const close = page.getByRole('button', { name: /닫기|close/i }).first();
  if (await close.count()) await close.click().catch(() => {});
  await page.waitForTimeout(600);
  const pending = await page.evaluate(() => sessionStorage.getItem('taste_pending_auth_action'));
  check(pending === null, '이어서 할 일이 지워짐', String(pending));
  await signIn(ctx, page);
  check(inserts.length === 0, '나중에 로그인해도 저장되지 않음', `${inserts.length}회`);
  await ctx.close();
  console.log('');
}

/* ── CASE E — 같은 아티스트 기록이 이미 있으면 묻는다 ─────── */
{
  console.log('CASE E — 기존 기록이 있으면 덮어쓰기를 묻는다');
  const existing = {
    id: 'old-1', user_id: USER_ID, title: '카더가든 sort_260101', artist_id: 'art1',
    artist_name: '카더가든', is_single_artist: true, is_public: true,
    ranking: [], created_at: '2026-01-01T00:00:00Z',
    winner_track_title: 'Harmony', winner_track_artist: '카더가든', winner_track_image: '',
  };
  const { ctx, page, inserts } = await open({ songs: 8, existingResult: existing });
  await clickSaveToSpace(page);
  await signIn(ctx, page);
  const body = await page.locator('body').innerText();
  check(/이전 Sort 기록이 있어요/.test(body), '덮어쓰기 선택창이 뜸');
  check(inserts.length === 0, '묻기 전에 말없이 저장하지 않음', `${inserts.length}회`);
  await ctx.close();
  console.log('');
}

/* -- CASE G/H -- 게스트로 계속하기는 인증이 아니다 ------------ */
{
  console.log('CASE G — 게스트로 계속하기를 고르면 저장하려던 뜻도 지워진다');
  const { ctx, page, inserts } = await open({ songs: 8 });
  await clickSaveToSpace(page);
  const armed = await page.evaluate(() => sessionStorage.getItem('taste_pending_auth_action'));
  check(armed === 'save-to-space', '누른 직후에는 적혀 있다', String(armed));

  await page.getByRole('button', { name: /게스트로 구경하기|Guest/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /게스트로 계속하기|Continue as Guest/ }).first().click();
  await page.waitForTimeout(900);

  check(path(page) === '/taste', '결과 화면에 그대로 있다', path(page));
  check(/Harmony/.test(await page.locator('body').innerText()), '순위가 그대로');
  const left = await page.evaluate(() => sessionStorage.getItem('taste_pending_auth_action'));
  check(left === null, '이어서 할 일이 지워졌다', String(left));
  check(inserts.length === 0, '저장되지 않음', `${inserts.length}회`);

  console.log('CASE H — 그 뒤에 로그인해도 누른 적 없는 저장이 실행되지 않는다');
  await signIn(ctx, page);
  check(inserts.length === 0, '여전히 저장 0회', `${inserts.length}회`);
  check(path(page) === '/taste', '화면을 떠나지 않음', path(page));
  await ctx.close();
  console.log('');
}

await browser.close();
console.log(failed === 0 ? '결과: 통과' : `결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
