/**
 * 지금 하는 판과 계정의 초안을 섞지 않는지 검사한다 (UX-004 · UX-001).
 *
 *   SPOTIFY_CACHE_ONLY=1 서버에 대고:
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/draft-ownership-check.mjs
 *
 * UX-004  게스트로 판 Y 를 하다 로그인하면 계정의 옛 초안 X 가 화면을 갈아치웠고,
 *         자동저장이 "아티스트 Y + 곡 X" 섞인 줄을 X 자리에 썼다.
 * UX-001  진행 중인 X 가 있는데 /explore 에 바로 들어와 다른 아티스트를 고르면
 *         경고 없이 X 가 artist_selection 으로 덮였다(곡·라운드는 남아 섞인 줄).
 *
 * 운영 DB 에는 쓰지 않는다 — `tournament_drafts` 를 메모리 표로 흉내 낸다
 * (PostgREST 의 select·upsert·insert·조건 update·delete). 로그인은 LoginModal 이 받는
 * 팝업 메시지(`AUTH_SUCCESS`)로 한다 — 페이지를 새로 읽지 않는 실제 로그인 경로다.
 * 세션 저장소는 탭마다 **처음 한 번만** 심는다(새로 고침 검사가 의미 있게).
 */
import { chromium } from 'playwright';
import { nextBase } from './base.mjs';

const BASE = nextBase();
const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace('https://', '').replace('.supabase.co', '') || 'kgpwbxkaudeuoybdicqn';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER_ID = '11111111-2222-4333-8444-555555555555';
const JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: USER_ID, role: 'authenticated', aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
  user_metadata: { nickname: '나', nickname_confirmed: true },
})}.sig`;
const USER = {
  id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'x@example.com',
  app_metadata: {}, user_metadata: { nickname: '나', nickname_confirmed: true }, created_at: '2026-01-01T00:00:00Z',
};
const SESSION = {
  access_token: JWT, refresh_token: 'r', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER,
};

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/* ── 판 두 개 ─────────────────────────────────────────────── */
const tracksOf = (p, name) => Array.from({ length: 8 }, (_, i) => ({
  id: `${p}${i + 1}`, title: `${name} ${i + 1}`, artistName: name, albumImage: '/default-profile.png',
}));
const X_ARTIST = { id: 'arX', name: '엑스가수', image: '' };
const Y_ARTIST = { id: 'arY', name: '와이밴드', image: '' };
const XT = tracksOf('x', '엑스가수');
const YT = tracksOf('y', '와이밴드');
const pairs = (t) => [[t[0], t[1]], [t[2], t[3]], [t[4], t[5]], [t[6], t[7]]];

/** 계정의 진행 중 초안 X — 8강 2번째 매치. */
const draftX = () => ({
  user_id: USER_ID, is_single_artist: true, status: 'playing', title: '내 음악 월드컵',
  selected_artists: [X_ARTIST], selected_tracks: XT, phase: 'playing',
  current_round_name: '8강', current_match_index: 1, skipped_tracks: [],
  progress: { v: 1, matches: pairs(XT).map((m) => m.map((t) => t.id)), winners: ['x1'], eliminated: ['x2'], skipped: [], picks: [[8, 'x1', 'x2']] },
  saved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

/** 이 탭에서 게스트로 하던 판 Y — 8강 3번째 매치(y5 vs y6). */
const guestY = () => ({
  selectedArtists: JSON.stringify([Y_ARTIST]),
  worldcup_tracks: JSON.stringify(YT),
  worldcup_is_single_artist: 'true',
  worldcup_progress: JSON.stringify({
    phase: 'playing', currentRoundName: '8강', matches: pairs(YT), currentMatchIndex: 2,
    winners: [YT[0], YT[2]], eliminatedTracks: [YT[1], YT[3]], skippedTracks: [],
    picks: [[8, 'y1', 'y2'], [8, 'y3', 'y4']], byeCount: 0, selectedByes: [],
  }),
  // 새 코드가 "이 탭의 판" 을 알아보는 표시. 옛 코드는 읽지 않는다(없어도 같은 화면).
  worldcup_active_run_v1: JSON.stringify({ runId: 'guest-y', single: true, attachedUserId: null }),
});

const browser = await chromium.launch();
console.log(`대상 ${BASE}\n`);

/** PostgREST 필터 몇 가지만. */
function matches(row, params) {
  for (const [k, v] of params) {
    if (['select', 'limit', 'on_conflict', 'order', 'columns'].includes(k)) continue;
    const val = row[k];
    if (v.startsWith('eq.')) {
      if (String(val) !== v.slice(3)) return false;
    } else if (v.startsWith('not.in.(')) {
      const set = v.slice(8, -1).split(',');
      if (set.includes(String(val))) return false;
    }
  }
  return true;
}

async function openTab({ loggedIn = false, draft = null, seed = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const db = { rows: draft ? [draft] : [], writes: [] };
  const state = { loggedIn };
  if (loggedIn) {
    await ctx.addCookies([{ name: `sb-${PROJECT_REF}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(SESSION)).toString('base64')}`, url: BASE }]);
  }
  const page = await ctx.newPage();
  await page.addInitScript((seedJson) => {
    sessionStorage.setItem('locale', 'ko');
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(JSON.parse(seedJson))) {
        sessionStorage.setItem(k, v);
        if (k !== 'worldcup_active_run_v1') localStorage.setItem(k, v);
      }
    }
  }, JSON.stringify(seed));

  await page.route((u) => u.href.includes('.supabase.co/'), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/auth/v1/')) {
      if (!state.loggedIn) return json({ message: 'no session' }, 401);
      return json(url.pathname.endsWith('/user') ? USER : SESSION);
    }
    if (!url.pathname.includes('/rest/v1/tournament_drafts')) {
      if (url.pathname.includes('/rpc/')) return json(null);
      return json(method === 'GET' ? [] : null);
    }
    const params = [...url.searchParams.entries()];
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const list = Array.isArray(body) ? body : body ? [body] : [];
    if (method === 'GET') return json(db.rows.filter((r) => matches(r, params)));
    db.writes.push({ method, url: url.search, body });
    if (method === 'DELETE') { db.rows = db.rows.filter((r) => !matches(r, params)); return json([]); }
    if (method === 'PATCH') {
      const hit = db.rows.filter((r) => matches(r, params));
      hit.forEach((r) => Object.assign(r, body));
      return json(hit);
    }
    if (method === 'POST') {
      const upsert = url.searchParams.has('on_conflict');
      const out = [];
      for (const row of list) {
        const cur = db.rows.find((r) => r.user_id === row.user_id && r.is_single_artist === row.is_single_artist);
        if (cur && !upsert) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        if (cur) Object.assign(cur, row);
        else db.rows.push({ skipped_tracks: [], ...row });
        out.push(row);
      }
      return json(out, 201);
    }
    return json([]);
  });

  const snapshot = () => JSON.parse(JSON.stringify(db.rows));
  const login = async () => {
    await page.getByRole('button', { name: '로그인' }).first().click();
    await page.waitForTimeout(600);
    state.loggedIn = true;
    await ctx.addCookies([{ name: `sb-${PROJECT_REF}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(SESSION)).toString('base64')}`, url: BASE }]);
    await page.evaluate((session) => window.postMessage({ type: 'AUTH_SUCCESS', session }, window.location.origin), SESSION);
    await page.waitForTimeout(3000);
  };
  const body = () => page.locator('body').innerText();
  return { ctx, page, db, snapshot, login, body };
}

/** 월드컵 후보 하나를 아래로 끌어 고른다(다음 매치로). */
async function pickFirst(page) {
  const card = page.locator('[style*="touch-action: none"]').first();
  const box = await card.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + i * 25);
  await page.mouse.up();
  await page.waitForTimeout(2500); // 재생 연출(1.5초) 뒤 다음 매치
}

/**
 * 한 여정. 중간에 화면이 기대와 달라 다음 단계를 못 하면(예: 옛 코드는 묻지 않고 넘어간다)
 * 그 여정은 실패로 적고 다음 여정으로 간다.
 */
async function section(fn) {
  try {
    await fn();
  } catch (e) {
    check(false, '여정을 끝까지 진행하지 못함', String(e.message).split('\n')[0]);
  }
}

/** 판의 내용만 비교한다(아티스트·곡·진행·라운드·단계). 자동저장 시각은 보지 않는다. */
const essence = (rows) => rows.map((r) => ({
  s: r.status, a: artistOf(r), t: (r.selected_tracks ?? []).map((x) => x.id).join(','),
  p: JSON.stringify(r.progress ?? null), r: r.current_round_name ?? null, i: r.current_match_index ?? null,
}));
const same = (a, b) => JSON.stringify(essence(a)) === JSON.stringify(essence(b));
const artistOf = (row) => (row?.selected_artists ?? []).map((a) => a.id).join(',');
const trackPrefixes = (row) => [...new Set((row?.selected_tracks ?? []).map((t) => t.id[0]))].join(',');

/* ── UX-004 ─────────────────────────────────────────────── */
console.log('UX-004 · 계정에 초안 X, 게스트로 판 Y 를 하다 로그인');
await section(async () => {
  const t = await openTab({ draft: draftX(), seed: guestY() });
  await t.page.goto(`${BASE}/worldcup?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.waitForTimeout(3500);
  const before = t.snapshot();
  check(/와이밴드 5/.test(await t.body()), '(전제) 게스트 화면은 Y 의 3번째 매치');

  await t.login();
  const b1 = await t.body();
  check(/와이밴드/.test(b1) && !/엑스가수/.test(b1), '4-A 로그인해도 화면은 Y', /엑스가수/.test(b1) ? '화면이 X 로 바뀜' : '');
  check(same(t.snapshot(), before), '4-A DB 의 X 그대로', `쓰기 ${t.db.writes.length}건`);

  await t.page.waitForTimeout(2000);
  await pickFirst(t.page);
  await t.page.waitForTimeout(2000);
  const after = t.snapshot();
  check(same(after, before), '4-B 다음 매치 + 2초 뒤에도 X 그대로', `artists=${artistOf(after[0])} tracks=${trackPrefixes(after[0])}`);
  check(after.every((r) => artistOf(r) !== 'arY' || trackPrefixes(r) === 'y'), '4-B 아티스트와 곡이 섞인 줄 없음');

  await t.page.reload({ waitUntil: 'domcontentloaded' });
  await t.page.waitForTimeout(4000);
  const b2 = await t.body();
  check(/와이밴드/.test(b2) && !/엑스가수/.test(b2), '4-C 새로 고침해도 이 탭의 판 Y');
  check(same(t.snapshot(), before), '4-C 새로 고침 뒤에도 X 그대로');

  // 임시저장하고 나가기 → 조용히 덮지 않고 묻는다
  await t.page.getByRole('button', { name: /뒤로|back/i }).first().click().catch(() => {});
  await t.page.waitForTimeout(800);
  const saveBtn = t.page.getByRole('button', { name: /임시저장/ }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await t.page.waitForTimeout(2000);
    const b3 = await t.body();
    check(/계정에 진행 중인 다른 소트가 있어요/.test(b3), '4-C 임시저장하면 바꿀지 묻는다');
    check(same(t.snapshot(), before), '4-C 묻는 동안 X 그대로');
    await t.page.getByRole('button', { name: '계속 소트하기' }).first().click().catch(() => {});
    await t.page.waitForTimeout(800);
    check(same(t.snapshot(), before), '4-C "계속 소트하기" 뒤에도 X 그대로');

    // 이 판(Y)을 버리고 나간다 — 계정의 다른 판(X)까지 지우면 안 된다.
    await t.page.getByRole('button', { name: /뒤로|back/i }).first().click().catch(() => {});
    await t.page.waitForTimeout(800);
    await t.page.getByRole('button', { name: '저장하지 않고 나가기' }).first().click();
    await t.page.waitForTimeout(2000);
    check(same(t.snapshot(), before), '4-C Y 를 버리고 나가도 계정의 X 는 남는다', `줄 ${t.snapshot().length}`);
  } else {
    check(false, '4-C 나가기 시트의 임시저장 버튼을 찾음');
  }
  await t.ctx.close();
});

console.log('\nUX-004 · 계정에 초안이 없을 때 게스트 판 Y 에 로그인');
await section(async () => {
  const t = await openTab({ seed: guestY() });
  await t.page.goto(`${BASE}/worldcup?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.waitForTimeout(3500);
  await t.login();
  check(/와이밴드/.test(await t.body()), '4-D 화면은 Y');
  await pickFirst(t.page);
  await t.page.waitForTimeout(2500);
  const row = t.snapshot()[0];
  check(!!row && artistOf(row) === 'arY' && trackPrefixes(row) === 'y' && row.status === 'playing',
    '4-D 계정에 붙은 줄은 온전한 Y', row ? `artists=${artistOf(row)} tracks=${trackPrefixes(row)} status=${row.status}` : '줄 없음');
  await t.ctx.close();
});

console.log('\nUX-004 · 같이 소트하기 중 로그인');
await section(async () => {
  const t = await openTab({ draft: draftX(), seed: { worldcup_tracks: JSON.stringify(YT), together_code: 'abcd' } });
  await t.page.goto(`${BASE}/worldcup?mode=single&challenge=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.waitForTimeout(3500);
  const before = t.snapshot();
  await t.login();
  await pickFirst(t.page);
  await t.page.waitForTimeout(2000);
  const b = await t.body();
  check(/와이밴드/.test(b) && !/엑스가수/.test(b), '4-E 화면은 링크의 곡 그대로');
  check(same(t.snapshot(), before) && t.db.writes.length === 0, '4-E 계정 초안에 쓰지 않는다', `쓰기 ${t.db.writes.length}건`);
  await t.ctx.close();
});

console.log('\n교차 · 로그인 상태, 이 탭에 판 없음, 계정 초안 X → /worldcup 직접');
await section(async () => {
  const t = await openTab({ loggedIn: true, draft: draftX() });
  await t.page.goto(`${BASE}/worldcup?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.waitForTimeout(4000);
  const b = await t.body();
  check(/엑스가수 3/.test(b) && /엑스가수 4/.test(b), '계정 초안 X 를 이어서 연다(2번째 매치)');
  await t.ctx.close();
});

/* ── UX-001 ─────────────────────────────────────────────── */
/*
 * 처음 보이는 아티스트 목록은 섞여 나온다. 이름을 박아 두지 않고 **처음 보이는 아티스트**를
 * 고른다(엑스가수가 아닌). 고른 이름은 탭마다 기억해 둔다.
 */
const openExplore = async (t) => {
  await t.page.goto(`${BASE}/explore?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.getByText('최애 아티스트를 선택해 주세요').waitFor({ timeout: 60_000 });
  await t.page.waitForTimeout(3000);
  const text = await t.body();
  const after = text.split('소트해볼 수 있어요.')[1] ?? '';
  t.artistName = after.split('\n').map((l) => l.trim()).find((l) => l && l !== X_ARTIST.name);
};
const chooseArtist = async (t) => {
  await t.page.getByText(t.artistName, { exact: true }).first().click({ timeout: 15_000 });
  await t.page.waitForTimeout(800);
};

console.log('\nUX-001 · 계정에 진행 중인 X, /explore 에 바로 들어와 다른 아티스트');
await section(async () => {
  const t = await openTab({ loggedIn: true, draft: draftX() });
  await openExplore(t);
  const before = t.snapshot();
  await chooseArtist(t);
  await t.page.waitForTimeout(1500);
  check(same(t.snapshot(), before), '1-A 다른 아티스트를 고르고 1초 넘게 기다려도 X 그대로');

  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2000);
  check(/진행 중인 월드컵이 있어요/.test(await t.body()), '1-B 넘어가려 하면 홈과 같은 시트');
  check(same(t.snapshot(), before), '1-B 시트가 떠 있는 동안 X 그대로');
  await t.page.getByRole('button', { name: '취소' }).last().click().catch(() => {});
  await t.page.waitForTimeout(800);
  check(same(t.snapshot(), before) && new URL(t.page.url()).pathname === '/explore', '1-B 취소하면 X 그대로, 이 화면에 남는다');

  await chooseArtist(t);
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2000);
  await t.page.getByRole('button', { name: '이어서 진행하기' }).click();
  await t.page.waitForTimeout(5000);
  const b = await t.body();
  check(new URL(t.page.url()).pathname === '/worldcup' && /엑스가수 3/.test(b), '1-C 이어서 진행하기 → X 의 그 매치로', new URL(t.page.url()).pathname);
  check(same(t.snapshot(), before), '1-C 진행 내역 그대로');
  await t.ctx.close();
});

console.log('\nUX-001 · "새로 시작" 을 고르면 그때 새 줄로 바꾼다');
await section(async () => {
  const t = await openTab({ loggedIn: true, draft: draftX() });
  await openExplore(t);
  await chooseArtist(t);
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2000);
  await t.page.getByRole('button', { name: '새로 시작' }).click();
  await t.page.waitForTimeout(2500);
  const row = t.snapshot()[0];
  const clean = row && row.status === 'artist_selection' && row.selected_artists?.[0]?.name === t.artistName
    && row.selected_tracks === null && row.progress === null && row.phase === null
    && row.current_round_name === null && row.current_match_index === null
    && Array.isArray(row.skipped_tracks) && row.skipped_tracks.length === 0 && row.saved_at === null;
  check(!!clean, '1-D 새 줄은 온전하다(이전 곡·진행·뺀 곡 없음)', row ? JSON.stringify({ s: row.status, a: artistOf(row), t: row.selected_tracks?.length ?? null, p: !!row.progress, r: row.current_round_name }) : '줄 없음');
  check(new URL(t.page.url()).pathname === '/tracks', '1-D 곡 고르기로 넘어간다', new URL(t.page.url()).pathname);
  const local = await t.page.evaluate(() => sessionStorage.getItem('worldcup_progress') || localStorage.getItem('worldcup_progress'));
  check(!local, '1-D 이 기기에 남은 이전 판 진행도 치운다');
  await t.ctx.close();
});

console.log('\nUX-001 · 초안이 없으면 예전 그대로');
await section(async () => {
  const t = await openTab({ loggedIn: true });
  await openExplore(t);
  await chooseArtist(t);
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2500);
  const row = t.snapshot()[0];
  check(!/진행 중인 월드컵이 있어요/.test(await t.body()), '1-E 시트 없이 넘어간다');
  check(row?.status === 'artist_selection' && row.selected_artists?.[0]?.name === t.artistName, '1-E 아티스트 고르기가 저장된다', `${row?.status} ${t.artistName}`);
  check(new URL(t.page.url()).pathname === '/tracks', '1-E 곡 고르기로 간다');
  await t.ctx.close();
});

console.log('\nUX-001 · 홈 "시작하기" 의 시트와 이어서 진행하기');
await section(async () => {
  const t = await openTab({ loggedIn: true, draft: draftX() });
  await t.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await t.page.waitForTimeout(4000);
  const before = t.snapshot();
  await t.page.getByRole('link', { name: '시작하기' }).first().click();
  await t.page.waitForTimeout(1500);
  check(/진행 중인 월드컵이 있어요/.test(await t.body()), '1-F 홈 시작하기는 시트를 띄운다');
  await t.page.getByRole('button', { name: '이어서 진행하기' }).last().click();
  await t.page.waitForTimeout(5000);
  check(new URL(t.page.url()).pathname === '/worldcup' && /엑스가수 3/.test(await t.body()), '1-F 이어서 진행하기 → X');
  check(same(t.snapshot(), before), '1-F X 그대로');
  await t.ctx.close();
});

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
