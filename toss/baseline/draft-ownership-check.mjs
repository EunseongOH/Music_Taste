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
 * (PostgREST 의 select·upsert·insert·조건 update·delete). **운영 스키마 계약을 그대로 지킨다**
 * (fixtures/tournament-drafts-schema.json): NOT NULL 칸에 null 이면 23502, INSERT 는 빠진 칸에
 * 기본값, 유니크 충돌은 NOT NULL 검사 뒤에 23505. 예전 목은 유니크만 흉내 내서 UX-009 를 놓쳤다. 로그인은 LoginModal 이 받는
 * 팝업 메시지(`AUTH_SUCCESS`)로 한다 — 페이지를 새로 읽지 않는 실제 로그인 경로다.
 * 세션 저장소는 탭마다 **처음 한 번만** 심는다(새로 고침 검사가 의미 있게).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tournament-drafts-schema.json'), 'utf8')).columns;
/** INSERT: 빠진 칸은 컬럼 기본값. */
const withDefaults = (row) => {
  const out = {};
  for (const [k, c] of Object.entries(SCHEMA)) {
    if (k in row) out[k] = row[k];
    else if (k === 'id') out[k] = `row-${Math.random().toString(36).slice(2)}`;
    else if (c.default === 'now()') out[k] = new Date().toISOString();
    else out[k] = JSON.parse(JSON.stringify(c.default));
  }
  return out;
};
/** NOT NULL 칸에 null 이 든 첫 칸. 없으면 null. */
const notNullViolation = (row) => Object.keys(SCHEMA).find((k) => !SCHEMA[k].nullable && k in row && row[k] === null) ?? null;

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
  const db = { rows: draft ? [withDefaults(draft)] : [], writes: [] };
  /**
   * failDraftWrites  다음 초안 쓰기 N 번을 네트워크 단계에서 끊는다
   * userGone         브라우저에는 로그인이 남았는데 서버는 사용자를 모른다(세션 만료 경합)
   */
  const state = { loggedIn, failDraftWrites: 0, userGone: false };
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
      if (!state.loggedIn || (state.userGone && url.pathname.endsWith('/user'))) return json({ message: 'no session' }, 401);
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
    if (state.failDraftWrites > 0) { state.failDraftWrites--; return route.abort('failed'); }
    db.writes.push({ method, url: url.search, body });
    const notNull = (col) => json({ code: '23502', message: `null value in column "${col}" of relation "tournament_drafts" violates not-null constraint` }, 400);
    if (method === 'DELETE') { db.rows = db.rows.filter((r) => !matches(r, params)); return json([]); }
    if (method === 'PATCH') {
      const hit = db.rows.filter((r) => matches(r, params));
      // 한 줄이라도 계약을 어기면 문장 전체가 실패한다.
      for (const r of hit) { const col = notNullViolation({ ...r, ...body }); if (col) return notNull(col); }
      hit.forEach((r) => Object.assign(r, body));
      return json(hit);
    }
    if (method === 'POST') {
      const upsert = url.searchParams.has('on_conflict');
      const out = [];
      for (const row of list) {
        const cur = db.rows.find((r) => r.user_id === row.user_id && r.is_single_artist === row.is_single_artist);
        // Postgres 순서 그대로: NOT NULL 이 먼저, 유니크는 그 뒤.
        const col = notNullViolation(cur && upsert ? { ...cur, ...row } : withDefaults(row));
        if (col) return notNull(col);
        if (cur && !upsert) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        if (cur) Object.assign(cur, row);
        else db.rows.push(withDefaults(row));
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
  return { ctx, page, db, state, snapshot, login, body };
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
/** 모든 칸(updated_at 포함)이 같은가. 확인 전에는 보호된 X 가 한 글자도 바뀌면 안 된다. */
const identical = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** 고르기 단계 줄이 온전한가(운영 계약의 기본값, 이전 판 흔적 없음). 틀린 칸을 돌려준다. */
const stageProblems = (row, status) => {
  if (!row) return ['줄 없음'];
  const want = {
    status, phase: 'loading', current_round_name: null, current_match_index: 0, bye_count: 0,
    progress: null, saved_at: null, skipped_tracks: [], tracks: [], matches: [], winners: [],
    eliminated_tracks: [], selected_byes: [],
    ...(status === 'artist_selection' ? { selected_tracks: [] } : {}),
  };
  return Object.entries(want).filter(([k, v]) => JSON.stringify(row[k]) !== JSON.stringify(v)).map(([k]) => `${k}=${JSON.stringify(row[k])}`);
};
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
  check(identical(t.snapshot(), before), '1-A 다른 아티스트를 고르고 1초 넘게 기다려도 X 그대로(updated_at 포함)');

  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2000);
  check(/진행 중인 월드컵이 있어요/.test(await t.body()), 'C 넘어가려 하면 홈과 같은 시트(conflict)');
  check(identical(t.snapshot(), before), 'I 시트가 떠 있는 동안 X 그대로(updated_at 포함)');
  check(!/임시저장에 실패했어요/.test(await t.body()), 'C 실패가 아니라 충돌로 받는다');
  await t.page.getByRole('button', { name: '취소' }).last().click().catch(() => {});
  await t.page.waitForTimeout(800);
  check(identical(t.snapshot(), before) && new URL(t.page.url()).pathname === '/explore', 'D 취소하면 X 그대로, 이 화면에 남는다');

  await chooseArtist(t);
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2000);
  await t.page.getByRole('button', { name: '이어서 진행하기' }).click();
  await t.page.waitForTimeout(5000);
  const b = await t.body();
  check(new URL(t.page.url()).pathname === '/worldcup' && /엑스가수 3/.test(b), 'E 이어서 진행하기 → X 의 그 매치로', new URL(t.page.url()).pathname);
  check(same(t.snapshot(), before), 'E 진행 내역 그대로');
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
  const problems = stageProblems(row, 'artist_selection');
  check(problems.length === 0 && row.selected_artists?.[0]?.name === t.artistName && t.snapshot().length === 1,
    'F 새로 시작 → 온전한 아티스트 단계 줄(X 의 곡·진행·뺀 곡 없음)', problems.join(', ') || t.artistName);
  check(new URL(t.page.url()).pathname === '/tracks', 'F 곡 고르기로 넘어간다', new URL(t.page.url()).pathname);
  const local = await t.page.evaluate(() => sessionStorage.getItem('worldcup_progress') || localStorage.getItem('worldcup_progress'));
  check(!local, 'F 이 기기에 남은 이전 판 진행도 치운다');
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
  check(!/진행 중인 월드컵이 있어요/.test(await t.body()), 'A 시트 없이 넘어간다');
  const problems = stageProblems(row, 'artist_selection');
  check(problems.length === 0 && row.selected_artists?.[0]?.name === t.artistName,
    'A 초안이 없는 계정 → 아티스트 단계 줄이 새로 생긴다(계약대로)', problems.join(', ') || t.artistName);
  check(new URL(t.page.url()).pathname === '/tracks', 'A 곡 고르기로 간다');
  await t.ctx.close();
});

const BOL4 = { id: '4k5fFEYgkWYrYvtOK3zVBl', name: 'BOL4', image: '' };
console.log('\nUX-009 · 아티스트 단계 줄에서 곡을 고르면 같은 줄이 곡 단계가 된다');
await section(async () => {
  const artistRow = {
    user_id: USER_ID, is_single_artist: true, status: 'artist_selection', title: 'BOL4 외 월드컵 초안',
    selected_artists: [BOL4], updated_at: new Date().toISOString(),
  };
  const t = await openTab({ loggedIn: true, draft: artistRow, seed: { selectedArtists: JSON.stringify([BOL4]), worldcup_is_single_artist: 'true' } });
  await t.page.goto(`${BASE}/tracks?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  // 곡이 다 붙으면 곡 고르기 자동저장이 돈다.
  let row;
  for (let i = 0; i < 30; i++) {
    await t.page.waitForTimeout(1000);
    row = t.snapshot()[0];
    if (row?.status === 'track_selection') break;
  }
  const problems = stageProblems(row, 'track_selection');
  const tracks = row?.selected_tracks ?? [];
  check(t.snapshot().length === 1 && problems.length === 0 && tracks.length > 0 && artistOf(row) === BOL4.id,
    'B 같은 줄이 track_selection 으로(고른 곡이 담기고 월드컵 칸은 비어 있다)',
    problems.join(', ') || `곡 ${tracks.length}개`);
  await t.ctx.close();
});

console.log('\nUX-001 · 저장이 실패하면 넘어가지 않는다 (네트워크)');
await section(async () => {
  const t = await openTab({ loggedIn: true });
  await openExplore(t);
  await chooseArtist(t);
  t.state.failDraftWrites = 1;
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2500);
  const b = await t.body();
  check(new URL(t.page.url()).pathname === '/explore', 'G 네트워크 실패 → 다음 화면으로 가지 않는다', new URL(t.page.url()).pathname);
  check(/임시저장에 실패했어요/.test(b), 'G 실패를 알린다(원문 오류 없이)');
  check(!/23502|TypeError|Failed to fetch|PostgREST/.test(b), 'G 원문 오류를 보여 주지 않는다');
  check(b.includes(`${t.artistName}의 곡을 소트해볼까요?`), 'G 고른 아티스트가 그대로(다시 누를 수 있다)');
  check(t.snapshot().length === 0, 'G 줄이 생기지 않는다');

  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2500);
  const row = t.snapshot()[0];
  check(new URL(t.page.url()).pathname === '/tracks', 'H 다시 누르면 저장되고 넘어간다', new URL(t.page.url()).pathname);
  check(t.snapshot().length === 1 && row?.selected_artists?.[0]?.name === t.artistName, 'H 줄은 하나(중복 없음)');
  await t.ctx.close();
});

console.log('\nUX-001 · 화면은 로그인인데 서버는 사용자를 모른다 (세션 만료 경합)');
await section(async () => {
  const t = await openTab({ loggedIn: true, draft: draftX() });
  await openExplore(t);
  const before = t.snapshot();
  await chooseArtist(t);
  t.state.userGone = true;
  await t.page.getByRole('button', { name: '곡 고르러 가기' }).click();
  await t.page.waitForTimeout(2500);
  check(new URL(t.page.url()).pathname === '/explore', 'no-user → 다음 화면으로 가지 않는다', new URL(t.page.url()).pathname);
  check(/로그인 세션이 만료되었어요/.test(await t.body()), 'no-user → 로그인이 필요하다고 알린다');
  check(identical(t.snapshot(), before), 'no-user → X 그대로');
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
