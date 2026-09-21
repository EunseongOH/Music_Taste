/**
 * 이번주 추천 아티스트 묶음이 주마다 정확히 한 번 바뀌는지 확인한다.
 * 계산은 src/app/api/together/catalog/route.ts 의 weekIndex 와 같은 식이다.
 *
 *   node scripts/check_together_week.mjs
 */
import assert from 'node:assert/strict';

const DAY = 86_400_000;
const weekIndex = (now) => Math.floor((now + 9 * 3_600_000 + 3 * DAY) / (7 * DAY));

// 1) 한국 시간 월요일 0시에 넘어간다.
const monday = Date.parse('2026-09-21T00:00:00+09:00'); // 월
assert.equal(weekIndex(monday - 1), weekIndex(monday - DAY), '일요일 안에서는 안 바뀐다');
assert.equal(weekIndex(monday), weekIndex(monday - 1) + 1, '월요일 0시에 한 칸 넘어간다');
assert.equal(weekIndex(monday), weekIndex(monday + 6 * DAY), '그 주 내내 같은 값이다');
assert.equal(weekIndex(monday + 7 * DAY), weekIndex(monday) + 1, '다음 월요일에 또 한 칸');

// 2) 창이 풀 끝을 넘어가도 빠지는 사람 없이 돌아간다.
const PICK_SIZE = 12;
const pick = (pool, week) => {
  const start = (week * PICK_SIZE) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, PICK_SIZE);
};
const pool = Array.from({ length: 22 }, (_, i) => `a${i}`); // 실측 풀 크기(2026-09-21)
const seen = new Set();
for (let w = 0; w < 40; w++) {
  const got = pick(pool, w);
  assert.equal(got.length, PICK_SIZE, '항상 12명이 나온다');
  assert.equal(new Set(got).size, PICK_SIZE, '한 묶음 안에 같은 사람이 두 번 나오지 않는다');
  got.forEach((x) => seen.add(x));
}
assert.equal(seen.size, pool.length, '몇 주 지나면 풀 전체가 한 번씩은 노출된다');

// 3) 풀이 묶음보다 작으면 라우트는 이 경로로 오지 않는다(기존 목록으로 떨어진다).
assert.ok(pool.length >= PICK_SIZE, '이 검사는 풀이 12명 이상일 때를 본다');

// 3) 한글 검색어를 영문 이름으로 옮기는 규칙 (catalog/route.ts 의 altNames 와 같은 식).
//    데이터가 아니라 규칙을 본다 — 실제 맵은 TS 쪽에 있다.
const MAP = { '까치산': 'Kachisan', '김승주': 'kimseungjoo', '라쿠나': 'Lacuna' };
const altNames = (q) => {
  const key = q.trim().toLowerCase();
  const direct = MAP[key] ?? MAP[q.trim()];
  if (direct) return [direct];
  if (key.length < 2) return [];
  const hit = Object.keys(MAP).find((k) => k.includes(key) || key.includes(k));
  return hit ? [MAP[hit]] : [];
};
assert.deepEqual(altNames('까치산'), ['Kachisan'], '그대로 맞으면 영문 이름이 나온다');
assert.deepEqual(altNames('  까치산 '), ['Kachisan'], '앞뒤 공백은 무시한다');
assert.deepEqual(altNames('까치'), ['Kachisan'], '일부만 쳐도 잡힌다');
assert.deepEqual(altNames('없는아티스트'), [], '맵에 없으면 빈 배열 — 원래 검색어로만 찾는다');
assert.deepEqual(altNames('아'), [], '한 글자는 아무 이름에나 걸리므로 보지 않는다');

console.log('OK: 주차 계산 · 순환 노출 · 한글 이름 매핑 모두 통과');
