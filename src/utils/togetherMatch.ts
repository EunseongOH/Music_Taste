/**
 * 같이 소트하기 — 일치율 계산. 문서: docs/together-sort.md
 *
 * 순수 함수만 둔다. `node --experimental-strip-types toss/baseline/together-check.mjs` 로 검사한다.
 */

export interface MatchResult {
  /** 0–100. 두 사람이 모두 줄 세운 곡으로만 잰다. */
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
 * 곡을 "모르는 곡"으로 뺀 사람이 있으면 **둘 다 줄 세운 곡**만 비교한다.
 */
export function matchRate(mine: string[], theirs: string[]): MatchResult {
  const theirRank = new Map<string, number>();
  theirs.forEach((id, i) => theirRank.set(id, i));

  const common = mine.filter((id) => theirRank.has(id));
  const n = common.length;
  if (n < 2) return { ...EMPTY, common: n, sameTop: n === 1 && mine[0] === theirs[0] };

  // 공통 곡만 남겼을 때의 순위(0부터)로 다시 매긴다.
  const myOrder = common;
  const theirOrder = theirs.filter((id) => myOrder.includes(id));
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

/** 공유 링크에 쓰는 짧은 코드. 헷갈리는 글자(0/O, 1/l)는 뺀다. */
export function makeCode(random: () => number = Math.random): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  return Array.from({ length: 7 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}
