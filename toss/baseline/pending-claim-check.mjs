/**
 * 계정에 남기려던 뜻(pending claim) — src/utils/togetherIdentity.ts
 *
 *   node --experimental-strip-types toss/baseline/pending-claim-check.mjs
 *
 * 게스트로 끝낸 결과를 로그인해서 계정에 남기려 할 때 쓰는 쪽지다. 두 가지가 중요하다.
 *
 *   **성공하기 전에 지우지 않는다.** 예전에는 읽으면서 바로 지워서, claim RPC 가
 *   실패하면 뜻이 함께 사라졌다. 다시 시도할 길이 없었다.
 *
 *   **누구에게 붙이려던 것인지 적는다.** A 가 집었다가 실패하고 로그아웃한 뒤 B 가
 *   로그인해도, A 에게 붙이려던 기록이 B 의 것이 되면 안 된다.
 *
 * 서버도 비밀값도 필요 없다 — 브라우저가 없으면 storage 래퍼가 메모리로 떨어진다.
 */
import {
  bindPendingClaim,
  clearPendingClaim,
  getPendingClaim,
  rememberPendingClaim,
} from '../../src/utils/togetherIdentity.ts';
import { safeSessionStorage } from '../../src/utils/storage.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const KEY = 'together_pending_claim';
const A = 'user-a';
const B = 'user-b';
const ROOM_A = 'room-a';
const ROOM_B = 'room-b';
const reset = () => safeSessionStorage.removeItem(KEY);
const owner = () => getPendingClaim()?.ownerUserId ?? null;

console.log('\nCase 1 — 게스트가 적어 둔다');
{
  reset();
  rememberPendingClaim(ROOM_A);
  const p = getPendingClaim();
  check(p?.challengeId === ROOM_A, '방이 적힌다', p?.challengeId);
  check(p?.ownerUserId === null, '아직 주인이 없다', String(p?.ownerUserId));
}

console.log('\nCase 2 — 계정 A 가 집어 간다 (RPC 전에 먼저 적힌다)');
{
  const got = bindPendingClaim(A);
  check(got === ROOM_A, '방 id 를 돌려준다', String(got));
  /*
   * RPC 를 부르기 **전에** 저장소에 적혀 있어야 한다. 적히기 전에 시작하면,
   * 실패한 뒤 다른 계정이 그 뜻을 가져갈 수 있다.
   */
  check(owner() === A, '집어 간 계정이 저장소에 남는다', String(owner()));
}

console.log('\nCase 3 — A 의 claim 이 실패해도 뜻은 남는다');
{
  // 실패했으면 clearPendingClaim 을 부르지 않는다. 그게 계약이다.
  check(getPendingClaim()?.challengeId === ROOM_A, '쪽지가 그대로', String(getPendingClaim()?.challengeId));
  check(owner() === A, '주인도 그대로 A', String(owner()));
}

console.log('\nCase 4 — 로그아웃 뒤 B 가 로그인해도 가져가지 못한다');
{
  const got = bindPendingClaim(B);
  check(got === null, 'B 에게는 아무것도 주지 않는다', String(got));
  check(owner() === A, '주인은 계속 A', String(owner()));
  check(getPendingClaim()?.challengeId === ROOM_A, 'A 의 뜻은 사라지지 않는다');
}

console.log('\nCase 5 — A 가 다시 로그인하면 이어서 한다');
{
  const got = bindPendingClaim(A);
  check(got === ROOM_A, '다시 집을 수 있다', String(got));
  check(owner() === A, '주인은 그대로', String(owner()));
}

console.log('\nCase 6 — 이미 계정 것이면 뜻은 이뤄졌다');
{
  // claim 응답을 못 받았어도 서버가 소유를 확인해 주면 지운다.
  clearPendingClaim(ROOM_A);
  check(getPendingClaim() === null, '지워진다', JSON.stringify(getPendingClaim()));
}

console.log('\nCase 7 — 다른 방을 지워도 이 방의 뜻은 남는다');
{
  reset();
  rememberPendingClaim(ROOM_A);
  bindPendingClaim(A);
  clearPendingClaim(ROOM_B);
  check(getPendingClaim()?.challengeId === ROOM_A, '엉뚱한 방 id 로는 안 지워진다', String(getPendingClaim()?.challengeId));
  check(owner() === A, '주인도 그대로', String(owner()));
}

console.log('\nCase 8 — 이 칸이 없던 옛 쪽지도 읽는다');
{
  reset();
  // 예전에는 방 id 문자열만 적었다.
  safeSessionStorage.setItem(KEY, ROOM_A);
  const p = getPendingClaim();
  check(p?.challengeId === ROOM_A, '문자열 쪽지를 읽는다', String(p?.challengeId));
  check(p?.ownerUserId === null, '주인은 없는 것으로 본다', String(p?.ownerUserId));
  check(bindPendingClaim(A) === ROOM_A, '그 뒤 정상으로 집어 간다');
  check(owner() === A, '집으면서 주인이 적힌다', String(owner()));
}

console.log('\n쪽지가 망가져 있어도 터지지 않는다');
{
  reset();
  safeSessionStorage.setItem(KEY, '{ 이건 JSON 이 아니다');
  check(getPendingClaim() === null, '못 읽으면 없는 것으로', JSON.stringify(getPendingClaim()));
  check(bindPendingClaim(A) === null, '집을 것도 없다');
  reset();
  check(bindPendingClaim(A) === null, '쪽지가 없으면 null');
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
