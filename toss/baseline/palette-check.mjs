/**
 * 카드 색 조합 검사 — src/components/result/cardPalette.ts
 *
 *   node --experimental-strip-types toss/baseline/palette-check.mjs
 *
 * 색은 눈으로만 보면 어두운 프리셋에서 놓친다. 작은 글자와 포인트 글자가
 * 바탕 위에서 **WCAG AA(4.5:1)** 를 넘는지 계산해서 본다.
 * 구분선처럼 글자가 아닌 것은 보지 않는다(대비 기준이 다르다).
 */
import { CARD_PALETTES } from '../../src/components/result/cardPalette.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const srgb = (hex) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
/** WCAG 상대 휘도. */
const luminance = (hex) => {
  const [r, g, b] = srgb(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

console.log(`\n카드 팔레트 ${CARD_PALETTES.length}개`);
check(CARD_PALETTES.length === 7, '프리셋 7개');
check(new Set(CARD_PALETTES.map((p) => p.id)).size === CARD_PALETTES.length, 'id 가 겹치지 않음');

for (const p of CARD_PALETTES) {
  console.log(`\n${p.name} (${p.id})`);
  for (const key of ['cardInk', 'cardMuted', 'cardAccent']) {
    const r = ratio(p.cardBg, p[key]);
    check(r >= 4.5, `${key} 대비`, `${r.toFixed(2)}:1`);
  }
  // 모자이크 순위 배지: 포인트색 면 위에 바탕색 글자를 올린다.
  const badge = ratio(p.cardAccent, p.cardBg);
  check(badge >= 4.5, '포인트 면 위의 바탕색 글자', `${badge.toFixed(2)}:1`);
  check(
    ['cardBg', 'cardInk', 'cardMuted', 'cardAccent', 'cardLine', 'previewHalo'].every((k) => typeof p[k] === 'string' && p[k]),
    '토큰 6종이 모두 있음'
  );
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
