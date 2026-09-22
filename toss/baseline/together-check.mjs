/**
 * 같이 소트하기 일치율 검사 — src/utils/togetherMatch.ts
 *
 *   node --experimental-strip-types toss/baseline/together-check.mjs
 */
import {
  matchRate, averageRate, makeCode,
  buildPairwiseMatches, groupMatchRate, pickHighlightEdges, partnersOf,
  getTopK, getSharedTopTracks, buildRankComparison,
} from '../../src/utils/togetherMatch.ts';

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

/* ─── 여럿이 할 때 ──────────────────────────────────────────── */

console.log('\n여럿이 할 때');

/** 사람 하나. ranking 은 곡 id 배열(1위부터). */
const p = (key, nickname, ranking) => ({ key, nickname, ranking });
const rateOf = (pairs, a, b) =>
  pairs.find((x) => (x.aKey === a && x.bKey === b) || (x.aKey === b && x.bKey === a))?.rate;

{
  // 1) 2명 완전 동일 / 2) 2명 완전 역순
  const t = ids(10);
  const same = buildPairwiseMatches([p('a', '가', t), p('b', '나', t)]);
  check(same.length === 1 && same[0].rate === 100, '2명 동일 → 쌍 1개 100%', `${same[0].rate}%`);
  check(groupMatchRate(same) === 100, '2명 동일 → 종합 100%');

  const rev = buildPairwiseMatches([p('a', '가', t), p('b', '나', [...t].reverse())]);
  check(groupMatchRate(rev) === 0, '2명 역순 → 종합 0%', `${groupMatchRate(rev)}%`);

  // 8-1) 2명이면 highest 만, lowest 는 없다
  const edges = pickHighlightEdges(rev);
  check(edges.highest.length === 1 && edges.lowest === null, '쌍이 하나면 가장 다른 조합을 만들지 않는다');
}

{
  // 3) 3명 — 쌍 3개, 종합은 나와 남들이 아니라 모든 쌍의 평균
  const t = ids(8);
  const shift = (n) => [...t.slice(n), ...t.slice(0, n)];
  const pairs = buildPairwiseMatches([p('a', '가', t), p('b', '나', shift(1)), p('c', '다', shift(2))]);
  check(pairs.length === 3, '3명 → 쌍 3개', `${pairs.length}개`);

  // a 만의 평균과 전체 쌍 평균이 실제로 다른 자료인지 확인한다(다르지 않으면 이 검사가 무의미).
  const mineOnly = averageRate(partnersOf(pairs, 'a').map((x) => x.rate));
  const group = groupMatchRate(pairs);
  check(
    group === Math.round(pairs.reduce((s, x) => s + x.rate, 0) / 3),
    '종합 일치율 = 모든 쌍의 평균',
    `전체쌍 ${group}% · a기준 ${mineOnly}%`
  );
  check(mineOnly !== group, '나 기준 평균과 그룹 평균은 실제로 다른 값이다');

  // 14) 사람이 늘면 종합이 바뀐다
  const grown = buildPairwiseMatches([
    p('a', '가', t), p('b', '나', shift(1)), p('c', '다', shift(2)), p('d', '라', [...t].reverse()),
  ]);
  check(grown.length === 6 && groupMatchRate(grown) !== group, '참여자가 늘면 쌍 수와 종합이 바뀐다',
    `${grown.length}쌍 ${groupMatchRate(grown)}%`);
}

{
  // 4) 6명 / 5) 10명 / 6) 11명 / 7) 20명 — 쌍 수와 결정성
  for (const [n, expect] of [[6, 15], [10, 45], [11, 55], [20, 190]]) {
    const people = Array.from({ length: n }, (_, i) => p(`p${i}`, `이름${i}`, [...ids(12)].slice(i % 3).concat(ids(12).slice(0, i % 3))));
    const pairs = buildPairwiseMatches(people);
    check(pairs.length === expect, `${n}명 → 쌍 ${expect}개`, `${pairs.length}개`);
    // 읽어 온 순서가 달라도 같은 결과
    const shuffled = buildPairwiseMatches([...people].reverse());
    check(
      JSON.stringify(pairs) === JSON.stringify(shuffled),
      `${n}명 — 입력 순서가 바뀌어도 결과가 같다`
    );
  }
}

{
  // 8) 뺀 곡이 있는 경우 — 전체 순위로 말한다
  const mine = ids(10);
  const theirs = ['t5', 't1', 't2'];           // 7곡을 모르는 곡으로 뺐다
  const pairs = buildPairwiseMatches([p('a', '나', mine), p('b', '지민', theirs)]);
  const gap = pairs[0].biggestGap;
  check(pairs[0].common === 3, '뺀 곡이 있으면 공통 곡으로만 비교', `${pairs[0].common}곡`);
  check(gap?.id === 't5' && gap.aRank === 5 && gap.bRank === 1,
    '가장 갈린 곡의 순위는 각자의 전체 소트 기준', JSON.stringify(gap));

  const rows = buildRankComparison(mine, theirs);
  check(rows.length === 3 && rows[0].mineRank === 1 && rows[0].theirRank === 2,
    '전체 순위 비교는 공통 곡만, 내 순위 순', JSON.stringify(rows[0]));
}

{
  // 9) 공통 곡 1개 / 10) 일부 쌍만 비교 가능 → 0% 로 평균을 깎지 않는다
  const t = ids(10);
  const loner = ['zz', 'yy'];                   // 아무와도 안 겹친다
  const pairs = buildPairwiseMatches([p('a', '가', t), p('b', '나', t), p('c', '외톨이', loner)]);
  const usable = pairs.filter((x) => x.comparable);
  check(pairs.length === 3 && usable.length === 1, '겹치지 않는 쌍은 잴 수 없음으로 표시', `${usable.length}/3 쌍`);
  check(groupMatchRate(pairs) === 100, '잴 수 없는 쌍은 평균에서 뺀다(0% 로 깎지 않는다)', `${groupMatchRate(pairs)}%`);

  const one = buildPairwiseMatches([p('a', '가', ['x', 'q']), p('b', '나', ['x'])]);
  check(one[0].common === 1 && one[0].comparable === false, '공통 곡 1개는 잴 수 없다');
  check(groupMatchRate(one) === null, '잴 수 있는 쌍이 없으면 종합은 null');
}

{
  // 11) highest 동점 / 12) lowest 동점 → 렌더마다 바뀌지 않는다
  const t = ids(8);
  const rev = [...t].reverse();
  const people = [p('a', '가', t), p('b', '나', t), p('c', '다', t), p('d', '라', rev)];
  const first = pickHighlightEdges(buildPairwiseMatches(people));
  const again = pickHighlightEdges(buildPairwiseMatches([...people].reverse()));
  check(JSON.stringify(first) === JSON.stringify(again), '동점이어도 강조선이 매번 같다',
    `${first.highest.map((x) => `${x.aKey}-${x.bKey}`).join(',')} / ${first.lowest ? `${first.lowest.aKey}-${first.lowest.bKey}` : '없음'}`);
  check(first.highest.length === 2 && first.highest.every((x) => x.rate === 100), '가장 닮은 조합 2개');
  check(first.lowest !== null && first.lowest.rate === 0, '가장 다른 조합 1개');
  check(
    !first.highest.some((x) => x.aKey === first.lowest.aKey && x.bKey === first.lowest.bKey),
    '가장 닮은 조합과 가장 다른 조합이 겹치지 않는다'
  );

  // 전부 같은 일치율이면 "가장 다른 조합"을 만들지 않는다
  const flat = pickHighlightEdges(buildPairwiseMatches([p('a', '가', t), p('b', '나', t), p('c', '다', t)]));
  check(flat.lowest === null, '전부 같은 일치율이면 가장 다른 조합은 없다');
}

{
  // 13) 닉네임이 같은 사람 — key 로 가른다
  const t = ids(6);
  const pairs = buildPairwiseMatches([
    p('k1', '민준', t), p('k2', '민준', [...t].reverse()), p('k3', '민준', t),
  ]);
  check(pairs.length === 3, '같은 닉네임 3명도 쌍 3개');
  check(rateOf(pairs, 'k1', 'k3') === 100 && rateOf(pairs, 'k1', 'k2') === 0,
    '닉네임이 같아도 key 로 구분해 다른 일치율이 나온다',
    `k1-k3 ${rateOf(pairs, 'k1', 'k3')}% · k1-k2 ${rateOf(pairs, 'k1', 'k2')}%`);
  check(partnersOf(pairs, 'k1').length === 2, '나와 짝지어진 쌍만 골라낸다');
}

{
  // TOP N 규칙
  check(getTopK(3) === 0 && getTopK(4) === 2 && getTopK(7) === 2, 'TOP N — 4~7곡이면 2');
  check(getTopK(8) === 3 && getTopK(14) === 3, 'TOP N — 8~14곡이면 3');
  check(getTopK(15) === 5 && getTopK(100) === 5, 'TOP N — 15곡 이상이면 5');
  check(getTopK(1) === 0, 'TOP N — 너무 적으면 0(섹션을 만들지 않는다)');

  const a = ['t1', 't2', 't3', 't4', 't5'];
  const b = ['t3', 't9', 't1', 't4', 't5'];
  check(JSON.stringify(getSharedTopTracks(a, b, 3)) === JSON.stringify(['t1', 't3']),
    '둘 다 TOP 3 에 둔 곡', JSON.stringify(getSharedTopTracks(a, b, 3)));
  check(getSharedTopTracks(a, b, 0).length === 0, 'TOP N 이 0 이면 빈 목록');
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
