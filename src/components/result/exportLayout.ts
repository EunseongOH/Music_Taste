/**
 * 9:16 취향표 카드(450×800)의 장 나누기와 모양 모자이크 배치.
 *
 * 화면에 보이는 카드와 저장되는 이미지가 같은 계산을 쓴다. 순수 함수만 두어
 * `node --experimental-strip-types toss/baseline/layout-check.mjs` 로 곡 수·모양
 * 전 조합을 검사한다 — 여기를 고치면 그 검사를 같이 돌린다.
 */

/** 카드 본문(머리말·꼬리말을 뺀 영역)의 안전 높이. 450×800 카드 기준. */
export const CARD_BODY_H = 600;
/** 카드 좌우 여백을 뺀 폭. */
export const CARD_INNER_W = 386;

// ---------------------------------------------------------------------------
// 리스트형
// ---------------------------------------------------------------------------

/** 1장의 1–3위 행 높이와, 1–3위와 나머지 사이 간격. */
export const LIST_FEATURE_H = 56;
export const LIST_TOP_GAP = 10;
/** 일반 행 높이 범위. 곡이 적은 장은 남는 높이만큼 행·재킷을 키워 빈 공간을 줄인다. */
export const LIST_ROW_MIN = 26;
/** 곡이 적은 장은 행을 여기까지 키운다(56px 이상이면 제목·아티스트 두 줄). */
export const LIST_ROW_MAX = 60;
/** 한 장 전체가 큰 행(10곡 이하)일 때의 범위. */
const LIST_BIG_MIN = 60;
const LIST_BIG_MAX = 120;

export interface ListPage {
  from: number; // 0-based, 포함
  to: number; // 제외
  /** 1–3위를 크게 그리는 첫 장인지 */
  hasFeature: boolean;
  /** 1–3위를 뺀 나머지 행의 높이(px) */
  rowH: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const FEATURE_BLOCK = 3 * LIST_FEATURE_H + LIST_TOP_GAP;

/** 한 장에 들어가는 최대 곡 수: 1장은 1–3위가 크게 들어가 18곡, 나머지 장은 22곡. */
const LIST_FIRST_MAX = 3 + Math.floor((CARD_BODY_H - FEATURE_BLOCK) / LIST_ROW_MIN);
const LIST_PAGE_MAX = Math.floor(CARD_BODY_H / LIST_ROW_MIN);

/**
 * 곡 수를 여러 장에 **첫 장까지 포함해 고르게** 나눈다. 장 수는 가장 적게,
 * 장마다 곡 수는 비슷하게 — 20곡이 18+2 가 아니라 10+10 이 된다.
 * `sizes[0]` 은 firstMax 이하, 나머지는 restMax 이하.
 */
export function splitEvenly(n: number, firstMax: number, restMax: number): number[] {
  if (n <= 0) return [];
  if (n <= firstMax) return [n];
  const pages = 1 + Math.ceil((n - firstMax) / restMax);
  const first = Math.min(firstMax, Math.ceil(n / pages));
  const rest = n - first;
  const restPages = pages - 1;
  const base = Math.floor(rest / restPages);
  return [first, ...Array.from({ length: restPages }, (_, i) => base + (i < rest - base * restPages ? 1 : 0))];
}

/**
 * - 10곡 이하: 한 장, 모든 곡을 큰 행으로(곡이 적을수록 더 크게)
 * - 그 이상: 1장은 1–3위를 크게. 장 수를 정한 뒤 곡을 고르게 나누고,
 *   남는 높이는 행·재킷을 키워 채운다.
 */
export function listPages(n: number): ListPage[] {
  if (n <= 0) return [];
  if (n <= 10) return [{ from: 0, to: n, hasFeature: false, rowH: clamp(Math.floor(CARD_BODY_H / n), LIST_BIG_MIN, LIST_BIG_MAX) }];

  const sizes = splitEvenly(n, LIST_FIRST_MAX, LIST_PAGE_MAX);
  const pages: ListPage[] = [];
  let from = 0;
  sizes.forEach((size, i) => {
    const to = from + size;
    const rowH =
      i === 0
        ? clamp(Math.floor((CARD_BODY_H - FEATURE_BLOCK) / Math.max(1, size - 3)), LIST_ROW_MIN, LIST_ROW_MAX)
        : clamp(Math.floor(CARD_BODY_H / size), LIST_ROW_MIN, LIST_ROW_MAX);
    pages.push({ from, to, hasFeature: i === 0, rowH });
    from = to;
  });
  return pages;
}

export function listPageHeight(p: ListPage): number {
  const rows = p.to - p.from;
  if (!p.hasFeature) return rows * p.rowH;
  const top = Math.min(3, rows);
  return top * LIST_FEATURE_H + (rows > 3 ? LIST_TOP_GAP + (rows - 3) * p.rowH : 0);
}

// ---------------------------------------------------------------------------
// 레코드형
// ---------------------------------------------------------------------------

/** 1위 곡 정보 블록(1위·제목 두 줄·아티스트)과 위아래 간격. */
export const RECORD_INFO_H = 112;
const RECORD_GAPS = 32;
const RECORD_ROW_MIN = 28;
/** 1장(LP 가 있는 장)의 행 최대 높이. 남는 높이는 LP 가 먼저 가져간다. */
const RECORD_HERO_ROW_MAX = 44;
/** 2장 이후 행 최대 높이. 곡이 적은 장은 행과 레코드를 키워 채운다. */
export const RECORD_ROW_MAX = 96;
const SLEEVE_MIN = 180;
/** 슬리브 + 옆으로 빠져나온 LP 묶음 폭은 슬리브의 1.44배 — 카드 폭(386) 안에 들어가는 최대치. */
export const RECORD_GROUP_RATIO = 1.44;
const SLEEVE_MAX = Math.floor(CARD_INNER_W / RECORD_GROUP_RATIO);

export interface RecordPage {
  from: number;
  to: number;
  hero: boolean;
  /** 슬리브(1위 커버) 한 변. 1장에만 쓴다. 목록이 짧을수록 커진다. */
  sleeve: number;
  rowH: number;
}

/**
 * 1장 = 1위 LP + 순위 목록(최대 10위까지), 이후 장은 20곡 이하.
 * 장 수를 정한 뒤 첫 장까지 고르게 나눈다(12곡이 10+2 가 아니라 6+6).
 * 1장 목록이 짧을수록 LP 가 커진다.
 */
export function recordPages(n: number): RecordPage[] {
  if (n <= 0) return [];
  const sizes = splitEvenly(n, 10, 20);
  const room = CARD_BODY_H - RECORD_INFO_H - RECORD_GAPS;
  const pages: RecordPage[] = [];
  let from = 0;
  sizes.forEach((size, i) => {
    const to = from + size;
    if (i === 0) {
      const heroRows = size - 1;
      const sleeve = clamp(room - heroRows * RECORD_ROW_MIN, SLEEVE_MIN, SLEEVE_MAX);
      pages.push({
        from,
        to,
        hero: true,
        sleeve,
        rowH: heroRows ? clamp(Math.floor((room - sleeve) / heroRows), RECORD_ROW_MIN, RECORD_HERO_ROW_MAX) : RECORD_ROW_MIN,
      });
    } else {
      pages.push({ from, to, hero: false, sleeve: 0, rowH: clamp(Math.floor(CARD_BODY_H / size), RECORD_ROW_MIN, RECORD_ROW_MAX) });
    }
    from = to;
  });
  return pages;
}

export function recordPageHeight(p: RecordPage): number {
  const rows = p.to - p.from - (p.hero ? 1 : 0);
  if (!p.hero) return rows * p.rowH;
  return p.sleeve + RECORD_INFO_H + RECORD_GAPS + rows * p.rowH;
}

// ---------------------------------------------------------------------------
// 모자이크형 (모양 틀)
// ---------------------------------------------------------------------------

export type Shape = "heart" | "star" | "circle" | "triangle";
export const SHAPES: Shape[] = ["heart", "star", "circle", "triangle"];

type Pt = [number, number];

/** 점들을 0–100 상자에 꽉 차게 맞춘다(여백 1). */
function fit(points: Pt[]): Pt[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return points.map(([x, y]) => [1 + ((x - minX) / (maxX - minX)) * 98, 1 + ((y - minY) / (maxY - minY)) * 98]);
}

/**
 * 모양 하나를 다각형 하나로 정의한다. 마스크 SVG 와 "칸이 모양 안에 보이는지" 계산이
 * 같은 점을 쓰므로 둘이 어긋나지 않는다.
 */
const POLYGONS: Record<Shape, Pt[]> = {
  // 고전 하트 곡선 x=16sin³t, y=13cos t−5cos2t−2cos3t−cos4t (y 는 화면 방향으로 뒤집음)
  heart: fit(
    Array.from({ length: 96 }, (_, i) => {
      const t = (i / 96) * Math.PI * 2;
      return [
        16 * Math.sin(t) ** 3,
        -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      ] as Pt;
    })
  ),
  star: fit(
    Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 0.42 : 1;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
    })
  ),
  circle: fit(Array.from({ length: 72 }, (_, i) => [Math.cos((i / 72) * Math.PI * 2), Math.sin((i / 72) * Math.PI * 2)] as Pt)),
  triangle: [
    [50, 1],
    [99, 99],
    [1, 99],
  ],
};

/** 모양 상자의 세로/가로 비. 원은 반드시 1 이어야 원으로 보인다. */
export const SHAPE_ASPECT: Record<Shape, number> = { heart: 0.92, star: 0.95, circle: 1, triangle: 0.88 };
/** 1위를 놓을 시각적 중심(0–100). 모양이 가장 두꺼운 곳이다. */
const SHAPE_CENTER: Record<Shape, Pt> = { heart: [50, 40], star: [50, 55], circle: [50, 50], triangle: [50, 66] };

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 마스크용 SVG(투명 바탕 + 채운 다각형). CSS mask 는 알파로 자른다. */
export function shapeSvg(shape: Shape): string {
  const d = "M" + POLYGONS[shape].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}" fill="#000"/></svg>`;
}

export interface MosaicCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 이 칸에 놓인 곡의 순위 인덱스(0 = 1위). 곡이 없는 채움 칸이면 null */
  rank: number | null;
}

export interface MosaicLayout {
  width: number;
  height: number;
  cells: MosaicCell[];
  /** 전체 곡 수 */
  total: number;
  /** 실제로 모양 안에 놓인 곡 수(나머지는 "외 n곡") */
  shown: number;
  tile: number;
  /** 9곡 이하처럼 타일이 크면 제목을 타일 위에, 아니면 순위 배지 + 아래 목록 */
  labelMode: "overlay" | "badge";
  /** badge 모드에서 아래 목록에 넣을 곡 수 */
  listCount: number;
  listRows: number;
}

export const MOSAIC_GAP = 2;
/** 두 자리 순위 배지(16px)가 가리지 않고 커버가 보이는 하한 */
export const MOSAIC_MIN_TILE = 28;
export const MOSAIC_LIST_ROW_H = 19;
export const MOSAIC_LIST_GAP = 14;
const OVERLAY_MAX = 9;
/** 곡을 놓을 수 있는 칸: 가운데가 모양 안이고, 칸의 절반 가까이가 보여야 한다. */
const MIN_VISIBLE = 0.45;

function gridFor(shape: Shape, width: number, height: number, cols: number) {
  const poly = POLYGONS[shape];
  const tileW = (width - MOSAIC_GAP * (cols - 1)) / cols;
  const rows = Math.max(1, Math.round((height + MOSAIC_GAP) / (tileW + MOSAIC_GAP)));
  const tileH = (height - MOSAIC_GAP * (rows - 1)) / rows;
  const cells: (MosaicCell & { eligible: boolean; dist: number })[] = [];
  const [cx, cy] = SHAPE_CENTER[shape];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (tileW + MOSAIC_GAP);
      const y = r * (tileH + MOSAIC_GAP);
      // 0–100 좌표로 4×4 표본을 찍어 보이는 비율을 잰다.
      let seen = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const px = ((x + ((i + 0.5) / 4) * tileW) / width) * 100;
          const py = ((y + ((j + 0.5) / 4) * tileH) / height) * 100;
          if (inside([px, py], poly)) seen++;
        }
      }
      const mx = ((x + tileW / 2) / width) * 100;
      const my = ((y + tileH / 2) / height) * 100;
      const eligible = seen / 16 >= MIN_VISIBLE && inside([mx, my], poly);
      // 세로는 조금 더 무겁게 — 같은 거리면 위쪽 행이 먼저 온다.
      const dist = Math.hypot(mx - cx, (my - cy) * 1.15) + r * 0.01 + c * 0.001;
      cells.push({ x, y, w: tileW, h: tileH, rank: null, eligible, dist });
    }
  }
  return { cells, tile: Math.min(tileW, tileH), eligibleCount: cells.filter((c) => c.eligible).length };
}

/**
 * 모양 모자이크 배치.
 *
 * 커버 타일로 사각형을 채우고 모양 마스크로 자른다. 가장자리 칸은 대부분 잘려서
 * 그대로 곡을 놓으면 곡이 사라진다 — 그래서 "보이는 칸"에만 곡을 놓고, 나머지는
 * 채움 칸으로 둬 실루엣만 이어 준다. 1위는 모양의 중심, 순위가 내려갈수록 바깥.
 *
 * 열 수를 1부터 늘려 가며 곡이 다 들어가는 가장 큰 타일을 고른다. 타일이
 * MOSAIC_MIN_TILE 보다 작아지면 그 직전 크기에서 들어가는 만큼만 놓는다(TOP N).
 */
export function mosaicLayout(n: number, shape: Shape, bodyH = CARD_BODY_H): MosaicLayout {
  const want = Math.max(0, n);
  const labelMode: MosaicLayout["labelMode"] = want <= OVERLAY_MAX ? "overlay" : "badge";

  // badge 모드는 아래 목록이 최소 4줄은 들어가게 모양 상자를 줄인다.
  const minList = labelMode === "badge" ? MOSAIC_LIST_GAP + 4 * MOSAIC_LIST_ROW_H : 150;
  let width = CARD_INNER_W;
  let height = width * SHAPE_ASPECT[shape];
  if (height > bodyH - minList) {
    height = bodyH - minList;
    width = height / SHAPE_ASPECT[shape];
  }

  let chosen: ReturnType<typeof gridFor> | null = null;
  let lastFit: ReturnType<typeof gridFor> | null = null;
  for (let cols = 1; cols <= 16; cols++) {
    const g = gridFor(shape, width, height, cols);
    if (g.tile < MOSAIC_MIN_TILE) break;
    lastFit = g;
    if (g.eligibleCount >= want) {
      chosen = g;
      break;
    }
  }
  const grid = chosen ?? lastFit ?? gridFor(shape, width, height, 1);
  const shown = Math.min(want, grid.eligibleCount);

  const order = grid.cells.filter((c) => c.eligible).sort((a, b) => a.dist - b.dist);
  order.slice(0, shown).forEach((c, i) => (c.rank = i));

  const cells = grid.cells.map(({ x, y, w, h, rank }) => ({ x, y, w, h, rank }));

  let listCount = 0;
  let listRows = 0;
  if (labelMode === "badge") {
    const rowsFit = Math.floor((bodyH - height - MOSAIC_LIST_GAP) / MOSAIC_LIST_ROW_H);
    const needRows = Math.ceil(n / 2);
    if (needRows <= rowsFit) {
      listRows = needRows;
      listCount = n;
    } else {
      // 마지막 한 줄은 "외 n곡" 자리로 남긴다.
      listRows = rowsFit - 1;
      listCount = listRows * 2;
    }
  }

  return { width, height, cells, total: want, shown, tile: grid.tile, labelMode, listCount, listRows };
}

/** badge 모드 본문 높이(모양 + 간격 + 목록 + "외 n곡" 줄). overlay 모드는 모양 높이만. */
export function mosaicBodyHeight(l: MosaicLayout): number {
  if (l.labelMode === "overlay") return l.height;
  return l.height + MOSAIC_LIST_GAP + (l.listRows + (l.listCount < l.total ? 1 : 0)) * MOSAIC_LIST_ROW_H;
}

// ---------------------------------------------------------------------------
// 피라미드형 — 1위가 꼭대기, 순위가 뱀 모양 경로로 이어진다
// ---------------------------------------------------------------------------

/** 윗줄부터 1, 2, 3 … 곡씩. 남는 곡은 아랫줄부터 하나씩 더 얹는다. */
export function pyramidRowSizes(n: number): number[] {
  if (n <= 0) return [];
  const sizes: number[] = [];
  let current = 1;
  let remaining = n;
  while (remaining >= current) {
    sizes.push(current);
    remaining -= current;
    current++;
  }
  let idx = sizes.length - 1;
  while (remaining > 0) {
    sizes[idx]++;
    remaining--;
    idx--;
    if (idx < 1) idx = sizes.length - 1;
  }
  return sizes;
}

export interface PyramidNode {
  /** 0 = 1위 */
  rank: number;
  row: number;
  /** 노드 중심 */
  x: number;
  y: number;
  /** 원 지름 */
  d: number;
  /** 제목 칸 폭 */
  labelW: number;
}

export interface PyramidLayout {
  width: number;
  height: number;
  /** 순위 순서(0 = 1위) */
  nodes: PyramidNode[];
  /** 꼴찌에서 1위까지 이어지는 SVG path(아래에서 위로 그린다) */
  path: string;
  /** 경로 시작부터 각 순위 노드에 닿을 때까지의 거리(순위 순서) */
  reachAt: number[];
  pathLength: number;
  showTitles: boolean;
  /** 제목을 못 넣는 크기면 아래에 붙일 번호 목록 */
  listCount: number;
  listRows: number;
  total: number;
}

const PYR_ROW_CAP = [150, 96, 80, 68];
const PYR_GAP_X = 8;
/** 이보다 작은 원에는 제목을 달지 않는다(12px 한글 두 줄이 원 폭 안에서 읽히지 않는다). */
export const PYR_TITLE_MIN_D = 44;
export const PYR_MIN_D = 18;
const PYR_LABEL_GAP = 4;

export function pyrLabelH(d: number) {
  return (d >= 80 ? 2 * 17 : 2 * 15) + PYR_LABEL_GAP;
}

function cubicLength(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  let len = 0;
  let prev = p0;
  for (let s = 1; s <= 16; s++) {
    const t = s / 16;
    const mt = 1 - t;
    const x = mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0];
    const y = mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1];
    len += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
  }
  return len;
}

/**
 * 피라미드 배치. 줄마다 원 크기를 폭에 맞추고(윗줄일수록 크게), 전체 높이가 maxH 안에
 * 들어갈 때까지 배율을 줄인다. 원이 작아 제목을 못 달면 아래 번호 목록 자리를 남긴다.
 */
export function pyramidLayout(n: number, width = CARD_INNER_W, maxH = CARD_BODY_H): PyramidLayout {
  const sizes = pyramidRowSizes(n);
  if (n <= 0) return { width, height: 0, nodes: [], path: "", reachAt: [], pathLength: 1, showTitles: true, listCount: 0, listRows: 0, total: 0 };

  type Pick = { ds: number[]; rowGap: number; showTitles: boolean; rowsH: number; listRows: number; listCount: number };
  let best: Pick | null = null;
  for (let k = 1.6; k >= 0.2; k -= 0.04) {
    const ds: number[] = [];
    sizes.forEach((S, r) => {
      const cap = PYR_ROW_CAP[Math.min(r, PYR_ROW_CAP.length - 1)] * k;
      const fitW = (width - PYR_GAP_X * (S - 1)) / S;
      const prev = r > 0 ? ds[r - 1] : Infinity;
      ds.push(Math.floor(Math.max(PYR_MIN_D, Math.min(cap, fitW, prev))));
    });
    const minD = Math.min(...ds);
    const showTitles = minD >= PYR_TITLE_MIN_D;
    const rowGap = Math.max(6, Math.min(14, Math.round(minD * 0.35)));
    const rowsH = ds.reduce((a, d) => a + d + (showTitles ? pyrLabelH(d) : 0), 0) + rowGap * (sizes.length - 1);

    let listRows = 0;
    let listCount = 0;
    let fits = rowsH <= maxH;
    if (fits && !showTitles) {
      const rowsFit = Math.floor((maxH - rowsH - MOSAIC_LIST_GAP) / MOSAIC_LIST_ROW_H);
      const needRows = Math.ceil(n / 2);
      // 제목을 못 다는 크기면 목록이 곡을 알려주는 유일한 곳이다 — 최소 20곡(또는 전곡)은 보이게
      // 피라미드를 더 줄인다.
      const minRows = Math.min(needRows, 11);
      if (rowsFit < minRows) {
        fits = false;
      } else if (needRows <= rowsFit) {
        listRows = needRows;
        listCount = n;
      } else {
        listRows = rowsFit - 1; // 마지막 줄은 "외 n곡"
        listCount = listRows * 2;
      }
    }
    best = { ds, rowGap, showTitles, rowsH, listRows, listCount };
    if (fits) break;
  }
  const { ds, rowGap, showTitles, rowsH, listRows, listCount } = best as Pick;

  // 순위 → 좌표. 줄마다 방향을 바꿔(지그재그) 경로가 끊기지 않게 한다.
  const nodes: PyramidNode[] = new Array(n);
  let top = 0;
  let rank = 0;
  sizes.forEach((S, r) => {
    const d = ds[r];
    const pitch = Math.min(width / S, d + Math.max(PYR_GAP_X, d * 0.6));
    const offset = (width - pitch * S) / 2;
    const leftToRight = r % 2 === 1;
    for (let j = 0; j < S; j++) {
      const col = leftToRight ? j : S - 1 - j;
      nodes[rank] = { rank, row: r, x: offset + pitch * (col + 0.5), y: top + d / 2, d, labelW: Math.max(d, pitch - 4) };
      rank++;
    }
    top += d + (showTitles ? pyrLabelH(d) : 0) + rowGap;
  });

  // 꼴찌 → 1위 경로
  const reachAt = new Array(n).fill(0);
  let dPath = `M${nodes[n - 1].x.toFixed(1)} ${nodes[n - 1].y.toFixed(1)}`;
  let acc = 0;
  for (let i = n - 1; i > 0; i--) {
    const a = nodes[i];
    const b = nodes[i - 1];
    const p0: Pt = [a.x, a.y];
    const p3: Pt = [b.x, b.y];
    let p1: Pt;
    let p2: Pt;
    if (a.row === b.row) {
      p1 = [a.x + (b.x - a.x) / 3, a.y];
      p2 = [a.x + (2 * (b.x - a.x)) / 3, b.y];
    } else {
      // 윗줄로 올라갈 때는 바깥쪽으로 둥글게 돌아 제목을 가로지르지 않게 한다.
      const side = a.x >= width / 2 ? 1 : -1;
      const dy = a.y - b.y;
      const out = Math.max(10, Math.min(28, a.d * 0.5));
      p1 = [a.x + side * out, a.y - dy * 0.45];
      p2 = [b.x + side * out, b.y + dy * 0.45];
    }
    dPath += ` C${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} ${p3[0].toFixed(1)} ${p3[1].toFixed(1)}`;
    acc += a.row === b.row ? Math.hypot(b.x - a.x, b.y - a.y) : cubicLength(p0, p1, p2, p3);
    reachAt[i - 1] = acc;
  }

  return { width, height: rowsH, nodes, path: dPath, reachAt, pathLength: acc || 1, showTitles, listCount, listRows, total: n };
}

export function pyramidBodyHeight(l: PyramidLayout): number {
  if (l.showTitles) return l.height;
  return l.height + MOSAIC_LIST_GAP + (l.listRows + (l.listCount < l.total ? 1 : 0)) * MOSAIC_LIST_ROW_H;
}
