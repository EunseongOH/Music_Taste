/**
 * 같이 소트하기 DB 경계 검사 — 실제 권한으로 두드려 본다.
 *
 *   node --env-file=.env.local toss/baseline/together-db-security-check.mjs
 *
 * "프론트가 안 읽는다" 는 보안 경계가 아니다. 그래서 프론트를 거치지 않고 PostgREST 에
 * anon 키로 직접 묻는다.
 *
 * 쓰기 검사는 **실패해야 통과**다. 응답 코드만 보고 넘기지 않는다 — 통로가 열려 있으면
 * 정말로 써 버리므로, 매번 service_role 로 실제 값을 되읽어 확인한다. 쓰기 대상은 이
 * 검사가 직접 만든 방으로만 하고, 끝나면 지운다. 운영 행은 건드리지 않는다.
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

const rest = (path, { key = ANON, method = 'GET', body, prefer } = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const uuid = () => crypto.randomUUID();

/* service_role 로 실제 값을 되읽는다. */
const nicknameOf = async (key) => {
  const r = await rest(`sort_challenge_entries?select=nickname&participant_key=eq.${key}`, { key: SERVICE });
  return (await r.json())[0]?.nickname ?? null;
};
const countIn = async (challengeId) => {
  const r = await rest(`sort_challenge_entries?select=id&challenge_id=eq.${challengeId}`, { key: SERVICE });
  return (await r.json()).length;
};

/*
 * "남의 계정" 역할. `user_id` 에 auth.users FK 가 걸려 있어 실재하는 계정이어야 한다.
 * **읽기만** 한다 — 그 계정을 고치지 않고, 검사가 만든 방의 행에 uuid 만 빌린다.
 */
const VICTIM = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1`, {
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
})
  .then((r) => r.json())
  .then((j) => j?.users?.[0]?.id);
if (!VICTIM) {
  console.log('  [!] 계정을 하나도 못 읽었다. 남의 계정 기록을 흉내 낼 수 없다.');
  process.exit(2);
}

/* 준비: 이 검사만의 방 둘 */
const STAMP = Date.now().toString(36).slice(-5);
const makeRoom = async (code, title) => {
  const r = await rest('sort_challenges', {
    key: SERVICE, method: 'POST', prefer: 'return=representation',
    body: { code, title, tracks: [] },
  });
  if (!r.ok) {
    console.log(`  [!] 검사용 방을 만들지 못했다: ${r.status} ${await r.text()}`);
    process.exit(2);
  }
  return (await r.json())[0];
};
const room = await makeRoom(`sec${STAMP}`, '권한 검사용');
/* 위조 INSERT 전용 **빈 방**. 같은 방이면 (방, 계정) 고유 색인에 먼저 걸려, 권한이
   열려 있어도 막힌 것처럼 보인다. 막힌 이유를 헷갈리지 않게 자리를 비워 둔다. */
const room2 = await makeRoom(`sec${STAMP}b`, '권한 검사용2');

/* 보호 대상 세 종류. */
const KEY_LEGACY = `seccheck_legacy_${uuid()}`;   // 증명 없음 + 주인 없음 -> 읽기 전용
const KEY_OWNED = `seccheck_owned_${uuid()}`;     // 증명 없음 + 주인 있음 -> 그 계정만
const KEY_SECURE = `seccheck_secure_${uuid()}`;   // 증명 있음

const cleanup = async () => {
  for (const id of [room?.id, room2?.id].filter(Boolean)) {
    await rest(`sort_challenge_entries?challenge_id=eq.${id}`, { key: SERVICE, method: 'DELETE' });
    await rest(`sort_challenges?id=eq.${id}`, { key: SERVICE, method: 'DELETE' });
  }
};

// PostgREST 는 한 번에 넣는 객체들의 키가 모두 같아야 한다. 빈 자리는 null 로 채운다.
const seed = await rest('sort_challenge_entries', {
  key: SERVICE, method: 'POST', prefer: 'return=representation',
  body: [
    { challenge_id: room.id, participant_key: KEY_LEGACY, nickname: '옛익명', ranking: [{ id: 'a' }], user_id: null, claim_token_hash: null },
    { challenge_id: room.id, participant_key: KEY_OWNED, nickname: '주인있음', ranking: [{ id: 'a' }], user_id: VICTIM, claim_token_hash: null },
    { challenge_id: room.id, participant_key: KEY_SECURE, nickname: '증명있음', ranking: [{ id: 'a' }], user_id: null, claim_token_hash: 'not-a-real-hash' },
  ],
});
if (!seed.ok) {
  console.log(`  [!] 검사용 기록을 심지 못했다: ${seed.status} ${await seed.text()}`);
  await cleanup();
  process.exit(2);
}

try {
  console.log('\n민감 컬럼은 anon 이 읽을 수 없다');
  for (const col of ['user_id', 'claim_token_hash']) {
    const r = await rest(`sort_challenge_entries?select=${col}&limit=1`);
    check(!r.ok, `select=${col} 거부`, `HTTP ${r.status}`);
  }
  {
    const r = await rest('sort_challenge_entries?select=*&limit=1');
    check(!r.ok, 'select=* 거부', `HTTP ${r.status}`);
  }

  console.log('\n참가자 화면에 필요한 컬럼은 그대로 읽힌다');
  {
    const cols = 'id,challenge_id,participant_key,nickname,ranking,skipped_count,imported,created_at';
    const r = await rest(`sort_challenge_entries?select=${cols}&challenge_id=eq.${room.id}`);
    const rows = r.ok ? await r.json() : [];
    check(r.ok && rows.length === 3, 'fetchEntries 와 같은 select 통과', `HTTP ${r.status} · ${rows.length}건`);
  }

  console.log('\n기본 테이블 직접 쓰기는 닫혀 있다');
  {
    const r = await rest('sort_challenge_entries', {
      method: 'POST', prefer: 'return=representation',
      body: { challenge_id: room2.id, participant_key: `seccheck_forged_${uuid()}`, nickname: '위조', ranking: [], user_id: VICTIM, claim_token_hash: null },
    });
    const made = await countIn(room2.id);
    check(!r.ok && made === 0, '남의 user_id 를 달고 INSERT 거부', `HTTP ${r.status} · 방에 ${made}건`);
  }
  {
    const r = await rest(`sort_challenge_entries?participant_key=eq.${KEY_LEGACY}`, {
      method: 'PATCH', prefer: 'return=representation', body: { nickname: '직접덮어씀' },
    });
    const now = await nicknameOf(KEY_LEGACY);
    check(now === '옛익명', '주인 없는 옛 기록 UPDATE 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }
  {
    const r = await rest(`sort_challenge_entries?participant_key=eq.${KEY_OWNED}`, {
      method: 'PATCH', prefer: 'return=representation', body: { nickname: '직접덮어씀' },
    });
    const now = await nicknameOf(KEY_OWNED);
    check(now === '주인있음', '남의 계정 기록 UPDATE 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }
  {
    const r = await rest(`sort_challenge_entries?participant_key=eq.${KEY_SECURE}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    const left = await nicknameOf(KEY_SECURE);
    check(left === '증명있음', 'DELETE 거부', `HTTP ${r.status} · 지금 "${left}"`);
  }

  console.log('\n증명 없는 기록은 save RPC 로도 못 고친다');
  const saveRpc = (key, token, nickname = '가져감') =>
    rest('rpc/save_sort_challenge_entry', {
      method: 'POST',
      body: {
        p_challenge_id: room.id, p_participant_key: key, p_claim_token: token,
        p_nickname: nickname, p_ranking: [{ id: 'z' }], p_skipped_count: 0, p_imported: false,
      },
    });
  {
    const r = await saveRpc(KEY_LEGACY, `wrong-secret-${uuid()}`);
    const now = await nicknameOf(KEY_LEGACY);
    check(!r.ok && now === '옛익명', '주인 없는 옛 기록 — 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }
  {
    const r = await saveRpc(KEY_OWNED, `wrong-secret-${uuid()}`);
    const now = await nicknameOf(KEY_OWNED);
    check(!r.ok && now === '주인있음', '남의 계정 기록 — 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }
  {
    const r = await saveRpc(KEY_SECURE, `wrong-secret-${uuid()}`);
    const now = await nicknameOf(KEY_SECURE);
    check(!r.ok && now === '증명있음', '증명이 틀림 — 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }

  console.log('\n옛 기록은 그대로 남아 있다 (읽기 전용, 지우지 않는다)');
  {
    const n = await countIn(room.id);
    check(n === 3, '심은 세 건 그대로', `${n}건`);
  }

  console.log('\n익명 참여는 여전히 된다 (같이 소트하기의 전제)');
  const NEW_KEY = `seccheck_new_${uuid()}`;
  const NEW_SECRET = `secret-${uuid()}`;
  {
    const r = await saveRpc(NEW_KEY, NEW_SECRET, '새참가자');
    check(r.ok, '처음 저장 통과', `HTTP ${r.status}`);
  }
  {
    const r = await saveRpc(NEW_KEY, NEW_SECRET, '이름바꿈');
    const now = await nicknameOf(NEW_KEY);
    check(r.ok && now === '이름바꿈', '같은 증명으로 자기 기록 고치기 통과', `HTTP ${r.status} · 지금 "${now}"`);
  }
  {
    const r = await saveRpc(NEW_KEY, `other-${uuid()}`, '남이덮어씀');
    const now = await nicknameOf(NEW_KEY);
    check(!r.ok && now === '이름바꿈', '남이 그 기록을 고치려 하면 거부', `HTTP ${r.status} · 지금 "${now}"`);
  }

  console.log('\n옛 클라이언트(v1)가 그대로 동작한다');
  const rowOf = async (pk) => {
    const r = await rest(`sort_challenge_entries?select=ranking,skipped_count,skipped_track_ids&participant_key=eq.${pk}`, { key: SERVICE });
    return (await r.json())[0];
  };
  const saveV1 = (key, token, body = {}) =>
    rest('rpc/save_sort_challenge_entry', { method: 'POST', body: {
      p_challenge_id: room.id, p_participant_key: key, p_claim_token: token,
      p_nickname: '옛클라', p_ranking: [{ id: 'A' }], p_skipped_count: 3, p_imported: false, ...body } });
  const saveV2 = (key, token, skipped, body = {}) =>
    rest('rpc/save_sort_challenge_entry_v2', { method: 'POST', body: {
      p_challenge_id: room.id, p_participant_key: key, p_claim_token: token,
      p_nickname: '새클라', p_ranking: [{ id: 'A' }, { id: 'B' }],
      p_skipped_track_ids: skipped, p_imported: false, ...body } });
  {
    const k = `seccheck_v1_${uuid()}`;
    const r = await saveV1(k, `s-${uuid()}`);
    const row = await rowOf(k);
    check(r.ok, 'v1 호출이 계속 된다', `HTTP ${r.status}`);
    check(row?.skipped_count === 3, 'v1 이 보낸 개수는 보존', String(row?.skipped_count));
    check(JSON.stringify(row?.skipped_track_ids) === '[]', 'v1 저장은 목록을 [] 로 둔다', JSON.stringify(row?.skipped_track_ids));
  }

  console.log('\nv2 가 어떤 곡을 몰랐는지 저장한다');
  const K2 = `seccheck_v2_${uuid()}`;
  const S2 = `s-${uuid()}`;
  {
    const r = await saveV2(K2, S2, ['D', 'E']);
    const row = await rowOf(K2);
    check(r.ok, 'v2 저장 성공', `HTTP ${r.status}`);
    check(JSON.stringify(row?.skipped_track_ids) === '["D","E"]', '곡 목록이 그대로', JSON.stringify(row?.skipped_track_ids));
    check(row?.skipped_count === 2, '개수는 서버가 목록에서 센다', String(row?.skipped_count));
  }
  {
    // 다시 소트하면 지난 판의 목록이 남으면 안 된다.
    await saveV2(K2, S2, ['C']);
    const row = await rowOf(K2);
    check(JSON.stringify(row?.skipped_track_ids) === '["C"]', '재소트하면 새 목록만', JSON.stringify(row?.skipped_track_ids));
    check(row?.skipped_count === 1, '개수도 따라온다', String(row?.skipped_count));
  }
  {
    // 옛 클라이언트가 그 행을 다시 쓰면 목록을 비운다 — 남기면 새 순위에 붙어 거짓이 된다.
    await saveV1(K2, S2);
    const row = await rowOf(K2);
    check(JSON.stringify(row?.skipped_track_ids) === '[]', 'v1 이 덮어쓰면 목록을 비운다', JSON.stringify(row?.skipped_track_ids));
  }
  {
    const r = await saveV2(`seccheck_bad_${uuid()}`, `s-${uuid()}`, { nope: 1 });
    check(!r.ok, '배열이 아닌 목록은 거부', `HTTP ${r.status}`);
  }

  console.log('\n민감 컬럼 경계는 새 컬럼이 생겨도 그대로');
  {
    const r = await rest(`sort_challenge_entries?select=skipped_track_ids&challenge_id=eq.${room.id}`);
    check(r.ok, 'skipped_track_ids 는 읽힌다', `HTTP ${r.status}`);
  }

  console.log('\n합쳐진 기록이 모르는 곡을 들고 있을 수 있다');
  {
    /*
     * `claim_sort_challenge_entry` 자체는 여기서 못 부른다 — `auth.uid()` 로 도는
     * 함수라 anon 키로는 로그인한 사람이 될 수 없다. 흉내만 내는 검사는 함수를
     * 지켜 주지 못하므로 **그런 척하지 않는다.**
     *
     * 여기서 지키는 것은 그 아래 경계다: 합쳐진 뒤의 행이 세 값을 모두 들고 있을 수
     * 있는지(컬럼이 살아 있고 읽히는지). claim 함수가 그 값을 옮기는지는 마이그레이션
     * 본문과 SQL 확인에 있고, 자동 검사 범위 밖이라고 보고에 적는다.
     */
    const merged = `seccheck_merged_${uuid()}`;
    await rest('sort_challenge_entries', {
      key: SERVICE, method: 'POST', prefer: 'return=representation',
      body: { challenge_id: room2.id, participant_key: merged, nickname: '합쳐진기록',
              ranking: [{ id: 'A' }, { id: 'B' }], skipped_count: 2, skipped_track_ids: ['D', 'E'],
              user_id: VICTIM, claim_token_hash: `hash-${uuid()}` },
    });
    const row = await rowOf(merged);
    check(row?.skipped_count === 2 && JSON.stringify(row?.skipped_track_ids) === '["D","E"]',
      '계정 기록이 순위·개수·모르는 곡을 함께 들고 있다',
      `${row?.skipped_count} · ${JSON.stringify(row?.skipped_track_ids)}`);

    const pub = await rest(`sort_challenge_entries?select=skipped_track_ids&participant_key=eq.${merged}`);
    const got = pub.ok ? await pub.json() : [];
    check(pub.ok && JSON.stringify(got[0]?.skipped_track_ids) === '["D","E"]',
      '참가자 화면에서도 그 목록이 읽힌다', JSON.stringify(got[0]?.skipped_track_ids));
  }

  console.log('\n적힌 권한과 실제 권한이 같다');
  {
    /*
     * 응답 코드로 미루어 짐작하지 않고 DB 에 직접 묻는다. PUBLIC EXECUTE 는 함수를
     * 만들 때 기본으로 붙는데, 지금 당장 더 할 수 있는 일이 없어도 **적힌 것과 실제가
     * 달라진다** — 나중에 역할을 하나 더 만들면 아무도 의도하지 않은 채 열린다.
     */
    const want = {
      save_sort_challenge_entry:  { public: false, anon: true,  authenticated: true },
      // v2 도 v1 과 같다 — 익명 참여가 같이 소트하기의 전제다.
      save_sort_challenge_entry_v2: { public: false, anon: true,  authenticated: true },
      // 저장 규칙의 속. 클라이언트는 어떤 역할로도 못 부른다.
      _save_sort_challenge_entry: { public: false, anon: false, authenticated: false },
      claim_sort_challenge_entry: { public: false, anon: false, authenticated: true },
      my_sort_challenge_entry:    { public: false, anon: false, authenticated: true },
      my_sort_challenge_rooms:    { public: false, anon: false, authenticated: true },
      together_hash:              { public: false, anon: false, authenticated: false },
    };
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/together_privileges_probe`, {
      method: 'POST',
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) {
      console.log(`  [!] 권한을 직접 묻지 못했다(HTTP ${r.status}). 이 항목은 건너뛴다.`);
    } else {
      const rows = await r.json();
      for (const [fn, exp] of Object.entries(want)) {
        const got = rows.find((x) => x.proname === fn);
        const ok = got && got.public_exec === exp.public
          && got.anon_exec === exp.anon && got.auth_exec === exp.authenticated;
        check(Boolean(ok), `${fn}`,
          got ? `public ${got.public_exec} · anon ${got.anon_exec} · auth ${got.auth_exec}` : '함수를 못 찾음');
      }
    }
  }

  console.log('\n계정 전용 RPC 는 anon 에게 닫혀 있다');
  for (const fn of ['my_sort_challenge_rooms', 'my_sort_challenge_entry', 'claim_sort_challenge_entry']) {
    const r = await rest(`rpc/${fn}`, { method: 'POST', body: {} });
    check([401, 403, 404].includes(r.status), `${fn} 거부`, `HTTP ${r.status}`);
  }
  {
    const r = await rest('rpc/together_hash', { method: 'POST', body: { p_token: 'x' } });
    check(!r.ok, 'together_hash 는 클라이언트가 못 부른다', `HTTP ${r.status}`);
  }
} finally {
  await cleanup();
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
