/**
 * 같이 소트하기 — 참여 신원이 로그인으로 흔들리지 않는지 검사한다.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/together-identity-check.mjs
 *
 * 예전에는 `participantKey(userId)` 가 로그인하면 계정 uuid 를 돌려줬다. 그래서
 * 익명으로 소트한 뒤 로그인하면 자기 기록을 못 찾아 "아직 소트하지 않았어요" 가 떴고,
 * 저장 effect 가 새 키로 한 번 더 돌아 참가자가 한 명 늘었다.
 *
 * 운영 DB 에는 쓰지 않는다 — Supabase 조회를 가로채 지어낸 방으로 답하고,
 * 쓰기(RPC·insert)는 기록만 하고 막는다.
 */
import { chromium } from 'playwright';
import { nextBase } from './base.mjs';

const BASE = nextBase();
/** 로그인 흉내. supabase-js 는 세션을 네트워크가 아니라 localStorage 에서 읽는다. */
const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace('https://', '').replace('.supabase.co', '') || 'kgpwbxkaudeuoybdicqn';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER_ID_TMP = '11111111-2222-4333-8444-555555555555';
/** 서명은 로컬에서 검증하지 않는다. 읽을 수만 있으면 된다. */
const JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: USER_ID_TMP, role: 'authenticated', aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
  user_metadata: { nickname: '나', nickname_confirmed: true },
})}.sig`;
const CHALLENGE_ID = '00000000-0000-4000-8000-0000000000aa';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const TRACKS = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i + 1}`, title: `곡 ${i + 1}`, artistName: '카더가든', albumImage: '',
}));
const IDS = TRACKS.map((t) => t.id);

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const room = {
  id: CHALLENGE_ID, code: 'idcheck', creator_id: null, creator_nickname: '지민',
  artist_name: '카더가든', artist_id: null, artist_image: '', title: '카더가든',
  tracks: TRACKS, source_result_id: null, created_at: '2026-09-24T00:00:00.000Z',
};
/** 익명으로 남긴 내 기록. participant_key 는 이 기기의 값으로 채워 넣는다. */
const myEntry = (deviceKey) => ({
  id: 'e-mine', challenge_id: CHALLENGE_ID, participant_key: deviceKey, nickname: '나',
  ranking: IDS, skipped_count: 0, imported: false, created_at: '2026-09-24T01:00:00.000Z',
});
const friend = {
  id: 'e-friend', challenge_id: CHALLENGE_ID, participant_key: 'anon_friend', nickname: '지민',
  ranking: [...IDS].reverse(), skipped_count: 0, imported: false, created_at: '2026-09-24T02:00:00.000Z',
};

const browser = await chromium.launch();
console.log(`대상 ${BASE}\n`);

/**
 * 결과 화면을 연다.
 *  - `loggedIn` 이면 Supabase 세션이 있는 것처럼 auth 응답을 돌려준다.
 *  - 쓰기 요청은 실행하지 않고 세어만 둔다(운영 DB 보호 + 중복 저장 검증).
 */
async function open({ loggedIn }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  /*
   * 로그인 흉내는 **쿠키**로 한다. 이 앱은 @supabase/ssr 의 createBrowserClient 를 쓰는데,
   * 그건 세션을 localStorage 가 아니라 쿠키에 둔다(여기서 한 번 틀렸다).
   */
  if (loggedIn) {
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
  }
  const page = await ctx.newPage();
  const writes = [];

  await page.addInitScript(() => {
    localStorage.setItem('together_participant', 'anon_device_fixed');
    localStorage.setItem('together_claim_secret', 'secret-device');
    sessionStorage.setItem('locale', 'ko');
  });

  await page.route((u) => u.href.includes('.supabase.co/'), async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/auth/v1/')) {
      return json(
        loggedIn
          ? { user: { id: USER_ID, user_metadata: { nickname: '나', nickname_confirmed: true } } }
          : { user: null }
      );
    }
    if (method !== 'GET') {
      writes.push({ url: url.split('/rest/v1/')[1] ?? url, body: req.postData() });
      // RPC 는 uuid 를 돌려주는 자리다. 실제로 쓰지는 않는다.
      return json(url.includes('/rpc/') ? 'e-mine' : []);
    }
    if (url.includes('/sort_challenges')) {
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return json(single ? room : [room]);
    }
    if (url.includes('/sort_challenge_entries')) return json([myEntry('anon_device_fixed'), friend]);
    return json([]);
  });

  await page.goto(`${BASE}/together/idcheck/result`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(4500);
  return { ctx, page, writes };
}

/* ── CASE 1·2: 익명으로 남긴 결과가 로그인 전후로 같아야 한다 ── */
for (const loggedIn of [false, true]) {
  const label = loggedIn ? '로그인 상태' : '비로그인';
  const { ctx, page, writes } = await open({ loggedIn });
  const body = await page.locator('body').innerText();

  check(!/아직 소트하지 않았어요/.test(body), `${label} — "아직 소트하지 않았어요" 안 뜸`);
  check(/우리의 취향 관계도/.test(body), `${label} — 결과 화면이 보임`);
  check(/내 소트 결과/.test(body), `${label} — 내 순위가 보임`);

  // 관계도에 내 노드가 하나뿐이어야 한다(로그인으로 참가자가 늘면 안 된다).
  const nodes = await page.getByRole('radio').count().catch(() => 0);
  /*
   * 공유 이미지 카드가 화면 **밖**(-9999px)에 같은 관계도를 한 벌 더 그린다.
   * 그건 저장용이라 세지 않는다 — `:visible` 로는 걸러지지 않는다(크기가 있다).
   */
  const me = await page.evaluate(() => {
    const card = document.getElementById("together-share-card");
    return [...document.querySelectorAll('button[aria-label="나"]')].filter(
      (el) => !card || !card.contains(el)
    ).length;
  });
  check(me === 1, `${label} — 관계도의 내 노드 1개`, `찾은 수 ${me}`);
  console.log(`      (참가자 노드 ${nodes}개)`);

  // 저장 요청은 fixture 순위가 세션에 없으므로 일어나지 않아야 한다.
  const saves = writes.filter((w) => (w.url || '').includes('save_sort_challenge_entry'));
  check(saves.length === 0, `${label} — 불필요한 저장 없음`, `${saves.length}건`);

  if (loggedIn) {
    // 계정 소유권 확인은 RPC 로만 묻는다(목록에 user_id 를 싣지 않는다).
    const owned = writes.filter((w) => (w.url || '').includes('my_sort_challenge_entry'));
    check(owned.length >= 1, '로그인 상태 — 소유권을 RPC 로 확인함', `${owned.length}건`);
  }
  await ctx.close();
  console.log('');
}

/* ── 목록 조회에 계정 열이 실리지 않는지 ── */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const selects = [];
  await page.addInitScript(() => {
    localStorage.setItem('together_participant', 'anon_device_fixed');
    sessionStorage.setItem('locale', 'ko');
  });
  await page.route((u) => u.href.includes('.supabase.co/'), async (route) => {
    const url = route.request().url();
    if (url.includes('/sort_challenge_entries')) selects.push(decodeURIComponent(url));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/auth/v1/')) return json({ user: null });
    if (url.includes('/sort_challenges')) {
      const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return json(single ? room : [room]);
    }
    if (url.includes('/sort_challenge_entries')) return json([myEntry('anon_device_fixed'), friend]);
    return json([]);
  });
  await page.goto(`${BASE}/together/idcheck`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(4000);
  const listQueries = selects.filter((u) => u.includes('select='));
  check(listQueries.length > 0, '참가자 목록을 골라서 받음', `${listQueries.length}건`);
  check(
    listQueries.every((u) => !/select=[^&]*user_id/.test(u) && !/claim_token_hash/.test(u)),
    '목록에 user_id·claim_token_hash 를 싣지 않음'
  );
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
