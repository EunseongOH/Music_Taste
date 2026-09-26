/**
 * 새로 저장하면 지난 판의 취향표 연결은 끊긴다 — 실제 DB 에 대고 확인한다.
 *
 *   node --env-file=.env.local toss/baseline/together-link-reset-check.mjs
 *
 * `linked_taste_result_id` 는 "같이 소트한 방의 이 참여가 남긴 개인 취향표" 다. 다시
 * 소트하면 그 연결은 지난 판의 것이므로 무효다. **값이 달라졌는지로 판단하지 않는다** —
 * 순위가 우연히 같을 수 있고, 모르는 곡만 달라질 수 있고, 둘 다 같을 수도 있다.
 * 경계는 save RPC 호출 그 자체다.
 *
 * 그래서 함수 본문을 읽어 보는 검사로는 부족하다. 실제로 저장해 보고 되읽는다.
 * `auth.uid()` 가 필요한 경로(claim, link)가 있으므로 **이 검사만의 계정을 만들고
 * 끝나면 지운다.** 운영 계정과 운영 행은 건드리지 않는다.
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, v] of [
  ['NEXT_PUBLIC_SUPABASE_URL', URL_BASE],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
]) {
  if (!v) {
    console.log(`  [!] ${name} 없음 — .env.local 을 주고 다시 돌린다(--env-file=.env.local)`);
    process.exit(2);
  }
  console.log(`  ${name} ok`);
}

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const uuid = () => crypto.randomUUID();
const STAMP = Date.now().toString(36).slice(-6);

/* apikey 와 authorization 을 따로 둔다 — 사용자 토큰으로 부를 때 apikey 는 anon 이다. */
const rest = (path, { token = ANON, apikey = ANON, method = 'GET', body, prefer } = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const svc = (path, opts = {}) => rest(path, { ...opts, token: SERVICE, apikey: SERVICE });

const rpc = async (name, args, { token = ANON, apikey = ANON } = {}) => {
  const r = await rest(`rpc/${name}`, { token, apikey, method: 'POST', body: args });
  const text = await r.text();
  let value = null;
  try { value = JSON.parse(text); } catch { value = text; }
  return { ok: r.ok, status: r.status, value, text };
};

const auth = (path, { token = SERVICE, method = 'POST', body } = {}) =>
  fetch(`${URL_BASE}/auth/v1/${path}`, {
    method,
    headers: { apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* ---------------------------------------------------------------- 준비 */

const EMAIL = `sortify-linkcheck-${STAMP}@example.com`;
const PASSWORD = `Lc-${uuid()}`;

let USER = null;
let TOKEN = null;
const rooms = [];
const results = [];

const cleanup = async () => {
  for (const id of rooms) {
    await svc(`sort_challenge_entries?challenge_id=eq.${id}`, { method: 'DELETE' });
    await svc(`sort_challenges?id=eq.${id}`, { method: 'DELETE' });
  }
  for (const id of results) await svc(`tournament_results?id=eq.${id}`, { method: 'DELETE' });
  if (USER) await auth(`admin/users/${USER}`, { method: 'DELETE' });
};

const bail = async (msg) => {
  console.log(`  [!] ${msg}`);
  await cleanup();
  process.exit(2);
};

{
  const made = await auth('admin/users', {
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  if (!made.ok) await bail(`검사용 계정을 만들지 못했다: ${made.status} ${await made.text()}`);
  USER = (await made.json())?.id;
  if (!USER) await bail('검사용 계정 id 를 못 받았다');

  const signed = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!signed.ok) await bail(`검사용 계정으로 로그인하지 못했다: ${signed.status} ${await signed.text()}`);
  TOKEN = (await signed.json())?.access_token;
  if (!TOKEN) await bail('access_token 을 못 받았다 — auth.uid() 경로를 검사할 수 없다');
  console.log(`  검사용 계정 준비 ok (끝나면 지운다)`);
}

const asUser = { token: TOKEN, apikey: ANON };

const makeRoom = async (suffix) => {
  const r = await svc('sort_challenges', {
    method: 'POST', prefer: 'return=representation',
    body: { code: `lnk${STAMP}${suffix}`, title: '연결 초기화 검사용', tracks: [] },
  });
  if (!r.ok) await bail(`검사용 방을 만들지 못했다: ${r.status} ${await r.text()}`);
  const row = (await r.json())[0];
  rooms.push(row.id);
  return row;
};

const makeResult = async (label) => {
  const r = await svc('tournament_results', {
    method: 'POST', prefer: 'return=representation',
    body: {
      user_id: USER, title: `연결 검사 ${label}`, winner_track_id: `t-${label}`,
      winner_track_title: `곡 ${label}`, winner_track_artist: '검사용', winner_track_image: '',
      total_candidates: 4, ranking: [], is_public: false,
    },
  });
  if (!r.ok) await bail(`검사용 취향표를 만들지 못했다: ${r.status} ${await r.text()}`);
  const row = (await r.json())[0];
  results.push(row.id);
  return row.id;
};

/* service_role 로 실제 저장된 값을 되읽는다. 응답 코드만 믿지 않는다. */
const entryOf = async (pk) => {
  const r = await svc(
    `sort_challenge_entries?select=id,ranking,skipped_count,skipped_track_ids,linked_taste_result_id,user_id&participant_key=eq.${pk}`
  );
  return (await r.json())[0] ?? null;
};

const RANK_A = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
const RANK_B = [{ id: 'C' }, { id: 'B' }, { id: 'A' }];

const saveV2 = (challengeId, pk, tokenText, ranking, skipped, ctx = asUser) =>
  rpc('save_sort_challenge_entry_v2', {
    p_challenge_id: challengeId, p_participant_key: pk, p_claim_token: tokenText,
    p_nickname: '검사', p_ranking: ranking, p_skipped_track_ids: skipped, p_imported: false,
  }, ctx);

const saveV1 = (challengeId, pk, tokenText, ranking, skippedCount, ctx = asUser) =>
  rpc('save_sort_challenge_entry', {
    p_challenge_id: challengeId, p_participant_key: pk, p_claim_token: tokenText,
    p_nickname: '검사', p_ranking: ranking, p_skipped_count: skippedCount, p_imported: false,
  }, ctx);

const link = (challengeId, resultId) =>
  rpc('link_sort_challenge_taste_result', { p_challenge_id: challengeId, p_result_id: resultId }, asUser);

try {
  const roomMain = await makeRoom('a');
  const roomClaim = await makeRoom('b');
  const R1 = await makeResult('R1');
  const R2 = await makeResult('R2');

  const PK = `linkchk_auth_${uuid()}`;
  const TOK = `tok-${uuid()}`;

  console.log('\n연결이 실제로 붙는다 (여기서 붙지 않으면 나머지 검사는 의미가 없다)');
  {
    const saved = await saveV2(roomMain.id, PK, TOK, RANK_A, []);
    if (!saved.ok) await bail(`v2 저장이 실패했다: ${saved.status} ${saved.text}`);
    const linked = await link(roomMain.id, R1);
    check(linked.ok && linked.value !== null, 'link RPC 가 참여를 찾는다', `HTTP ${linked.status}`);
    const e = await entryOf(PK);
    check(e?.linked_taste_result_id === R1, '연결이 저장된다', String(e?.linked_taste_result_id));
    check(e?.user_id === USER, '참여가 이 계정 것이다');
  }

  console.log('\nCase A — 순위가 달라진 다시 소트');
  {
    await saveV2(roomMain.id, PK, TOK, RANK_B, []);
    const e = await entryOf(PK);
    check(e?.linked_taste_result_id === null, '연결이 끊긴다', String(e?.linked_taste_result_id));
    check(JSON.stringify(e?.ranking) === JSON.stringify(RANK_B), '새 순위는 저장된다');
  }

  console.log('\nCase B — 순위가 똑같은 다시 소트 (핵심)');
  {
    await link(roomMain.id, R1);
    check((await entryOf(PK))?.linked_taste_result_id === R1, '먼저 연결을 붙여 둔다');
    /*
     * 방아쇠가 `ranking is distinct from` 으로 보던 시절에 여기서 연결이 남았다.
     * 새 판인데 순위가 우연히 같을 수 있다 — 저장 호출 자체가 새 판의 경계다.
     */
    await saveV2(roomMain.id, PK, TOK, RANK_B, []);
    check((await entryOf(PK))?.linked_taste_result_id === null,
      '값이 하나도 안 바뀌어도 연결은 끊긴다', String((await entryOf(PK))?.linked_taste_result_id));
  }

  console.log('\nCase C — 순위는 같고 모르는 곡만 달라진다');
  {
    await link(roomMain.id, R1);
    await saveV2(roomMain.id, PK, TOK, RANK_B, ['X']);
    const e = await entryOf(PK);
    check(e?.linked_taste_result_id === null, '연결이 끊긴다', String(e?.linked_taste_result_id));
    check(e?.skipped_count === 1, '모르는 곡 개수는 서버가 센다', String(e?.skipped_count));
  }

  console.log('\nCase D — 순위도 모르는 곡도 똑같다');
  {
    await link(roomMain.id, R1);
    await saveV2(roomMain.id, PK, TOK, RANK_B, ['X']);
    check((await entryOf(PK))?.linked_taste_result_id === null,
      '저장 호출 자체가 새 판이다', String((await entryOf(PK))?.linked_taste_result_id));
  }

  console.log('\nCase F — 연결만 새로 적을 때는 지우지 않는다');
  {
    const r = await link(roomMain.id, R2);
    check(r.ok, 'link RPC 성공', `HTTP ${r.status}`);
    const e = await entryOf(PK);
    check(e?.linked_taste_result_id === R2, '새 연결이 그대로 남는다', String(e?.linked_taste_result_id));
    check(JSON.stringify(e?.ranking) === JSON.stringify(RANK_B), 'link 은 순위를 건드리지 않는다');
  }

  console.log('\nCase E — 게스트 판을 계정에 합칠 때');
  {
    const PK_ACC = `linkchk_acc_${uuid()}`;
    const PK_GUEST = `linkchk_guest_${uuid()}`;
    const TOK_ACC = `tok-${uuid()}`;
    const TOK_GUEST = `tok-${uuid()}`;

    await saveV2(roomClaim.id, PK_ACC, TOK_ACC, RANK_A, []);
    await link(roomClaim.id, R1);
    check((await entryOf(PK_ACC))?.linked_taste_result_id === R1, '계정 행에 지난 판의 연결이 있다');

    // 게스트로 남긴 다른 판. anon 으로 부른다 — user_id 없이 들어간다.
    const g = await saveV2(roomClaim.id, PK_GUEST, TOK_GUEST, RANK_B, ['Y'], { token: ANON, apikey: ANON });
    check(g.ok, '게스트 저장 성공', `HTTP ${g.status}`);

    const claimed = await rpc('claim_sort_challenge_entry', {
      p_challenge_id: roomClaim.id, p_participant_key: PK_GUEST, p_claim_token: TOK_GUEST,
    }, asUser);
    check(claimed.ok && claimed.value !== null, 'claim 이 계정 행으로 합친다', `HTTP ${claimed.status}`);

    const acc = await entryOf(PK_ACC);
    check(acc?.linked_taste_result_id === null,
      '계정의 옛 연결이 게스트 판에 붙지 않는다', String(acc?.linked_taste_result_id));
    check(JSON.stringify(acc?.ranking) === JSON.stringify(RANK_B), '게스트 판의 순위가 옮겨진다');
    check(JSON.stringify(acc?.skipped_track_ids) === JSON.stringify(['Y']), '모르는 곡도 함께 옮겨진다');
    check((await entryOf(PK_GUEST)) === null, '게스트 행은 사라진다');
  }

  console.log('\n옛 main 호환 — v1 시그니처가 그대로 돌고, v1 저장도 연결을 끊는다');
  {
    await link(roomMain.id, R1);
    check((await entryOf(PK))?.linked_taste_result_id === R1, '연결을 붙여 둔다');

    const v1 = await saveV1(roomMain.id, PK, TOK, RANK_A, 2);
    check(v1.ok, 'v1(7인자) 이 그대로 불린다', `HTTP ${v1.status}`);
    const e = await entryOf(PK);
    check(e?.skipped_count === 2, 'v1 의 skipped_count 가 저장된다', String(e?.skipped_count));
    check(JSON.stringify(e?.skipped_track_ids) === '[]', 'v1 은 모르는 곡 목록을 비운다');
    check(e?.linked_taste_result_id === null, 'v1 저장도 연결을 끊는다', String(e?.linked_taste_result_id));

    // 게스트(anon) v1 저장도 열려 있어야 한다 — 로그인 없는 참여가 운영 중이다.
    const PK_ANON = `linkchk_v1anon_${uuid()}`;
    const anonV1 = await saveV1(roomMain.id, PK_ANON, `tok-${uuid()}`, RANK_A, 0, { token: ANON, apikey: ANON });
    check(anonV1.ok, 'anon 도 v1 으로 저장할 수 있다', `HTTP ${anonV1.status}`);
    check((await entryOf(PK_ANON))?.linked_taste_result_id === null, '새 참여는 연결 없이 시작한다');
  }
} finally {
  await cleanup();
  console.log('\n  검사용 방·취향표·계정 정리 완료');
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
