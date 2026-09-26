/**
 * Session B batch 1 — "실패는 실패로 보여야 한다" 회귀 검사 (UX-014, UX-011, UX-021, UX-015, UX-007).
 *
 * 브라우저에서 실제 요청을 끊어 실패를 만든다. 그러면 화면은
 *   실패 ≠ 로딩(무한 "불러오는 중")  실패 ≠ 빈 상태  실패 ≠ 성공  실패 ≠ 침묵
 * 을 지켜야 한다. Supabase 는 가짜 세션 + 목킹, Next 서버 액션(검색·앨범)은 `next-action`
 * 헤더가 붙은 POST 를 끊는다(REST URL 패턴으로는 안 걸린다 — Session B 감사에서 확인).
 *
 * 필요: dev 서버(NEXT_BASE, 기본 :3000). 검색·앨범 케이스는 캐시된 아티스트(이승윤)를 쓴다.
 * 사용: node toss/baseline/session-b-failure-check.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = nextBase();
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace('https://', '').replace('.supabase.co', '') || 'kgpwbxkaudeuoybdicqn';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER_ID = '11111111-2222-4333-8444-555555555555';
const JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, user_metadata: { nickname: '나', nickname_confirmed: true } })}.sig`;
const USER = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'x@example.com', app_metadata: {}, user_metadata: { nickname: '나', nickname_confirmed: true }, created_at: '2026-01-01T00:00:00Z' };
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER };
const ARTIST = { id: '6z4R3mCiiIiLgpicseyNkV', name: '이승윤', image: '' };
const RAW = /TypeError|Failed to fetch|PGRST|violates|duplicate key/;

let failed = 0;
const check = (ok, label, detail = '') => { failed += ok ? 0 : 1; console.log(`  [${ok ? 'O' : 'X'}] ${label}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bodyText = (page) => page.locator('body').innerText();
const isAction = (req) => req.method() === 'POST' && !!req.headers()['next-action'];

const browser = await chromium.launch();

/** 가짜 세션 + Supabase 목킹 탭. `state` 로 실패를 켜고 끈다. */
async function openTab({ loggedIn = false, seed = {}, draft = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  if (loggedIn) await ctx.addCookies([{ name: `sb-${PROJECT_REF}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(SESSION)).toString('base64')}`, url: BASE }]);
  const page = await ctx.newPage();
  await page.addInitScript((seedJson) => {
    sessionStorage.setItem('locale', 'ko');
    for (const [k, v] of Object.entries(JSON.parse(seedJson))) { sessionStorage.setItem(k, v); localStorage.setItem(k, v); }
  }, JSON.stringify(seed));
  const state = { failActions: false, failDraftGet: false, failListenDelete: false, failResultPost: false, failUnreleasedPost: false, failChallengeGet: false, writes: [] };
  const db = { drafts: draft ? [draft] : [], listen: [{ id: 'll-1', user_id: USER_ID, track_id: 't-1', title: '테스트 곡', artist_name: '이승윤', album_image: '', created_at: '2026-09-01T00:00:00Z' }] };
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const method = req.method();
    if (!url.hostname.endsWith('.supabase.co')) {
      if (state.failActions && isAction(req)) return route.abort('failed');
      return route.continue();
    }
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const p = url.pathname;
    if (p.startsWith('/auth/v1/')) return loggedIn ? json(p.endsWith('/user') ? USER : SESSION) : json({ message: 'no session' }, 401);
    if (p.includes('/rest/v1/sort_challenges')) { if (state.failChallengeGet) return route.abort('failed'); return json(method === 'GET' ? [] : null); }
    if (p.includes('/rest/v1/tournament_drafts')) {
      if (method === 'GET') { if (state.failDraftGet) return route.abort('failed'); return json(db.drafts); }
      state.writes.push({ method, path: p });
      if (method === 'PATCH') { const protectedRow = db.drafts.find((d) => ['playing', 'pre_tournament'].includes(d.status)); return json(protectedRow ? [] : db.drafts); }
      if (method === 'POST') return db.drafts.length ? json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409) : json([], 201);
      return json([]);
    }
    if (p.includes('/rest/v1/listen_later_tracks')) {
      if (method === 'GET') return json(db.listen);
      if (method === 'DELETE') { if (state.failListenDelete) return route.abort('failed'); db.listen = []; return json([], 204); }
      return json([]);
    }
    if (p.includes('/rest/v1/tournament_results')) { if (method === 'POST' && state.failResultPost) return route.abort('failed'); return json(method === 'GET' ? [] : [{ id: 'res-1' }], method === 'POST' ? 201 : 200); }
    if (p.includes('/rest/v1/unreleased_tracks')) { if (method === 'POST' && state.failUnreleasedPost) return json({ code: '42501', message: 'permission denied' }, 500); return json(method === 'GET' ? [] : [{ id: 'u-1' }], 201); }
    if (p.includes('/rpc/')) return json(null);
    return json(method === 'GET' ? [] : null);
  });
  return { ctx, page, state };
}

console.log('UX-014 검색: 서버 액션 실패는 "결과 없음"도 "불러오는 중"도 아니다');
{
  const { ctx, page, state } = await openTab();
  await page.goto(`${BASE}/explore?mode=single`, { waitUntil: 'networkidle' });
  // 하이드레이션 전에 타이핑하면 검색이 아예 안 나간다 — 추천 아티스트가 그려질 때까지 기다린다.
  await page.waitForFunction(() => document.querySelectorAll('img').length > 3, null, { timeout: 30000 }); await sleep(500);
  state.failActions = true;
  await page.locator('input[placeholder^="아티스트 검색"]').fill('이승윤'); await sleep(3500);
  let t = await bodyText(page);
  check(/검색 결과를 불러오지 못했어요/.test(t), '실패 문구가 보인다');
  check(!/아티스트 더 불러오는 중/.test(t), '"더 불러오는 중" 스피너가 남지 않는다');
  check(!/검색 결과가 없어요/.test(t), '"결과 없음"으로 위장하지 않는다');
  check(await page.getByRole('button', { name: '다시 시도', exact: true }).isVisible(), '다시 시도 버튼이 있다');
  state.failActions = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await sleep(4000);
  t = await bodyText(page);
  check(!/검색 결과를 불러오지 못했어요/.test(t) && /이승윤/.test(t), '다시 시도하면 같은 검색어로 결과가 온다');
  await ctx.close();
}

console.log('UX-014 앨범: 앨범 로딩 실패는 빈 화면이 아니다');
{
  const { ctx, page, state } = await openTab({ seed: { selectedArtists: JSON.stringify([ARTIST]), worldcup_is_single_artist: 'true' } });
  state.failActions = true;
  await page.goto(`${BASE}/tracks?mode=single`, { waitUntil: 'domcontentloaded' }); await sleep(6000);
  let t = await bodyText(page);
  check(/앨범을 불러오지 못했어요|앨범 목록을 불러오지 못했어요/.test(t), '실패 문구가 보인다');
  check(!/앨범 및 트랙 목록 열기/.test(t), '"목록 열기" 안내로 위장하지 않는다');
  const retry = page.getByRole('button', { name: '다시 시도', exact: true });
  check(await retry.isVisible(), '다시 시도 버튼이 있다');
  state.failActions = false;
  await retry.click(); await sleep(8000);
  t = await bodyText(page);
  check(/Releases|Tracks/.test(t) && !/불러오지 못했어요/.test(t), '다시 시도하면 앨범이 온다');
  await ctx.close();
}

console.log('UX-014 방: 방 조회 실패는 "불러오는 중"도 "잘못된 링크"도 아니다');
{
  const { ctx, page, state } = await openTab();
  state.failChallengeGet = true;
  await page.goto(`${BASE}/together/zzz0000`, { waitUntil: 'domcontentloaded' }); await sleep(11000); // supabase-js 가 1·2·4초 백오프로 재시도한 뒤 실패를 돌려준다
  let t = await bodyText(page);
  check(/링크를 불러오지 못했어요/.test(t), '실패 문구가 보인다');
  check(!/불러오고 있어요/.test(t), '로딩에 멈추지 않는다');
  check(!/지워졌거나 잘못된 링크/.test(t), '"없는 방"으로 위장하지 않는다');
  state.failChallengeGet = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await sleep(3000);
  t = await bodyText(page);
  check(/링크를 열 수 없어요/.test(t), '다시 시도하면 진짜 상태(없는 방)를 보여 준다');
  // 결과 화면과 코드 입력도 같은 규칙
  state.failChallengeGet = true;
  await page.goto(`${BASE}/together/zzz0000/result`, { waitUntil: 'domcontentloaded' }); await sleep(11000); // supabase-js 가 1·2·4초 백오프로 재시도한 뒤 실패를 돌려준다
  t = await bodyText(page);
  check(/결과를 불러오지 못했어요/.test(t) && !/일치율을 계산하고 있어요/.test(t), '결과 화면도 실패를 실패로 보여 준다');
  await page.goto(`${BASE}/together`, { waitUntil: 'domcontentloaded' }); await sleep(1000);
  await page.locator('input[placeholder="abc1234"]').fill('zzz0000'); await page.getByRole('button', { name: '들어가기' }).click();
  const lookupToast = await page.getByText('방을 확인하지 못했어요').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check(lookupToast && !/그런 코드가 없어요/.test(await bodyText(page)), '코드 입력도 "없는 코드"로 위장하지 않는다');
  await ctx.close();
}

console.log('UX-011 초안 충돌 뒤 상세 조회 실패: 막다른 시트 대신 실패 안내, 초안 보존');
{
  const X = { id: 'x-1', user_id: USER_ID, is_single_artist: true, status: 'playing', title: '내 음악 월드컵', selected_artists: [{ id: 'a-x', name: '볼빨간사춘기' }], selected_tracks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }], phase: 'playing', current_round_name: '준결승전', current_match_index: 0, bye_count: 0, tracks: [], matches: [], winners: [], eliminated_tracks: [], selected_byes: [], skipped_tracks: [], progress: { v: 1, matches: [], winners: [], eliminated: [], skipped: [], picks: [] }, saved_at: null, created_at: '2026-09-26T00:00:00Z', updated_at: new Date().toISOString() };
  const { ctx, page, state } = await openTab({ loggedIn: true, draft: X });
  await page.goto(`${BASE}/explore?mode=single`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('img').length > 3, null, { timeout: 30000 }); await sleep(500);
  await page.locator('input[placeholder^="아티스트 검색"]').fill('이승윤'); await page.locator('img[alt="이승윤"]').first().waitFor({ timeout: 20000 }); await sleep(300);
  await page.locator('img[alt="이승윤"]').first().click(); await sleep(600);
  state.failDraftGet = true;
  await page.getByRole('button', { name: '곡 고르러 가기' }).click();
  // supabase-js 재시도 백오프(1·2·4초) 뒤에 실패가 돌아온다.
  const seenToast = await page.getByText('진행 중인 소트를 확인하지 못했어요').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  const t = await bodyText(page);
  check(seenToast, '실패 토스트가 보인다');
  check(!/진행 중인 월드컵이 있어요/.test(t), '내용 없는 충돌 시트를 띄우지 않는다');
  check(page.url().includes('/explore'), '다음 화면으로 넘어가지 않는다');
  check(!state.writes.some((w) => w.method === 'DELETE') && db_ok(state), '초안을 지우거나 덮는 쓰기가 없다', state.writes.map((w) => w.method).join(','));
  function db_ok(s) { return s.writes.every((w) => w.method === 'PATCH' || w.method === 'POST'); }
  state.failDraftGet = false;
  const again = page.getByRole('button', { name: '곡 고르러 가기' }); await again.waitFor({ state: 'visible', timeout: 10000 }); await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '곡 고르러 가기'); return b && !b.disabled; }, null, { timeout: 15000 });
  await again.click(); await sleep(4000);
  check(/진행 중인 월드컵이 있어요/.test(await bodyText(page)), '조회가 되면 같은 버튼으로 충돌 시트가 뜬다');
  await ctx.close();
}

console.log('UX-021 미발매곡 등록 실패는 성공 톤이 아니다');
{
  const { ctx, page, state } = await openTab({ loggedIn: true, seed: { selectedArtists: JSON.stringify([ARTIST]), worldcup_is_single_artist: 'true' } });
  await page.goto(`${BASE}/tracks?mode=single`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60 && !(await page.getByRole('button', { name: '미발매곡 추가' }).isVisible().catch(() => false)); i++) await sleep(1000);
  const add = page.getByRole('button', { name: '미발매곡 추가' }); await add.scrollIntoViewIfNeeded(); await add.click(); await sleep(600);
  await page.getByPlaceholder('예: 미공개 자작곡 1번').fill('회귀 테스트 곡'); await page.getByPlaceholder('유튜브 링크 등').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  state.failUnreleasedPost = true;
  await page.getByRole('button', { name: '추가하기' }).click(); await sleep(2500);
  const t = await bodyText(page);
  check(/등록하지 못했어요/.test(t), '실패 문구가 보인다');
  check(!/바로 사용할 수 있어요!/.test(t), '성공 문구를 빌리지 않는다');
  check((await page.locator('[role=alert]').count()) > 0, '오류 역할(alert)로 표시된다');
  await ctx.close();
}

console.log('UX-015 들어볼 곡 삭제 실패는 조용히 되돌아오지 않는다');
{
  const { ctx, page, state } = await openTab({ loggedIn: true });
  await page.goto(`${BASE}/explore-taste`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await page.getByRole('tab', { name: /들어볼 곡/ }).click(); await sleep(800);
  check(/테스트 곡/.test(await bodyText(page)), '(준비) 목록에 곡이 있다');
  state.failListenDelete = true;
  await page.locator('button[aria-label="목록에서 지우기"]').first().click(); await sleep(2500);
  let t = await bodyText(page);
  check(/지우지 못했어요/.test(t), '실패 토스트가 보인다');
  check(/테스트 곡/.test(t), '곡이 목록에 남아 있다');
  state.failListenDelete = false; await sleep(3200);
  await page.locator('button[aria-label="목록에서 지우기"]').first().click(); await sleep(2000);
  t = await bodyText(page);
  check(/들어볼 곡에서 지웠어요/.test(t) && !/테스트 곡/.test(t), '성공하면 지웠다고 말하고 곡이 사라진다');
  await ctx.close();
}

console.log('UX-007 저장 실패 토스트에 원시 예외 문자열이 없다');
{
  const { ctx, page, state } = await openTab({ loggedIn: true, seed: { worldcup_ranking: JSON.stringify(RANKING.slice(0, 8)), selectedArtists: JSON.stringify([{ id: 'art1', name: '카더가든', image: '' }]), worldcup_is_single_artist: 'true' } });
  await page.goto(`${BASE}/taste?mode=single`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
  const skip = page.getByRole('button', { name: '건너뛰기' }); if (await skip.isVisible().catch(() => false)) await skip.click(); await sleep(1200);
  state.failResultPost = true;
  await page.getByRole('button', { name: '저장하기' }).first().click(); await sleep(500);
  await page.getByRole('button', { name: '내 취향 스페이스에 저장' }).click(); await sleep(3000);
  const t = await bodyText(page);
  check(/취향표를 저장하지 못했어요/.test(t), '사람이 읽을 실패 문구가 보인다');
  check(!RAW.test(t), '원시 예외 문자열이 화면에 없다', (t.match(RAW) || [''])[0]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n결과: 실패 ${failed}건` : '\n결과: 통과');
process.exit(failed ? 1 : 0);