/**
 * Next 와 토스(Vite) 빌드의 화면 텍스트를 비교한다.
 * 픽셀 비교에서 "한쪽에만 글자가 있다" 가 나왔을 때 무엇인지 찾기 위한 도구.
 *
 * 사용: MSYS_NO_PATHCONV=1 node toss/baseline/text-diff.mjs /
 */
import { chromium } from 'playwright';
import { nextBase, vite } from './base.mjs';

const ROUTE = process.argv[2] ?? '/';

async function read(url) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`요청 실패: ${r.url()}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const nodes = await page.evaluate(() => {
    const root = document.querySelector('main') ?? document.body;
    const out = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push(`${Math.round(r.y)}\t${t}`);
    }
    return out;
  });
  return { nodes, errors, page };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 1400 },
  deviceScaleFactor: 2,
});

try {
  const a = await read(`${nextBase()}${ROUTE}`);
  // Vite dev 는 SPA 폴백이 있어 같은 경로를 그대로 쓸 수 있다.
  const b = await read(`${vite()}${ROUTE}`);

  const setB = new Set(b.nodes.map((s) => s.split('\t')[1]));
  const setA = new Set(a.nodes.map((s) => s.split('\t')[1]));

  const onlyA = a.nodes.filter((s) => !setB.has(s.split('\t')[1]));
  const onlyB = b.nodes.filter((s) => !setA.has(s.split('\t')[1]));

  console.log(`Next 텍스트 노드 ${a.nodes.length}개 / Vite ${b.nodes.length}개\n`);
  console.log(`Next 에만 있는 텍스트 (${onlyA.length})`);
  for (const s of onlyA) console.log(`  y=${s}`);
  console.log(`\nVite 에만 있는 텍스트 (${onlyB.length})`);
  for (const s of onlyB) console.log(`  y=${s}`);

  for (const [label, r] of [
    ['Next', a],
    ['Vite', b],
  ]) {
    if (r.errors.length) {
      console.log(`\n${label} 오류 ${r.errors.length}건`);
      for (const e of [...new Set(r.errors)].slice(0, 12)) console.log(`  ${e}`);
    } else {
      console.log(`\n${label} 콘솔/네트워크 오류 없음`);
    }
  }
} finally {
  await browser.close();
}
