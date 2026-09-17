/**
 * 같이 소트하기 일치율 검사 — src/utils/togetherMatch.ts
 *
 *   node --experimental-strip-types toss/baseline/together-check.mjs
 */
import { matchRate, averageRate, makeCode } from '../../src/utils/togetherMatch.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const ids = (n) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

{
  const a = ids(10);
  const same = matchRate(a, a);
  check(same.rate === 100 && same.sameTop && same.topFiveOverlap === 5, '똑같은 순위 → 100%', `${same.rate}%`);

  const reversed = matchRate(a, [...a].reverse());
  check(reversed.rate === 0 && !reversed.sameTop, '완전히 뒤집힌 순위 → 0%', `${reversed.rate}%`);

  const swapped = [...a];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const near = matchRate(a, swapped);
  check(near.rate > 90 && near.rate < 100, '1·2위만 바뀌면 90%대', `${near.rate}%`);
  check(!near.sameTop && near.topFiveOverlap === 5, '1위는 다르지만 TOP5 는 그대로');
}

{
  // 상대가 "모르는 곡"으로 3곡을 뺀 경우 — 둘 다 줄 세운 곡으로만 비교한다.
  const a = ids(10);
  const partial = a.slice(0, 7);
  const r = matchRate(a, partial);
  check(r.common === 7 && r.rate === 100, '일부만 참여해도 공통 곡으로 100%', `${r.common}곡 ${r.rate}%`);
}

{
  const r = matchRate(['x'], ['x']);
  check(r.common === 1 && r.sameTop && r.rate === 0, '곡이 하나면 순위 비교 없음(1위만 같다고 표시)');
  const none = matchRate(['a', 'b'], ['c', 'd']);
  check(none.common === 0 && none.rate === 0, '겹치는 곡이 없으면 0%');
}

{
  const a = ids(6);
  const shifted = [a[5], ...a.slice(0, 5)];
  const r = matchRate(a, shifted);
  check(r.biggestGap?.id === 't6' && r.biggestGap.mine === 6 && r.biggestGap.theirs === 1, '차이가 가장 큰 곡을 집어낸다', JSON.stringify(r.biggestGap));
}

check(averageRate([80, 90, 100]) === 90 && averageRate([]) === null, '평균 일치율');

{
  let seed = 1;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const codes = new Set(Array.from({ length: 500 }, () => makeCode(rnd)));
  check(codes.size === 500, '코드 500개가 서로 다르다', `${codes.size}개`);
  check([...codes].every((c) => /^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/.test(c)), '코드는 헷갈리는 글자 없는 7자');
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
