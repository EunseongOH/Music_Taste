/**
 * Next 빌드와 토스(Vite) 빌드의 화면을 나란히 비교한다.
 *
 * 두 빌드가 `src/` 의 같은 컴포넌트를 공유하므로, 차이가 나면 원인은
 * shim(next/image · next/link · next/navigation)이나 앱 셸뿐이다.
 *
 *  0. 노이즈 플로어 — 같은 페이지를 두 번 찍어 렌더링이 결정적인지 확인
 *  1. 대조군 — 이미지가 없는 요소(#control)의 차이. 이게 이 비교의 환경 오차다.
 *     Next 는 LayoutWrapper 의 px-6 때문에 x=24, Vite 는 x=0 에 놓여서
 *     둥근 테두리의 안티에일리어싱이 수십 픽셀 어긋난다. shim 과 무관하므로
 *     케이스별 판정은 "대조군보다 나쁘지 않은가"로 한다.
 *  2. 케이스별 — 각 <img> 의 부모 박스만 따로 찍어 비교
 *  3. 전체 스크린샷 + 모든 <img> 의 위치·크기·계산된 스타일·DOM 속성 비교
 *
 * 사용:
 *   node toss/baseline/shim-compare.mjs            # 기본 /shim-probe
 *   node toss/baseline/shim-compare.mjs /          # 다른 경로
 *   VITE_PAGE=index.html node ... /                # Vite 쪽 진입 html 지정
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'shim-out');
mkdirSync(OUT, { recursive: true });

const ROUTE = process.argv[2] ?? '/shim-probe';
const NEXT_URL = `http://localhost:3000${ROUTE}`;
// Vite dev 는 SPA 폴백이 있어 Next 와 같은 경로를 그대로 쓴다.
const VITE_URL = `http://localhost:5173${ROUTE}`;

/**
 * 비교 대상 루트 후보. 앞에서부터 존재하는 첫 번째를 쓴다.
 * 페이지 래퍼(LayoutWrapper) 차이를 스크린샷에서 배제하기 위한 것이다.
 * 콤마 셀렉터 하나로 합치면 안 된다 — `.first()` 가 목록 순서가 아니라
 * 문서 순서를 따라서 body 가 먼저 잡힌다.
 */
const ROOT_CANDIDATES = ['#shim-probe', 'main', '#root > *', 'body'];

async function pickRoot(page) {
  for (const sel of ROOT_CANDIDATES) {
    if (await page.locator(sel).count()) return sel;
  }
  return 'body';
}

/**
 * 애니메이션(SafeImage 폴백의 animate-pulse)이 프레임마다 달라 비교를 깨뜨린다.
 * nextjs-portal 은 Next dev 오버레이 배지 — fixed 로 떠서 엘리먼트 스크린샷에
 * 섞여 들어온다. next.config.ts 의 devIndicators 를 건드리지 않고 여기서만 숨긴다.
 * .bg-grain(layout.tsx:234)은 mix-blend-mode:multiply 전역 노이즈 오버레이라
 * 한쪽에만 있으면 전체 픽셀이 1~2 씩 어두워진다. 양쪽 다 숨겨 변수를 없앤다.
 */
const FREEZE = `
  * { animation: none !important; transition: none !important; }
  nextjs-portal { display: none !important; }
  .bg-grain { display: none !important; }
`;

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function grab(page, url, label) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE });
  const sel = await pickRoot(page);
  const root = page.locator(sel).first();
  await root.waitFor();

  // 이미지 디코딩까지 끝나야 스크린샷이 안정적이다.
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : null))
    )
  );
  await page.waitForTimeout(600);

  const shot = await root.screenshot();
  writeFileSync(join(OUT, `${label}.png`), shot);

  const imgs = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const box = root.getBoundingClientRect();
    return [...root.querySelectorAll('img')].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        alt: el.alt,
        // 루트 기준 상대 좌표 — 페이지 래퍼 차이를 제거한다.
        x: +(r.x - box.x).toFixed(2),
        y: +(r.y - box.y).toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        attrs: Object.fromEntries(
          [...el.attributes]
            .map((a) => [a.name, a.value])
            // style 은 아래 computed style 로 따로 비교한다.
            // data-nimg 은 Next 내부 마커로 스타일·동작에 영향이 없고
            // src/ 어디에서도 참조하지 않으므로 shim 에서 재현하지 않는다.
            .filter(([n]) => n !== 'style' && n !== 'data-nimg')
        ),
        style: {
          position: cs.position,
          objectFit: cs.objectFit,
          objectPosition: cs.objectPosition,
          color: cs.color,
          inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`,
          borderRadius: cs.borderRadius,
        },
      };
    });
  }, sel);

  // 케이스별 비교용 — <img> 의 부모 박스만 따로 찍는다.
  const cells = [];
  const imgLoc = root.locator('img');
  for (let i = 0; i < (await imgLoc.count()); i++) {
    cells.push(await imgLoc.nth(i).locator('xpath=..').screenshot());
  }

  const ctlLoc = page.locator('#control');
  return {
    shot,
    imgs,
    cells,
    control: (await ctlLoc.count()) ? await ctlLoc.screenshot() : null,
    svgCount: await root.locator('svg').count(),
    size: { ...(await root.boundingBox()) },
  };
}

/**
 * 두 PNG 를 브라우저 canvas 로 디코딩해 픽셀 단위로 비교한다.
 * (pixelmatch 등 새 의존성을 넣지 않기 위해 이미 있는 chromium 을 쓴다)
 * 채널차 8 이하는 렌더러 반올림 수준이라 `visible` 에서 제외한다.
 */
async function pixelDiff(page, aBuf, bBuf) {
  const toUrl = (b) => `data:image/png;base64,${b.toString('base64')}`;
  return page.evaluate(
    async ([ua, ub]) => {
      const load = (u) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = u;
        });
      const [ia, ib] = await Promise.all([load(ua), load(ub)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
      }
      const data = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [data(ia), data(ib)];
      let differing = 0;
      let visible = 0;
      let maxDelta = 0;
      const samples = [];
      const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
      for (let p = 0; p < da.length; p += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(da[p + k] - db[p + k]));
        if (d === 0) continue;
        differing++;
        maxDelta = Math.max(maxDelta, d);
        if (d <= 8) continue;
        visible++;
        const px = (p / 4) % ia.width;
        const py = Math.floor(p / 4 / ia.width);
        box.x0 = Math.min(box.x0, px);
        box.y0 = Math.min(box.y0, py);
        box.x1 = Math.max(box.x1, px);
        box.y1 = Math.max(box.y1, py);
        if (samples.length < 8)
          samples.push({
            at: `${px},${py}`,
            next: [...da.slice(p, p + 4)],
            vite: [...db.slice(p, p + 4)],
          });
      }
      const at = (d, x, y) => [...d.slice((y * ia.width + x) * 4, (y * ia.width + x) * 4 + 4)];
      return {
        differing,
        visible,
        maxDelta,
        total: ia.width * ia.height,
        box,
        samples,
        bg: { next: at(da, ia.width - 20, 20), vite: at(db, ia.width - 20, 20) },
      };
    },
    [toUrl(aBuf), toUrl(bBuf)]
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 1400 },
  deviceScaleFactor: 2,
});

let failed = 0;
const bad = (m) => {
  failed++;
  console.log(`  [X] ${m}`);
};

try {
  console.log(`Next: ${NEXT_URL}\nVite: ${VITE_URL}`);

  const a = await grab(await ctx.newPage(), NEXT_URL, 'next');
  const b = await grab(await ctx.newPage(), VITE_URL, 'vite');
  const a2 = await grab(await ctx.newPage(), NEXT_URL, 'next2');
  const b2 = await grab(await ctx.newPage(), VITE_URL, 'vite2');
  const dp = await ctx.newPage();

  // 0. 노이즈 플로어 — 결정적으로 렌더되는지. 여기가 크면 아래 수치는 못 믿는다.
  console.log('\n[0] 노이즈 플로어 (같은 페이지 2회)');
  for (const [label, x, y] of [
    ['Next', a.shot, a2.shot],
    ['Vite', b.shot, b2.shot],
  ]) {
    const f = await pixelDiff(dp, x, y);
    const note = f.visible > 0 ? '  ← 비결정적! 아래 수치 신뢰 불가' : '';
    console.log(
      `  ${label}: ${f.differing}px 차이 / 보이는 차이 ${f.visible}px / 최대 ${f.maxDelta}${note}`
    );
    if (f.visible > 0) failed++;
  }

  // 1. 대조군 — 이미지가 없는 요소. 이 값이 환경 오차의 크기다.
  let tolerance = 0;
  if (a.control && b.control) {
    const c = await pixelDiff(dp, a.control, b.control);
    tolerance = c.visible;
    console.log(
      `\n[1] 대조군 (이미지 없는 div): 보이는 차이 ${c.visible}px / 최대 ${c.maxDelta}\n` +
        `    → 환경 오차. Next 는 x=${a.size.x}, Vite 는 x=${b.size.x} 에 놓여` +
        ` 둥근 테두리 AA 가 어긋난다. 케이스 판정 허용치로 쓴다.`
    );
  } else {
    console.log('\n[1] 대조군 없음 (#control) — 허용치 0 으로 엄격히 비교한다.');
  }

  // 2. 케이스별
  console.log(`\n[2] 케이스별 (부모 박스 단위, 허용치 ${tolerance}px)`);
  for (let i = 0; i < Math.min(a.cells.length, b.cells.length); i++) {
    const alt = a.imgs[i]?.alt ?? i;
    if (sha(a.cells[i]) === sha(b.cells[i])) {
      console.log(`  [O] img[${i}] ${alt} — 바이트 동일`);
      continue;
    }
    const d = await pixelDiff(dp, a.cells[i], b.cells[i]);
    if (d.sizeMismatch) {
      bad(`img[${i}] ${alt} 크기 불일치 ${d.sizeMismatch}`);
    } else if (d.visible > tolerance) {
      writeFileSync(join(OUT, `cell-${alt}-next.png`), a.cells[i]);
      writeFileSync(join(OUT, `cell-${alt}-vite.png`), b.cells[i]);
      bad(`img[${i}] ${alt} 보이는 차이 ${d.visible}px > 허용치 (최대 ${d.maxDelta})`);
    } else {
      console.log(
        `  [O] img[${i}] ${alt} — 보이는 차이 ${d.visible}px (허용치 내, 최대 ${d.maxDelta})`
      );
    }
  }

  // 3. 구조 비교
  console.log('\n[3] 구조 / 스타일 / DOM 속성');
  console.log(
    `  Next ${a.imgs.length} img / ${a.svgCount} svg / ${a.size.width}x${a.size.height}\n` +
      `  Vite ${b.imgs.length} img / ${b.svgCount} svg / ${b.size.width}x${b.size.height}`
  );
  if (a.imgs.length !== b.imgs.length) bad('<img> 개수 불일치');
  if (a.svgCount !== b.svgCount) bad('<svg> 개수 불일치');
  if (a.size.width !== b.size.width || a.size.height !== b.size.height)
    bad('루트 크기 불일치 → 레이아웃 차이');

  for (let i = 0; i < Math.min(a.imgs.length, b.imgs.length); i++) {
    const [x, y] = [a.imgs[i], b.imgs[i]];
    const tag = `img[${i}] ${x.alt}`;
    for (const k of ['x', 'y', 'w', 'h'])
      if (x[k] !== y[k]) bad(`${tag} ${k}: Next ${x[k]} vs Vite ${y[k]}`);
    for (const k of Object.keys(x.style))
      if (x.style[k] !== y.style[k])
        bad(`${tag} ${k}: Next "${x.style[k]}" vs Vite "${y.style[k]}"`);
    for (const k of Object.keys(y.attrs)) {
      if (!(k in x.attrs)) bad(`${tag} DOM 속성 누출: ${k}="${y.attrs[k]}"`);
      // src 는 Next dev 가 절대 URL 로 바꿔서 문자열이 다르다. 실제 리소스는 같다.
      else if (x.attrs[k] !== y.attrs[k] && k !== 'src')
        bad(`${tag} 속성 ${k}: Next "${x.attrs[k]}" vs Vite "${y.attrs[k]}"`);
    }
    for (const k of Object.keys(x.attrs))
      if (!(k in y.attrs)) bad(`${tag} 속성 누락: ${k}="${x.attrs[k]}"`);
  }

  // 4. 전체 화면
  console.log('\n[4] 전체 화면');
  if (sha(a.shot) === sha(b.shot)) {
    console.log('  [O] 바이트 동일');
  } else {
    const d = await pixelDiff(dp, a.shot, b.shot);
    if (d.sizeMismatch) {
      bad(`크기 불일치 ${d.sizeMismatch}`);
    } else {
      console.log(
        `  배경: Next rgba(${d.bg.next}) / Vite rgba(${d.bg.vite})\n` +
          `  차이: ${d.differing}/${d.total} (${((d.differing / d.total) * 100).toFixed(2)}%), ` +
          `보이는 차이 ${d.visible}px, 최대 ${d.maxDelta}`
      );
      // 전체 화면은 요소가 여러 개라 대조군 오차가 그만큼 누적된다.
      if (d.visible > tolerance * 2) {
        bad(`전체 보이는 차이 ${d.visible}px, 영역 x${d.box.x0}-${d.box.x1} y${d.box.y0}-${d.box.y1}`);
        for (const s of d.samples)
          console.log(`      (${s.at}) Next rgba(${s.next}) vs Vite rgba(${s.vite})`);
      } else {
        console.log('  [O] 누적 환경 오차 범위 내');
      }
    }
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
