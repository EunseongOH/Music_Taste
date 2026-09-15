/**
 * 임의 URL 스크린샷 헬퍼. UI 패리티 확인에 쓴다.
 *
 *   node toss/baseline/shot.mjs <url> <출력파일> [폭] [높이]
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const [url, outArg, w = '430', h = '932'] = process.argv.slice(2);

if (!url || !outArg) {
  console.error('사용법: node toss/baseline/shot.mjs <url> <출력파일> [폭] [높이]');
  process.exit(2);
}
const out = isAbsolute(outArg) ? outArg : join(HERE, outArg);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`요청 실패: ${r.url()} — ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForTimeout(1500);

// 폰트가 실제로 적용됐는지 계산된 스타일로 확인한다.
const fonts = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };
  return {
    serif: pick('.font-serif'),
    sans: pick('.font-sans'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    loaded: document.fonts ? [...document.fonts].map((f) => `${f.family}:${f.status}`) : [],
  };
});

await page.screenshot({ path: out, fullPage: true });

console.log(`font-serif : ${fonts.serif}`);
console.log(`font-sans  : ${fonts.sans}`);
console.log(`body 배경  : ${fonts.bodyBg}`);
console.log(`로드된 폰트: ${fonts.loaded.join(', ') || '(없음)'}`);
if (errors.length) {
  console.log(`\n콘솔/네트워크 오류 ${errors.length}건:`);
  for (const e of errors.slice(0, 10)) console.log('  - ' + e);
} else {
  console.log('\n콘솔/네트워크 오류 없음');
}
console.log(`\n스크린샷: ${out}`);

await browser.close();
