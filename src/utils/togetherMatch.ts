/**
 * 같이 소트하기 — 일치율 계산. 문서: docs/together-sort.md
 *
 * 순수 함수만 둔다. `node --experimental-strip-types toss/baseline/together-check.mjs` 로 검사한다.
 */

export interface MatchResult {
  /** 0–100. 두 사람이 모두 소트한 곡으로만 잰다. */
  rate: number;
  /** 비교에 쓴 곡 수 */
  common: number;
  /** 1위가 같은 곡인지 */
  sameTop: boolean;
  /** 서로의 TOP 5 중 겹치는 곡 수 */
  topFiveOverlap: number;
  /** 순위 차이가 가장 큰 곡(있으면) */
  biggestGap: { id: string; mine: number; theirs: number } | null;
}

const EMPTY: MatchResult = { rate: 0, common: 0, sameTop: false, topFiveOverlap: 0, biggestGap: null };

/**
 * 두 순위(곡 id 배열, 1위부터)의 일치율.
 *
 * 스피어만 footrule: 순위 차이의 합을 완전히 뒤집혔을 때의 값으로 나눈다.
 * 곡을 "모르는 곡"으로 뺀 사람이 있으면 **둘 다 소트한 곡**만 비교한다.
 */
export function matchRate(mine: string[], theirs: string[]): MatchResult {
  const theirRank = new Map<string, number>();
  theirs.forEach((id, i) => theirRank.set(id, i));

  const common = mine.filter((id) => theirRank.has(id));
  const n = common.length;
  if (n < 2) return { ...EMPTY, common: n, sameTop: n === 1 && mine[0] === theirs[0] };

  // 공통 곡만 남겼을 때의 순위(0부터)로 다시 매긴다.
  const myOrder = common;
  // Set 으로 거른다. 여럿이면 이 함수를 쌍마다 부르므로 곡 수의 제곱이 사람 수의 제곱만큼 쌓인다.
  const inCommon = new Set(myOrder);
  const theirOrder = theirs.filter((id) => inCommon.has(id));
  const myPos = new Map(myOrder.map((id, i) => [id, i]));
  const theirPos = new Map(theirOrder.map((id, i) => [id, i]));

  let distance = 0;
  let biggestGap: MatchResult["biggestGap"] = null;
  for (const id of myOrder) {
    const a = myPos.get(id)!;
    const b = theirPos.get(id)!;
    const gap = Math.abs(a - b);
    distance += gap;
    if (!biggestGap || gap > Math.abs(biggestGap.mine - biggestGap.theirs)) {
      biggestGap = { id, mine: a + 1, theirs: b + 1 };
    }
  }

  const maxDistance = Math.floor((n * n) / 2);
  const rate = Math.max(0, Math.round((1 - distance / maxDistance) * 100));

  const myTop5 = new Set(myOrder.slice(0, 5));
  const topFiveOverlap = theirOrder.slice(0, 5).filter((id) => myTop5.has(id)).length;

  return {
    rate,
    common: n,
    sameTop: mine[0] === theirs[0],
    topFiveOverlap,
    biggestGap: biggestGap && Math.abs(biggestGap.mine - biggestGap.theirs) > 0 ? biggestGap : null,
  };
}

/** 사람이 여럿일 때 평균 일치율(비교할 상대가 없으면 null). */
export function averageRate(rates: number[]): number | null {
  if (rates.length === 0) return null;
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
}

/* ───────────────────────────────────────────────────────────────
 * 여럿이 할 때
 *
 * 화면은 여기서 나온 값만 쓴다. 같은 일치율을 Hero·관계도·상세·공유 이미지가
 * 각자 다시 계산하면 언젠가 서로 다른 숫자를 보여준다.
 * ─────────────────────────────────────────────────────────────── */

export interface Participant {
  /** 참여자 식별자. 닉네임은 겹칠 수 있어서 이걸로만 가른다. */
  key: string;
  nickname: string | null;
  /** 곡 id 배열(1위부터) */
  ranking: string[];
}

export interface PairMatch {
  aKey: string;
  bKey: string;
  aNickname: string | null;
  bNickname: string | null;
  rate: number;
  common: number;
  sameTop: boolean;
  /** 둘 다 자기 TOP N 에 둔 곡 수. N 은 `getTopK(common)`. */
  topOverlap: number;
  /**
   * 순위가 가장 갈린 곡. **고르는 기준은 공통 곡 안에서의 순위 차이**(실제 의견 차),
   * **보여주는 순위는 각자의 전체 소트 기준**(그 사람이 자기 결과에서 보는 숫자)이다.
   * 모르는 곡을 뺀 사람이 있으면 두 기준이 갈리는데, 고를 때는 공통 기준이 맞고
   * 말할 때는 전체 기준이 맞다 — "나는 2위, 지민은 14위" 의 숫자는 각자의 목록에 있는 그대로다.
   */
  biggestGap: { id: string; aRank: number; bRank: number } | null;
  /** 공통 곡이 2곡 미만이면 순위 거리를 잴 수 없다. 그룹 평균에서 뺀다(0% 로 깎지 않는다). */
  comparable: boolean;
}

const rankMap = (ranking: string[]): Map<string, number> =>
  new Map(ranking.map((id, i) => [id, i + 1]));

/** 쌍이 같은 일치율일 때 순서가 렌더마다 바뀌지 않게 하는 기준. */
const byKey = (x: PairMatch, y: PairMatch): number =>
  x.aKey === y.aKey ? (x.bKey < y.bKey ? -1 : x.bKey > y.bKey ? 1 : 0) : x.aKey < y.aKey ? -1 : 1;

/**
 * 공통 곡 수에 맞춘 TOP N.
 *
 * 6곡짜리 방에서 TOP 5 는 "거의 전부"라서 겹쳐도 할 말이 없다.
 * 4곡 미만이면 N 을 0 으로 둔다 — 억지로 채우지 말고 화면에서 섹션을 빼라는 뜻이다.
 */
export function getTopK(common: number): number {
  if (common >= 15) return 5;
  if (common >= 8) return 3;
  if (common >= 4) return 2;
  return 0;
}

/** 둘 다 자기 TOP k 에 둔 곡(내 순위 순). */
export function getSharedTopTracks(mine: string[], theirs: string[], k: number): string[] {
  if (k <= 0) return [];
  const theirTop = new Set(theirs.slice(0, k));
  return mine.slice(0, k).filter((id) => theirTop.has(id));
}

export interface RankRow {
  id: string;
  /** 각자의 전체 소트 기준 순위(1위부터) */
  mineRank: number;
  theirRank: number;
  gap: number;
}

/** 두 사람이 모두 줄 세운 곡을, 내 순위 순으로. */
export function buildRankComparison(mine: string[], theirs: string[]): RankRow[] {
  const theirRank = rankMap(theirs);
  const rows: RankRow[] = [];
  mine.forEach((id, i) => {
    const t = theirRank.get(id);
    if (t !== undefined) rows.push({ id, mineRank: i + 1, theirRank: t, gap: Math.abs(i + 1 - t) });
  });
  return rows;
}

function pairOf(a: Participant, b: Participant): PairMatch {
  const m = matchRate(a.ranking, b.ranking);
  const gapId = m.biggestGap?.id ?? null;
  const aRank = rankMap(a.ranking);
  const bRank = rankMap(b.ranking);
  return {
    aKey: a.key,
    bKey: b.key,
    aNickname: a.nickname,
    bNickname: b.nickname,
    rate: m.rate,
    common: m.common,
    sameTop: m.sameTop,
    topOverlap: getSharedTopTracks(a.ranking, b.ranking, getTopK(m.common)).length,
    biggestGap: gapId ? { id: gapId, aRank: aRank.get(gapId)!, bRank: bRank.get(gapId)! } : null,
    comparable: m.common >= 2,
  };
}

/**
 * 모든 참여자 쌍의 일치율. 사람이 n 명이면 n(n−1)/2 개.
 *
 * 참여자를 key 로 정렬한 뒤 짝을 짓는다 — 읽어 온 순서가 달라도 같은 결과가 나와야
 * 관계도 위치와 강조선이 새로고침마다 흔들리지 않는다.
 */
export function buildPairwiseMatches(participants: Participant[]): PairMatch[] {
  const sorted = [...participants].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  const out: PairMatch[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) out.push(pairOf(sorted[i], sorted[j]));
  }
  return out;
}

/**
 * 그룹 종합 일치율 — **모든 쌍의 평균**이다(나와 남들의 평균이 아니다).
 *
 * 잴 수 없는 쌍(`comparable: false`)은 뺀다. 0% 로 넣으면 겹치는 곡이 없는 사람이
 * 한 명 들어올 때마다 그룹 전체가 안 닮은 것처럼 보인다.
 */
export function groupMatchRate(pairs: PairMatch[]): number | null {
  const usable = pairs.filter((p) => p.comparable);
  if (usable.length === 0) return null;
  return Math.round(usable.reduce((sum, p) => sum + p.rate, 0) / usable.length);
}

/**
 * 관계도에서 기본으로 그릴 선 — 가장 닮은 두 쌍과 가장 다른 한 쌍.
 *
 * 쌍이 셋 미만이면 `lowest` 를 두지 않는다. 둘뿐인데 "가장 다른 조합"이라고 부르면
 * 같은 선에 두 이름을 붙이는 꼴이고, 하나뿐이면 비교 자체가 없다.
 */
export function pickHighlightEdges(pairs: PairMatch[]): {
  highest: PairMatch[];
  lowest: PairMatch | null;
} {
  const usable = pairs.filter((p) => p.comparable);
  if (usable.length === 0) return { highest: [], lowest: null };
  const highest = [...usable].sort((x, y) => y.rate - x.rate || byKey(x, y)).slice(0, 2);
  if (usable.length < 3) return { highest, lowest: null };
  const lowest = [...usable].sort((x, y) => x.rate - y.rate || byKey(x, y))[0];
  // 전부 같은 일치율이면 최저가 최고 안에 들어온다. 그때는 "가장 다른 조합"이 없는 게 맞다.
  return { highest, lowest: highest.some((p) => p.aKey === lowest.aKey && p.bKey === lowest.bKey) ? null : lowest };
}

/** 나와 짝지어진 쌍만, 일치율 높은 순으로. 기본 선택과 참여자 목록이 같은 순서를 쓴다. */
export function partnersOf(pairs: PairMatch[], myKey: string): PairMatch[] {
  return pairs
    .filter((p) => p.aKey === myKey || p.bKey === myKey)
    .sort((x, y) => y.rate - x.rate || byKey(x, y));
}

/** 쌍에서 상대 쪽 key. */
export function otherKey(pair: PairMatch, myKey: string): string {
  return pair.aKey === myKey ? pair.bKey : pair.aKey;
}

/** 공유 링크에 쓰는 짧은 코드. 헷갈리는 글자(0/O, 1/l)는 뺀다. */
export function makeCode(random: () => number = Math.random): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  return Array.from({ length: 7 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}
