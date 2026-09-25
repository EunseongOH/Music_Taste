/**
 * 같이 소트하기 — 결과 화면에 건네는 "끝낸 판" 쪽지가 출처를 지키는지 검사한다.
 *
 *   node --experimental-strip-types toss/baseline/together-completion-check.mjs
 *
 * 서버도 비밀값도 필요 없다. `src/utils/togetherCompletion.ts` 를 그대로 불러 쓴다.
 * 브라우저 흐름(방 B 결과를 열어도 쓰기 0건, 새로 고침해도 취향표 1장)은
 * together-stale-result-check.mjs 가 본다.
 */
import {
  completionFor,
  markCompletion,
  recordTogetherCompletion,
  startTogetherRun,
} from '../../src/utils/togetherCompletion.ts';
import { safeSessionStorage } from '../../src/utils/storage.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const reset = () => {
  for (const k of ['together_run_v1', 'together_completion_v1', 'worldcup_ranking']) safeSessionStorage.removeItem(k);
};
const A = { id: 'room-a', code: 'aaaa' };
const B = { id: 'room-b', code: 'bbbb' };

console.log('\n시작하지 않은 판은 끝나도 쪽지가 없다');
{
  reset();
  // 혼자 소트한 순위만 세션에 있다.
  safeSessionStorage.setItem('worldcup_ranking', JSON.stringify([{ id: 't1' }, { id: 't2' }]));
  const c = recordTogetherCompletion({ ranking: ['t1', 't2'], skippedTrackIds: [], ownerUserId: null });
  check(c === null, 'run 없이 끝나면 아무것도 적지 않는다');
  check(completionFor(B.id, null) === null, '혼자 소트한 순위로는 방 B 에 쓸 것이 없다');
}

console.log('\n쪽지는 그 방에만 쓰인다 — 곡이 같아도');
{
  reset();
  startTogetherRun(A);
  recordTogetherCompletion({ ranking: ['t1', 't2', 't3'], skippedTrackIds: [], ownerUserId: null });
  check(completionFor(A.id, null)?.challengeId === A.id, '방 A 에서는 보인다');
  // 방 B 의 곡이 방 A 와 완전히 같아도 challengeId 가 다르면 없다.
  check(completionFor(B.id, null) === null, '방 B 에서는 없다(곡 겹침과 무관)');
}

console.log('\n끝낸 사람이 아니면 저장하지 않는다');
{
  reset();
  startTogetherRun(A);
  recordTogetherCompletion({ ranking: ['t1', 't2'], skippedTrackIds: [], ownerUserId: 'user-a' });
  check(completionFor(A.id, 'user-a') !== null, '끝낸 계정이면 보인다');
  check(completionFor(A.id, null) === null, '로그아웃한 같은 기기(게스트)에서는 없다');
  check(completionFor(A.id, 'user-b') === null, '다른 계정에서는 없다');
  check(completionFor(A.id, 'user-a') !== null, '쪽지는 지워지지 않아 A 가 돌아오면 이어서 한다');

  reset();
  startTogetherRun(A);
  recordTogetherCompletion({ ranking: ['t1', 't2'], skippedTrackIds: [], ownerUserId: null });
  check(completionFor(A.id, 'user-a') !== null, '게스트로 끝내고 로그인하면 이어서 한다');
}

console.log('\n한 run 은 한 번만 끝나고, 단계가 다 끝나면 쪽지가 사라진다');
{
  reset();
  startTogetherRun(A);
  const c = recordTogetherCompletion({ ranking: ['t1', 't2'], skippedTrackIds: [], ownerUserId: null });
  check(recordTogetherCompletion({ ranking: ['t9'], skippedTrackIds: [], ownerUserId: null }) === null,
    '같은 run 으로 두 번 끝낼 수 없다');
  markCompletion(c.runId, { entrySaved: true });
  const mid = completionFor(A.id, null);
  check(mid?.entrySaved === true && mid?.tasteDone === false, '끝낸 단계만 적힌다');
  check(mid?.tasteResultId === c.tasteResultId, '취향표 id 는 처음 정한 그대로(다시 넣어도 같은 id)');
  markCompletion(c.runId, { tasteDone: true });
  check(completionFor(A.id, null) === null, '두 단계가 끝나면 쪽지가 사라진다 — 다시 열어도 쓰지 않는다');
}

console.log('\n같은 방을 다시 소트하면 새 판이다');
{
  reset();
  startTogetherRun(A);
  const first = recordTogetherCompletion({ ranking: ['t1', 't2'], skippedTrackIds: [], ownerUserId: null });
  startTogetherRun(A);
  const second = recordTogetherCompletion({ ranking: ['t2', 't1'], skippedTrackIds: [], ownerUserId: null });
  check(first.runId !== second.runId && first.tasteResultId !== second.tasteResultId, 'run·취향표 id 가 새로 나온다');
  // 옛 run 의 표시가 새 판을 끝낸 것으로 만들면 안 된다.
  markCompletion(first.runId, { entrySaved: true, tasteDone: true });
  const now = completionFor(A.id, null);
  check(now?.runId === second.runId && now.entrySaved === false, '옛 run 의 표시는 새 판을 건드리지 않는다');
}

console.log('\n손상된 쪽지를 만나도 터지지 않는다');
{
  reset();
  safeSessionStorage.setItem('together_completion_v1', '{ 이건 JSON 이 아니다');
  check(completionFor(A.id, null) === null, '읽지 못하면 없다');
  safeSessionStorage.setItem('together_completion_v1', JSON.stringify({ challengeId: A.id }));
  check(completionFor(A.id, null) === null, '필요한 칸이 없으면 없다');
  reset();
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
