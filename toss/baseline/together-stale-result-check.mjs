/**
 * 같이 소트하기 — 결과 화면이 **이 방에서 방금 끝낸 판만** 저장하는지 검사한다 (UX-002·UX-003).
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/together-stale-result-check.mjs
 *
 * 예전 결과 화면은 세션에 남은 `worldcup_ranking` 을 곡이 겹치는지만 보고 저장했다.
 *   - 방 A 를 끝낸 뒤 소트한 적 없는 방 B 결과를 열면 방 A 순위가 방 B 에 내 기록으로 섰다
 *   - 로그아웃한 같은 기기에서 열면 유령 익명 참여자가 생겼다
 *   - 16곡 이상 방은 결과를 열 때마다 개인 취향표가 한 장씩 늘었다
 *
 * 운영 DB 에는 쓰지 않는다 — Supabase 를 가로채 지어낸 방으로 답하고, 쓰기는 세어만 둔다.
 * 취향표 insert 는 **id 기준 PK 를 흉내 낸다**(같은 id 면 409·23505). 새로 고침 도중
 * 다시 넣어도 한 장만 남는지 보려면 필요하다.
 *
 * 세션 저장소는 **처음 한 번만** 심는다(새로 고침마다 다시 심으면 새로 고침 검사가 무의미하다).
 * 옛 코드에서도 같은 판정을 하려고, 쪽지와 함께 예전 코드가 읽던 `worldcup_ranking` 도 심는다.
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

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const tracks = (prefix, n, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + from}`, title: `곡 ${prefix}${i + from}`, artistName: '볼빨간사춘기', albumImage: '' }));
const room = (id, code, list) => ({
  id, code, creator_id: null, creator_nickname: '지민', artist_name: '볼빨간사춘기', artist_id: 'ar1',
  artist_image: '', title: '볼빨간사춘기', tracks: list, source_result_id: null, created_at: '2026-09-26T00:00:00.000Z',
});
const A_TRACKS = tracks('t', 8);
const ROOMS = {
  rooma: room('00000000-0000-4000-8000-00000000000a', 'rooma', A_TRACKS),
  // 방 B 세 가지 — 곡이 전혀 안 겹침 / 일부 겹침 / 곡 세트가 같음. 셋 다 쓰면 안 된다.
  bdisj: room('00000000-0000-4000-8000-0000000000b1', 'bdisj', tracks('u', 13)),
  bpart: room('00000000-0000-4000-8000-0000000000b2', 'bpart', [...tracks('t', 5), ...tracks('u', 8, 6)]),
  bsame: room('00000000-0000-4000-8000-0000000000b3', 'bsame', A_TRACKS),
  roomc: room('00000000-0000-4000-8000-00000000000c', 'roomc', tracks('c', 18)),
};
const friend = (challengeId, list) => ({
  id: `e-friend-${challengeId.slice(-2)}`, challenge_id: challengeId, participant_key: 'anon_friend', nickname: '지민',
  ranking: list.map((t) => t.id).reverse(), skipped_count: 0, imported: false, created_at: '2026-09-26T01:00:00.000Z',
});

/** 방금 끝낸 판의 쪽지(새 코드) + 예전 코드가 읽던 순위. */
const completionSeed = ({ roomKey, ownerUserId = null, runId = 'run-1', tasteResultId }) => {
  const r = ROOMS[roomKey];
  const ranking = r.tracks.map((t) => t.id);
  return {
    together_completion_v1: JSON.stringify({
      challengeId: r.id, code: r.code, runId, ranking, skipped: 0, ownerUserId,
      completedAt: '2026-09-26T01:12:00.000Z', entrySaved: false, tasteDone: false,
      tasteResultId: tasteResultId ?? `aaaaaaaa-0000-4000-8000-${runId.replace(/\W/g, '').padStart(12, '0').slice(-12)}`,
    }),
    worldcup_ranking: JSON.stringify(r.tracks),
    worldcup_skipped_count: '0',
  };
};
const soloSeed = () => ({ worldcup_ranking: JSON.stringify(A_TRACKS), worldcup_skipped_count: '0' });

const browser = await chromium.launch();
console.log(`대상 ${BASE}\n`);

/**
 * 한 탭(=한 sessionStorage)을 연다. 쓰기는 세고, 취향표 insert 는 id PK 를 흉내 낸다.
 * `tasteDelayMs` 를 주면 첫 insert 를 그만큼 붙잡는다(응답 전에 새로 고침하는 경우).
 */
async function openTab({ loggedIn, seed, tasteDelayMs = 0, linkFails = false }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const state = { loggedIn };
  const setLoggedIn = async (v) => {
    state.loggedIn = v;
    if (!v) return ctx.clearCookies();
    const session = {
      access_token: JWT, refresh_token: 'r', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'x@example.com',
              app_metadata: {}, user_metadata: { nickname: '나', nickname_confirmed: true },
              created_at: '2026-01-01T00:00:00Z' },
    };
    await ctx.addCookies([{
      name: `sb-${PROJECT_REF}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`,
      url: BASE,
    }]);
  };
  await setLoggedIn(loggedIn);

  const page = await ctx.newPage();
  const w = { entrySaves: [], tasteInserts: 0, tasteIds: new Set(), links: [] };

  await page.addInitScript((seedJson) => {
    localStorage.setItem('together_participant', 'anon_device_fixed');
    localStorage.setItem('together_claim_secret', 'secret-device');
    sessionStorage.setItem('locale', 'ko');
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(JSON.parse(seedJson))) sessionStorage.setItem(k, v);
    }
  }, JSON.stringify(seed));

  await page.route((u) => u.href.includes('.supabase.co/'), async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/auth/v1/')) {
      return json(state.loggedIn
        ? { id: USER_ID, aud: 'authenticated', role: 'authenticated', user_metadata: { nickname: '나', nickname_confirmed: true } }
        : { user: null }, state.loggedIn ? 200 : 401);
    }
    if (url.includes('/rpc/save_sort_challenge_entry')) {
      w.entrySaves.push(JSON.parse(req.postData() || '{}'));
      return json('e-mine');
    }
    /*
     * 취향표를 이어 붙이는 RPC. 실제 함수는 **이 방에 내 참여가 있고 그 취향표가 내
     * 것일 때만** 참여 id 를 돌려주고, 아니면 null 이다. 여기서도 그렇게 둔다 —
     * 아무 rpc 나 null 로 답하던 예전 mock 은 "이었다" 와 "못 이었다" 를 구분하지 못해,
     * 화면이 연결 실패를 알아차리는지 검사할 수 없었다.
     */
    if (url.includes('/rpc/link_sort_challenge_taste_result')) {
      const body = JSON.parse(req.postData() || '{}');
      w.links.push(body);
      if (linkFails) return json(null);
      const mine = w.entrySaves.some((x) => x.p_challenge_id === body.p_challenge_id);
      return json(mine ? 'e-mine' : null);
    }
    if (url.includes('/rpc/')) return json(null);
    if (url.includes('/tournament_results') && method === 'POST') {
      w.tasteInserts++;
      const row = JSON.parse(req.postData() || '{}');
      const id = row.id ?? `server-${w.tasteInserts}`;
      const dup = w.tasteIds.has(id);
      w.tasteIds.add(id); // 서버에 닿은 순간 저장된 것으로 친다
      if (tasteDelayMs && w.tasteInserts === 1) await new Promise((r) => setTimeout(r, tasteDelayMs));
      if (dup) return json({ code: '23505', message: 'duplicate key value violates unique constraint "tournament_results_pkey"' }, 409);
      return json({ id });
    }
    if (method !== 'GET') return json([]);
    if (url.includes('/sort_challenges')) {
      const code = decodeURIComponent(url).match(/code=eq\.([^&]+)/)?.[1];
      const r = ROOMS[code] ?? null;
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return json(single ? r : r ? [r] : []);
    }
    if (url.includes('/sort_challenge_entries')) {
      const cid = decodeURIComponent(url).match(/challenge_id=eq\.([^&]+)/)?.[1];
      const r = Object.values(ROOMS).find((x) => x.id === cid);
      // 저장 요청이 들어온 방이면 내 기록도 목록에 싣는다(실제 DB 처럼).
      const mine = [...w.entrySaves].reverse().find((s) => s.p_challenge_id === cid);
      const rows = r ? [friend(r.id, r.tracks)] : [];
      if (mine) rows.push({
        id: 'e-mine', challenge_id: cid, participant_key: 'anon_device_fixed', nickname: '나',
        ranking: mine.p_ranking, skipped_count: mine.p_skipped_count, imported: false, created_at: '2026-09-26T02:00:00.000Z',
      });
      return json(rows);
    }
    return json([]);
  });

  const settle = () => page.waitForTimeout(3500);
  const open = async (code) => {
    await page.goto(`${BASE}/together/${code}/result`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await settle();
  };
  const reload = async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await settle(); };
  return { ctx, page, w, open, reload, settle, setLoggedIn };
}

/* ── room A stale → room B 결과(곡 안 겹침 / 일부 / 전부 같음) ─────────── */
console.log('방 A 를 끝낸 뒤 소트하지 않은 방 B 결과를 연다');
for (const loggedIn of [true, false]) {
  for (const b of ['bdisj', 'bpart', 'bsame']) {
    const t = await openTab({ loggedIn, seed: completionSeed({ roomKey: 'rooma', ownerUserId: loggedIn ? USER_ID : null }) });
    await t.open(b);
    check(t.w.entrySaves.length === 0 && t.w.tasteInserts === 0,
      `${loggedIn ? '로그인' : '게스트'} · ${b} — 방 B 에 쓰기 0건`, `참여 ${t.w.entrySaves.length} · 취향표 ${t.w.tasteInserts}`);
    await t.ctx.close();
  }
}

console.log('\n혼자 소트한 순위만 남아 있다');
{
  const t = await openTab({ loggedIn: true, seed: soloSeed() });
  await t.open('bsame');
  check(t.w.entrySaves.length === 0 && t.w.tasteInserts === 0, '혼자 소트 순위로 방 B 에 쓰기 0건',
    `참여 ${t.w.entrySaves.length} · 취향표 ${t.w.tasteInserts}`);
  await t.ctx.close();
}

console.log('\n로그인해 끝낸 판을 로그아웃한 같은 기기에서 연다 (유령 참여자)');
{
  // 계정이 끝낸 방 B 의 판. 쪽지는 남아 있다(로그아웃은 이것을 지우지 않는다).
  const t = await openTab({ loggedIn: false, seed: completionSeed({ roomKey: 'bsame', ownerUserId: USER_ID }) });
  await t.open('bsame');
  check(t.w.entrySaves.length === 0, '게스트로 열면 새 익명 참여자 0건', `참여 ${t.w.entrySaves.length}`);
  // 끝낸 계정이 돌아오면 그때 저장한다.
  await t.setLoggedIn(true);
  await t.reload();
  check(t.w.entrySaves.length === 1, '끝낸 계정으로 돌아오면 그때 한 번 저장', `참여 ${t.w.entrySaves.length}`);
  await t.ctx.close();
}

/* ── 16곡 이상 방: 한 판에 취향표 1장 ─────────────────────────────── */
console.log('\n18곡 방을 끝내고 결과를 연다 → 새로 고침 3회 → 초대 화면 갔다가 뒤로');
{
  const t = await openTab({ loggedIn: true, seed: completionSeed({ roomKey: 'roomc', ownerUserId: USER_ID }) });
  await t.open('roomc');
  check(t.w.entrySaves.length === 1, '처음 열 때 참여 기록 저장 1회', `${t.w.entrySaves.length}`);
  check(t.w.tasteIds.size === 1, '처음 열 때 취향표 1장', `${t.w.tasteIds.size}`);
  const saved = t.w.entrySaves[0];
  check(saved?.p_challenge_id === ROOMS.roomc.id && saved?.p_ranking?.length === 18, '이 방의 순위 18곡이 이 방에 간다');
  for (let i = 0; i < 3; i++) await t.reload();
  check(t.w.entrySaves.length === 1, '새로 고침 3회 — 참여 저장이 더 나가지 않는다', `${t.w.entrySaves.length}`);
  check(t.w.tasteIds.size === 1 && t.w.tasteInserts === 1, '새로 고침 3회 — 취향표 1장', `장 ${t.w.tasteIds.size} · 요청 ${t.w.tasteInserts}`);
  check(t.w.links.length === 1 && t.w.links[0]?.p_result_id, '취향표를 방에 잇는다 — 한 번만',
    `연결 ${t.w.links.length}`);
  await t.page.goto(`${BASE}/together/roomc`, { waitUntil: 'domcontentloaded' });
  await t.settle();
  await t.page.goBack({ waitUntil: 'domcontentloaded' });
  await t.settle();
  await t.page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await t.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await t.settle();
  check(t.w.tasteIds.size === 1 && t.w.entrySaves.length === 1, '뒤로·앞으로 — 취향표 1장, 참여 저장 1회',
    `장 ${t.w.tasteIds.size} · 참여 ${t.w.entrySaves.length}`);

  // 같은 방을 다시 소트하면 새 판이다 — 새 결과를 남겨야 한다.
  await t.page.evaluate((s) => { for (const [k, v] of Object.entries(JSON.parse(s))) sessionStorage.setItem(k, v); },
    JSON.stringify(completionSeed({ roomKey: 'roomc', ownerUserId: USER_ID, runId: 'run-2' })));
  await t.reload();
  check(t.w.entrySaves.length === 2 && t.w.tasteIds.size === 2, '같은 방 새 판 — 참여 저장·취향표가 하나씩 더',
    `참여 ${t.w.entrySaves.length} · 장 ${t.w.tasteIds.size}`);
  await t.ctx.close();
}

console.log('\n취향표는 남았는데 잇지 못했다 — 다음에 다시 잇는다');
{
  /*
   * 연결까지 끝나야 이 단계가 끝난 것이다. 취향표만 남고 연결이 실패한 상태로
   * 끝난 것으로 적어 버리면, 완료 목록에 같은 활동이 두 줄로 남고 고칠 길이 없다.
   *
   * 다시 시도해도 취향표는 **한 장**이어야 한다 — 같은 id 로 넣고 PK(23505)가 막는다.
   */
  const t = await openTab({ loggedIn: true, seed: completionSeed({ roomKey: 'roomc', ownerUserId: USER_ID, runId: 'run-link' }), linkFails: true });
  await t.open('roomc');
  check(t.w.links.length === 1, '한 번 이어 보고', `연결 ${t.w.links.length}`);
  await t.reload();
  check(t.w.links.length >= 2, '실패했으니 다시 이어 본다', `연결 ${t.w.links.length}`);
  check(t.w.tasteIds.size === 1, '그래도 취향표는 한 장', `장 ${t.w.tasteIds.size} · 요청 ${t.w.tasteInserts}`);
  const ids = t.w.links.map((x) => x.p_result_id);
  check(new Set(ids).size === 1, '같은 취향표 id 로 다시 시도한다', ids.join(' '));
  await t.ctx.close();
}

console.log('\n취향표 저장 응답을 받기 전에 새로 고침한다');
{
  const t = await openTab({ loggedIn: true, seed: completionSeed({ roomKey: 'roomc', ownerUserId: USER_ID }), tasteDelayMs: 4000 });
  await t.page.goto(`${BASE}/together/roomc/result`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  // 첫 insert 가 서버에 닿았지만 응답이 오기 전.
  await t.page.waitForTimeout(1500);
  await t.reload();
  await t.page.waitForTimeout(3000);
  check(t.w.tasteIds.size === 1, '서버에 남은 취향표 1장', `장 ${t.w.tasteIds.size} · 요청 ${t.w.tasteInserts}`);
  await t.ctx.close();
}

console.log('\n게스트로 끝내고 결과 화면에서 로그인한다');
{
  const t = await openTab({ loggedIn: false, seed: completionSeed({ roomKey: 'roomc', ownerUserId: null }) });
  await t.open('roomc');
  check(t.w.entrySaves.length === 1, '게스트 참여 기록 1회 저장', `${t.w.entrySaves.length}`);
  await t.setLoggedIn(true);
  await t.reload();
  await t.reload();
  check(t.w.entrySaves.length === 1, '로그인해도 참여 기록을 새로 만들지 않는다', `${t.w.entrySaves.length}`);
  check(t.w.tasteInserts === 0, '로그인으로 취향표가 새로 생기지 않는다(처음 처리할 때 게스트였다)', `${t.w.tasteInserts}`);
  await t.ctx.close();
}

console.log('\n방금 끝낸 8곡 방 (정상 흐름)');
{
  const t = await openTab({ loggedIn: false, seed: completionSeed({ roomKey: 'rooma', ownerUserId: null }) });
  await t.open('rooma');
  const s = t.w.entrySaves[0];
  check(t.w.entrySaves.length === 1 && s?.p_challenge_id === ROOMS.rooma.id && s?.p_ranking?.length === 8,
    '이 방의 순위가 이 방에 저장된다', `${t.w.entrySaves.length}건`);
  check(t.w.tasteInserts === 0, '16곡 미만은 취향표를 남기지 않는다', `${t.w.tasteInserts}`);
  const body = await t.page.locator('body').innerText();
  check(/내 소트 결과/.test(body), '결과 화면에 내 순위가 보인다');
  await t.ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
