/**
 * 취향표 카드 배치 검사 — src/components/result/exportLayout.ts
 *
 *   node --experimental-strip-types toss/baseline/layout-check.mjs
 *
 * 곡 수 1–100 × 템플릿·모양 전 조합에서
 *  - 리스트형·레코드형: 모든 곡이 정확히 한 번 들어가고, 장마다 본문 높이를 넘지 않는다.
 *    마지막 장이 휑하지 않다(장이 여럿이면 가장 적은 장이 가장 많은 장의 절반 이상).
 *  - 모자이크형: 놓인 곡은 서로 다른 칸, 순위가 빠짐없이 0..shown-1, 타일 최소 크기,
 *    64곡(별은 40곡)까지는 전곡이 모양 안에 들어간다, 본문 높이를 넘지 않는다.
 */
import {
  CARD_BODY_H, LIST_ROW_MAX, RECORD_ROW_MAX, listPages, listPageHeight, recordPages, recordPageHeight,
  mosaicLayout, mosaicBodyHeight, SHAPES, MOSAIC_MIN_TILE, shapeSvg,
  pyramidLayout, pyramidBodyHeight, PYR_MIN_D, PYR_TITLE_MIN_D,
} from '../../src/components/result/exportLayout.ts';

let failed = 0;
const fail = (msg) => { if (failed < 20) console.log('  [X] ' + msg); failed++; };

function checkPages(name, pages, n, heightOf) {
  let next = 0;
  for (const p of pages) {
    if (p.from !== next) fail(`${name} ${n}곡: 장 경계가 끊김 (${p.from} ≠ ${next})`);
    if (p.to <= p.from) fail(`${name} ${n}곡: 빈 장`);
    if (heightOf(p) > CARD_BODY_H) fail(`${name} ${n}곡: ${p.from + 1}–${p.to}위 장 높이 ${heightOf(p)} > ${CARD_BODY_H}`);
    // 남는 높이가 한 행보다 크면 행을 더 키울 수 있었다는 뜻이다(최대 크기에 닿은 경우 제외).
    const spare = CARD_BODY_H - heightOf(p);
    const rows = p.to - p.from;
    if (p.rowH && !p.hero && !p.hasFeature && p.rowH < (name === '리스트형' ? LIST_ROW_MAX : RECORD_ROW_MAX) && spare > rows) fail(`${name} ${n}곡: ${p.from + 1}–${p.to}위 장에 빈 공간 ${spare}px`);
    next = p.to;
  }
  if (next !== n) fail(`${name} ${n}곡: 곡 수 불일치 (${next})`);
  // 첫 장까지 포함해 고르게: 가장 적은 장이 가장 많은 장의 절반은 넘어야 한다(18+2 같은 빈 장 금지).
  const sizes = pages.map((p) => p.to - p.from);
  if (sizes.length > 1 && Math.min(...sizes) * 2 < Math.max(...sizes)) fail(`${name} ${n}곡: 장 분배가 한쪽으로 쏠림 ${sizes.join('/')}`);
}

for (let n = 1; n <= 100; n++) {
  checkPages('리스트형', listPages(n), n, listPageHeight);
  checkPages('레코드형', recordPages(n), n, recordPageHeight);

  {
    const p = pyramidLayout(n);
    if (p.nodes.length !== n || p.nodes.some((x) => !x)) fail(`피라미드 ${n}곡: 노드 누락`);
    if (pyramidBodyHeight(p) > CARD_BODY_H + 0.5) fail(`피라미드 ${n}곡: 본문 높이 ${pyramidBodyHeight(p).toFixed(0)} > ${CARD_BODY_H}`);
    for (const node of p.nodes) {
      if (node.d < PYR_MIN_D) fail(`피라미드 ${n}곡: ${node.rank + 1}위 원 ${node.d}px`);
      if (node.x - node.d / 2 < -0.5 || node.x + node.d / 2 > p.width + 0.5) fail(`피라미드 ${n}곡: ${node.rank + 1}위가 폭 밖`);
      if (p.showTitles && node.d < PYR_TITLE_MIN_D) fail(`피라미드 ${n}곡: 제목을 다는데 원이 ${node.d}px`);
    }
    // 같은 줄 원끼리 겹치지 않는다
    const byRow = new Map();
    for (const node of p.nodes) byRow.set(node.row, [...(byRow.get(node.row) ?? []), node]);
    for (const row of byRow.values()) {
      const xs = row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < xs.length; i++) if (xs[i].x - xs[i - 1].x < xs[i].d - 0.5) fail(`피라미드 ${n}곡: ${xs[i].row + 1}번째 줄 원이 겹침`);
    }
    // 카메라 경로: 꼴찌 노드에서 시작해 구간마다 3점, 1위 노드에서 끝나고 거리는 늘어나기만 한다
    if (p.trail.length !== 1 + 3 * (n - 1)) fail(`피라미드 ${n}곡: 카메라 경로 점 수 ${p.trail.length}`);
    if (p.trail.some((pt, i) => i > 0 && pt.at < p.trail[i - 1].at)) fail(`피라미드 ${n}곡: 카메라 경로가 되돌아감`);
    if (n > 1 && Math.hypot(p.trail.at(-1).x - p.nodes[0].x, p.trail.at(-1).y - p.nodes[0].y) > 0.5) fail(`피라미드 ${n}곡: 카메라가 1위에서 끝나지 않음`);
    // 경로는 꼴찌에서 시작해 1위에서 끝난다(모션이 아래에서 위로)
    if (p.reachAt[n - 1] !== 0 || (n > 1 && Math.abs(p.reachAt[0] - p.pathLength) > 0.01)) fail(`피라미드 ${n}곡: 경로 시작·끝이 순위와 어긋남`);
  }

  for (const shape of SHAPES) {
    const l = mosaicLayout(n, shape);
    const ranks = l.cells.filter((c) => c.rank !== null).map((c) => c.rank).sort((a, b) => a - b);
    if (ranks.length !== l.shown || ranks.some((r, i) => r !== i)) fail(`모자이크 ${shape} ${n}곡: 순위 배치 누락/중복`);
    if (l.tile < MOSAIC_MIN_TILE) fail(`모자이크 ${shape} ${n}곡: 타일 ${l.tile.toFixed(1)}px < ${MOSAIC_MIN_TILE}`);
    // 별은 뿔이 가늘어 칸이 적다 — 40곡까지만 전곡을 보장하고 그 이상은 TOP N 을 허용한다.
    const guaranteed = shape === 'star' ? 40 : 64;
    if (n <= guaranteed && l.shown !== n) fail(`모자이크 ${shape} ${n}곡: ${l.shown}곡만 들어감`);
    if (mosaicBodyHeight(l) > CARD_BODY_H + 0.5) fail(`모자이크 ${shape} ${n}곡: 본문 높이 ${mosaicBodyHeight(l).toFixed(0)} > ${CARD_BODY_H}`);
    const maxX = Math.max(...l.cells.map((c) => c.x + c.w));
    const maxY = Math.max(...l.cells.map((c) => c.y + c.h));
    if (maxX > l.width + 0.5 || maxY > l.height + 0.5) fail(`모자이크 ${shape} ${n}곡: 칸이 상자 밖 (${maxX.toFixed(1)}, ${maxY.toFixed(1)})`);
  }
}
for (const shape of SHAPES) if (!/^<svg [^>]+><path d="M[\d. L]+Z" fill="#000"\/><\/svg>$/.test(shapeSvg(shape))) fail(`마스크 SVG 형식 ${shape}`);

// 사람이 읽을 요약
for (const shape of SHAPES) {
  console.log(`  ${shape.padEnd(8)} ` + [4, 9, 10, 16, 32, 64, 80].map((n) => {
    const l = mosaicLayout(n, shape);
    return `${n}곡→${l.shown === n ? '전곡' : 'TOP' + l.shown} 타일${l.tile.toFixed(0)} 칸${l.cells.length}`;
  }).join(' · '));
}
for (const n of [1, 4, 16, 32, 64, 100]) { const p = pyramidLayout(n); console.log(`  피라미드 ${n}곡 → 줄 ${new Set(p.nodes.map((x) => x.row)).size} · 1위 ${p.nodes[0].d}px · 가장 작은 원 ${Math.min(...p.nodes.map((x) => x.d))}px · ${p.showTitles ? '제목' : `목록 ${p.listCount}곡`} · 높이 ${pyramidBodyHeight(p).toFixed(0)}`); }
for (const n of [4, 16, 32, 64]) console.log(`  리스트형 ${n}곡 → ` + listPages(n).map((p) => `${p.from + 1}–${p.to}(행${p.rowH})`).join(' / '));
for (const n of [4, 10, 32, 64]) console.log(`  레코드형 ${n}곡 → ` + recordPages(n).map((p) => `${p.from + 1}–${p.to}(${p.hero ? `LP${p.sleeve} ` : ''}행${p.rowH})`).join(' / '));

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
