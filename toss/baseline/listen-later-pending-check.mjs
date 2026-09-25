/**
 * 들어볼 곡 — 확정한 뜻이 사라지지 않는지 검사한다.
 *
 *   node --experimental-strip-types toss/baseline/listen-later-pending-check.mjs
 *
 * 서버도 비밀값도 필요 없다. `src/utils/listenLater.ts` 를 그대로 불러 쓰고,
 * 계정과 DB 쓰기만 갈아 끼운다(`FlushDeps`). 브라우저가 없으면 storage 래퍼가
 * 메모리로 떨어지므로 저장소도 진짜 코드 그대로다.
 *
 * 보는 것은 "그렇게 적혀 있나" 가 아니라 **실제로 어떻게 움직이나** 다 —
 * 큐에 뭐가 남았고, DB 에 몇 줄이 갔고, 실패하면 무엇이 살아남는가.
 */
import {
  flushPendingListenLater,
  getPendingListenLater,
  rememberPendingListenLater,
  removeFlushedPending,
} from '../../src/utils/listenLater.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/** 판마다 큐를 비운다. 공개 API 로만 비운다 — 검사용 뒷문을 만들지 않는다. */
const reset = () => { for (const t of getPendingListenLater()) removeFlushedPending(t.ownerUserId, [t.trackId]); };
const ids = () => getPendingListenLater().map((t) => t.trackId);

const track = (id, extra = {}) => ({
  id,
  title: `곡 ${id}`,
  artistName: '카더가든',
  albumTitle: '앨범',
  albumImage: `img-${id}`,
  albumId: 'al1',
  ...extra,
});

/** 가짜 DB. 들어온 줄을 UNIQUE(user_id, track_id) 처럼 다룬다. */
function fakeDb() {
  const rows = new Map();
  let calls = 0;
  let fail = null;
  return {
    get rows() { return [...rows.values()]; },
    get calls() { return calls; },
    failNext(err) { fail = err; },
    deps() {
      return {
        upsert: async (uid, list) => {
          calls++;
          if (fail) { const e = fail; fail = null; return { error: e }; }
          for (const t of list) rows.set(`${uid}|${t.trackId}`, { uid, ...t });
          return { error: null };
        },
      };
    },
  };
}

/* ── 1·3. 확정하면 남는다 / 같은 곡은 한 번만 ────────────── */
console.log('\n확정한 곡이 이 기기에 남는다');
{
  reset();
  rememberPendingListenLater(track('A'), null);
  check(ids().join(',') === 'A', '게스트가 확정해도 남는다', ids().join(',') || '(없음)');

  const first = getPendingListenLater()[0];
  check(first.title === '곡 A' && first.artistName === '카더가든' && first.albumImage === 'img-A',
    'DB 에 넣을 만큼은 다 담긴다', Object.keys(first).join(','));

  rememberPendingListenLater(track('A'), null);
  rememberPendingListenLater(track('A'), null);
  check(ids().join(',') === 'A', '같은 곡을 또 빼도 하나', `${ids().length}건`);
}

console.log('\n미발매곡 판별은 기존 규칙 그대로');
{
  reset();
  rememberPendingListenLater(track('U', { albumId: 'al_unreleased_U' }), null);
  check(getPendingListenLater()[0].isUnreleased === true, '가상 앨범 id 면 미발매');
  reset();
  rememberPendingListenLater(track('R'), null);
  check(getPendingListenLater()[0].isUnreleased === false, '보통 앨범이면 아니다');
}

/* ── 2. 되돌리면 아무것도 남지 않는다 ──────────────────── */
console.log('\n되돌리면 아무것도 남지 않는다');
{
  reset();
  /*
   * 화면은 3초가 지난 뒤에야 `rememberPendingListenLater` 를 부른다. 되돌리면 그
   * 타이머가 취소되므로 **애초에 불리지 않는다.** 여기서는 그 계약을 지킨다 —
   * 부르지 않으면 큐에 아무것도 없어야 한다.
   */
  check(ids().length === 0, '확정 전에는 큐가 비어 있다', `${ids().length}건`);
  const db = fakeDb();
  const r = await flushPendingListenLater('u1', db.deps());
  check(r.status === 'empty' && db.rows.length === 0, '옮길 것도 없다', r.status);
}

/* ── 4. 로그인하면 정확히 한 번 옮겨진다 ───────────────── */
console.log('\n로그인하면 옮겨지고, 옮겨진 것만 지워진다');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('A'), null);
  rememberPendingListenLater(track('B'), null);
  const r = await flushPendingListenLater('u1', db.deps());
  check(r.status === 'flushed' && r.count === 2, '두 곡이 옮겨졌다', JSON.stringify(r));
  check(db.rows.length === 2, 'DB 에 두 줄', `${db.rows.length}줄`);
  check(ids().length === 0, '옮긴 뒤 큐가 비었다', ids().join(','));
}

/* ── 8. 같은 로그인에서 여러 번 불려도 안전하다 ────────── */
console.log('\n로그인 한 번에 여러 번 불려도 중복이 없다');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('A'), null);
  // AuthProvider 는 한 번 로그인에 user 를 여러 번 갱신한다.
  const rs = await Promise.all([
    flushPendingListenLater('u1', db.deps()),
    flushPendingListenLater('u1', db.deps()),
    flushPendingListenLater('u1', db.deps()),
  ]);
  check(db.rows.length === 1, 'DB 는 한 줄', `${db.rows.length}줄`);
  check(db.calls === 1, '쓰기도 한 번만 나간다', `${db.calls}회`);
  check(ids().length === 0, '큐가 비었다', ids().join(','));
  check(rs.every((r) => r.status === 'flushed'), '셋 다 같은 결과를 받는다', rs.map((r) => r.status).join(','));

  // 이미 있는 곡을 또 옮겨도 늘지 않는다(UNIQUE 가 받아 준다).
  rememberPendingListenLater(track('A'), null);
  await flushPendingListenLater('u1', db.deps());
  check(db.rows.length === 1, '같은 곡을 다시 옮겨도 한 줄', `${db.rows.length}줄`);
}

/* ── 5·6. 실패하면 남고, 다시 하면 옮겨진다 ────────────── */
console.log('\n실패하면 뜻이 남고, 다음에 다시 옮긴다');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('A'), null);
  rememberPendingListenLater(track('B'), null);
  db.failNext({ message: 'network down' });
  const bad = await flushPendingListenLater('u1', db.deps());
  check(bad.status === 'failed', '실패로 끝난다', bad.status);
  check(db.rows.length === 0, 'DB 에는 아무것도 안 갔다', `${db.rows.length}줄`);
  check(ids().join(',') === 'A,B', '큐가 그대로 남는다', ids().join(','));

  const good = await flushPendingListenLater('u1', db.deps());
  check(good.status === 'flushed' && db.rows.length === 2, '다시 하면 옮겨진다', `${db.rows.length}줄`);
  check(ids().length === 0, '그때 비워진다', ids().join(','));
}

console.log('\n계정이 없으면 그대로 기다린다');
{
  reset();
  rememberPendingListenLater(track('A'), null);
  const r = await flushPendingListenLater(null, { upsert: async () => { throw new Error('부르면 안 된다'); } });
  check(r.status === 'no-user', '계정이 없다고만 말한다', r.status);
  check(ids().join(',') === 'A', '뜻은 남는다', ids().join(','));
}

/* ── 7. 옮기는 도중에 들어온 곡을 잃지 않는다 ──────────── */
console.log('\n옮기는 도중에 새로 확정한 곡을 잃지 않는다');
{
  reset();
  const rows = new Map();
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const deps = {
    upsert: async (uid, list) => {
      calls++;
      // 첫 번째 쓰기는 붙잡아 둔다 — 그 사이에 C 가 들어온다.
      if (calls === 1) await gate;
      for (const t of list) rows.set(t.trackId, t);
      return { error: null };
    },
  };

  rememberPendingListenLater(track('A'), null);
  rememberPendingListenLater(track('B'), null);
  const flushing = flushPendingListenLater('u1', deps);

  // 쓰기가 끝나기 전에 새 곡을 확정한다.
  await new Promise((r) => setTimeout(r, 10));
  rememberPendingListenLater(track('C'), 'u1');
  check(ids().includes('C'), '쓰는 동안에도 새 곡이 큐에 들어간다', ids().join(','));

  release();
  await flushing;

  check([...rows.keys()].sort().join(',') === 'A,B,C', '셋 다 결국 DB 로 간다', [...rows.keys()].sort().join(','));
  check(ids().length === 0, '다 옮긴 뒤에야 큐가 빈다', ids().join(','));
}

console.log('\n옮기는 도중에 들어온 곡은 사진에서 빠진다');
{
  reset();
  const rows = new Map();
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const deps = {
    upsert: async (uid, list) => {
      calls++;
      if (calls === 1) {
        await gate;
        // 첫 쓰기는 실패시킨다. 그 사이 들어온 C 까지 같이 지워지면 안 된다.
        return { error: { message: 'boom' } };
      }
      for (const t of list) rows.set(t.trackId, t);
      return { error: null };
    },
  };
  rememberPendingListenLater(track('A'), null);
  const flushing = flushPendingListenLater('u1', deps);
  await new Promise((r) => setTimeout(r, 10));
  rememberPendingListenLater(track('C'), 'u1');
  release();
  await flushing;
  check(ids().sort().join(',') === 'A,C', '실패했으니 A 도 C 도 남는다', ids().sort().join(','));
}

/* ── 9·10. 다른 뜻과 섞이지 않는다 ─────────────────────── */
console.log('\n취향표 저장 뜻과는 별개다');
{
  reset();
  rememberPendingListenLater(track('A'), null);
  /*
   * 로그인 창을 닫거나 게스트로 계속하면 화면은 `taste_pending_auth_action` 만
   * 지운다(ResultScreen). 그건 이 큐와 다른 열쇠이고 다른 저장소다 —
   * 여기서는 그 열쇠를 지워도 이쪽이 멀쩡한지 본다.
   */
  const { safeSessionStorage, safeLocalStorage } = await import('../../src/utils/storage.ts');
  safeSessionStorage.setItem('taste_pending_auth_action', 'save-to-space');
  safeSessionStorage.removeItem('taste_pending_auth_action');
  check(ids().join(',') === 'A', '취향표 뜻을 지워도 들어볼 곡은 남는다', ids().join(','));
  check(safeLocalStorage.getItem('pending_listen_later_v1') !== null, '저장소도 다르다(local vs session)');
}

console.log('\n손상된 저장소를 만나도 터지지 않는다');
{
  const { safeLocalStorage } = await import('../../src/utils/storage.ts');
  safeLocalStorage.setItem('pending_listen_later_v1', '{ 이건 JSON 이 아니다');
  check(getPendingListenLater().length === 0, '읽지 못하면 빈 목록', `${getPendingListenLater().length}건`);
  safeLocalStorage.setItem('pending_listen_later_v1', JSON.stringify([{ trackId: 'A', title: '곡 A' }, null, { nope: 1 }]));
  check(ids().join(',') === 'A', '망가진 줄만 버리고 나머지는 지킨다', ids().join(','));
  reset();
}

/* ── 계정 경계 ─────────────────────────────────────────── */
/*
 * 한 기기를 여러 계정이 쓴다. 뜻은 확정한 계정의 것이고, 다른 계정으로는 절대 가지 않는다.
 * 가짜 DB 는 줄마다 어느 계정으로 쓰였는지(uid) 남기므로 "누구에게 갔나" 를 그대로 본다.
 */
const owners = () => getPendingListenLater().map((t) => `${t.ownerUserId ?? 'guest'}:${t.trackId}`).sort().join(',');
const dbRows = (db) => db.rows.map((r) => `${r.uid}:${r.trackId}`).sort().join(',');

console.log('\n로그인 상태에서 확정한 뜻은 그 계정 것이다 (A·B·C·D)');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('X'), 'A');
  check(owners() === 'A:X', 'A 로 확정하면 주인이 A', owners());

  db.failNext({ message: 'network down' });
  const bad = await flushPendingListenLater('A', db.deps());
  check(bad.status === 'failed' && owners() === 'A:X', 'A 쓰기가 실패해도 남고 주인은 A 그대로', `${bad.status} ${owners()}`);

  // A 로그아웃 → 같은 기기에서 B 로그인
  const b = await flushPendingListenLater('B', db.deps());
  check(db.rows.length === 0, 'B 로그인은 A 의 뜻을 B 계정에 쓰지 않는다', dbRows(db) || '(없음)');
  check(b.status === 'empty' && db.calls === 1, 'B 쪽은 쓰기 자체를 하지 않는다', `${b.status}, 쓰기 ${db.calls}회`);
  check(owners() === 'A:X', 'A 의 뜻은 그대로 남는다', owners());

  // A 가 다시 로그인
  const a = await flushPendingListenLater('A', db.deps());
  check(a.status === 'flushed' && dbRows(db) === 'A:X', 'A 가 다시 로그인하면 A 에게 간다', dbRows(db));
  check(owners() === '', '그때 비워진다', owners());
}

console.log('\n게스트 뜻은 처음 로그인한 계정이 먼저 적고 가져간다 (E·F)');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('X'), null);
  check(owners() === 'guest:X', '게스트로 확정하면 주인 없음', owners());

  db.failNext({ message: 'network down' });
  const bad = await flushPendingListenLater('A', db.deps());
  check(bad.status === 'failed', 'A 로그인 뒤 쓰기 실패', bad.status);
  check(owners() === 'A:X', '쓰기는 실패했어도 주인은 A 로 적혀 있다', owners());

  // A 로그아웃 → B 로그인
  await flushPendingListenLater('B', db.deps());
  check(db.rows.length === 0 && owners() === 'A:X', 'B 에게 넘어가지 않는다', `${dbRows(db) || '(DB 없음)'} / ${owners()}`);
}

console.log('\n게스트 뜻이 로그인한 계정에 정확히 한 번 저장된다 (G)');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('X'), null);
  const r = await flushPendingListenLater('A', db.deps());
  check(r.status === 'flushed' && dbRows(db) === 'A:X' && db.calls === 1, 'A 에게 한 번', `${dbRows(db)}, 쓰기 ${db.calls}회`);
  check(owners() === '', '큐가 빈다', owners());
  await flushPendingListenLater('A', db.deps());
  check(db.calls === 1, '다시 불러도 또 쓰지 않는다', `쓰기 ${db.calls}회`);
}

console.log('\n게스트 뜻과 같은 곡이 이미 그 계정에 있으면 하나로 합친다');
{
  reset();
  const { safeLocalStorage } = await import('../../src/utils/storage.ts');
  safeLocalStorage.setItem('pending_listen_later_v1', JSON.stringify([
    { trackId: 'X', title: '곡 X', ownerUserId: 'A', addedAt: '2026-01-02T00:00:00.000Z' },
    { trackId: 'X', title: '곡 X', ownerUserId: null, addedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  const db = fakeDb();
  db.failNext({ message: 'down' }); // 합친 모양을 큐에서 보려고 쓰기는 실패시킨다
  await flushPendingListenLater('A', db.deps());
  const q = getPendingListenLater();
  check(owners() === 'A:X', '한 줄로 합쳐진다', owners());
  check(q[0]?.addedAt === '2026-01-01T00:00:00.000Z', '먼저 확정한 시각을 지킨다', q[0]?.addedAt);
  reset();
}

console.log('\n같은 곡이라도 계정이 다르면 다른 뜻이다 (H)');
{
  reset();
  const db = fakeDb();
  rememberPendingListenLater(track('X'), 'A');
  rememberPendingListenLater(track('X'), 'B');
  check(owners() === 'A:X,B:X', '둘 다 적힌다(한 곡이라고 합치지 않는다)', owners());

  await flushPendingListenLater('A', db.deps());
  check(dbRows(db) === 'A:X', 'A 의 X 만 A 에게 간다', dbRows(db));
  check(owners() === 'B:X', 'A 가 성공해도 B 의 X 는 지워지지 않는다', owners());

  await flushPendingListenLater('B', db.deps());
  check(dbRows(db) === 'A:X,B:X' && owners() === '', 'B 가 로그인하면 B 의 X 가 B 에게', `${dbRows(db)} / ${owners() || '(비었음)'}`);
}

console.log('\nA 가 옮기는 도중 B 가 불러도 섞이지 않는다 (I)');
{
  reset();
  const db = fakeDb();
  let release;
  const gate = new Promise((r) => { release = r; });
  const seen = [];
  const deps = {
    upsert: async (uid, list) => {
      seen.push(`${uid}<-${list.map((t) => `${t.ownerUserId}:${t.trackId}`).join('+')}`);
      if (uid === 'A') await gate; // A 의 쓰기를 붙잡아 둔다
      return db.deps().upsert(uid, list);
    },
  };
  rememberPendingListenLater(track('X'), 'A');
  rememberPendingListenLater(track('Y'), 'B');
  const pa = flushPendingListenLater('A', deps);
  await new Promise((r) => setTimeout(r, 10));
  const pb = flushPendingListenLater('B', deps);
  check(pa !== pb, 'B 는 A 의 옮기기에 올라타지 않는다');
  const rb = await pb; // A 가 붙잡혀 있어도 B 는 끝난다
  check(rb.status === 'flushed' && dbRows(db) === 'B:Y', 'B 는 B 의 것만 B 로 쓴다', dbRows(db));
  release();
  const ra = await pa;
  check(ra.status === 'flushed' && dbRows(db) === 'A:X,B:Y', 'A 도 A 의 것만 A 로 쓴다', dbRows(db));
  check(seen.every((s) => s.split('<-')[1].split('+').every((row) => row.startsWith(s.split('<-')[0] + ':'))),
    '어떤 쓰기도 남의 줄을 싣지 않았다', seen.join(' | '));
  check(owners() === '', '어느 쪽 뜻도 잃지 않고 다 옮겨졌다', owners());
}

console.log('\n옮기는 사이 로그아웃하고 게스트로 확정한 곡을 그 계정이 집어 가지 않는다');
{
  reset();
  const db = fakeDb();
  let release;
  const gate = new Promise((r) => { release = r; });
  let calls = 0;
  const deps = {
    upsert: async (uid, list) => {
      if (++calls === 1) await gate;
      return db.deps().upsert(uid, list);
    },
  };
  rememberPendingListenLater(track('X'), 'A');
  const pa = flushPendingListenLater('A', deps);
  await new Promise((r) => setTimeout(r, 10));
  rememberPendingListenLater(track('G'), null); // A 로그아웃 뒤 게스트가 확정
  release();
  await pa;
  check(dbRows(db) === 'A:X', 'A 에게는 X 만', dbRows(db));
  check(owners() === 'guest:G', '게스트 뜻은 주인 없이 남는다', owners());
  reset();
}

console.log('\n주인을 이 기기에 못 적으면 계정으로 옮기지 않는다');
{
  reset();
  const { safeLocalStorage } = await import('../../src/utils/storage.ts');
  rememberPendingListenLater(track('X'), null);
  const db = fakeDb();
  const orig = safeLocalStorage.setItem;
  safeLocalStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let r;
  try { r = await flushPendingListenLater('A', db.deps()); } finally { safeLocalStorage.setItem = orig; }
  check(r.status === 'failed', '실패로 끝난다', r.status);
  check(db.calls === 0, 'DB 에 쓰지 않는다', `쓰기 ${db.calls}회`);
  check(owners() === 'guest:X', '뜻은 주인 없이 그대로', owners());
  reset();
}

console.log('\n주인 칸이 없거나 망가진 줄도 터지지 않는다');
{
  const { safeLocalStorage } = await import('../../src/utils/storage.ts');
  safeLocalStorage.setItem('pending_listen_later_v1', JSON.stringify([
    { trackId: 'P', title: '곡 P' },
    { trackId: 'Q', title: '곡 Q', ownerUserId: 42 },
    { trackId: 'R', title: '곡 R', ownerUserId: 'A' },
  ]));
  check(owners() === 'A:R,guest:P,guest:Q', '주인 칸이 없거나 망가졌으면 게스트로 본다', owners());
  const db = fakeDb();
  await flushPendingListenLater('B', db.deps());
  check(dbRows(db) === 'B:P,B:Q' && owners() === 'A:R', '게스트 줄만 로그인한 계정이 가져가고 A 의 줄은 남는다', `${dbRows(db)} / ${owners()}`);
  reset();
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
