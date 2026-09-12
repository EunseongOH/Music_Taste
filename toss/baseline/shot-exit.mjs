/**
 * 종료 플로우 검증 — router.push("/") 전환이 실제로 동작하고
 * 문서 전체 리로드 없이(=클라이언트 내비게이션) 홈으로 가는지 확인한다.
 *
 *   node toss/baseline/shot-exit.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = await ctx.newPage();

await ctx.route('**://i.scdn.co/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#c8b8a0"/></svg>',
  })
);

await page.addInitScript(
  ({ ranking }) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
    sessionStorage.setItem('locale', 'ko');
  },
  { ranking: RANKING }
);

await page.goto('http://localhost:3000/taste', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.getByRole('button', { name: '피라미드형' }).waitFor({ state: 'visible', timeout: 180_000 });
await page.waitForTimeout(1200);

// 이 표식이 살아남으면 문서 리로드가 없었다는 뜻이다.
await page.evaluate(() => {
  window.__survivedReload = true;
});

const before = page.url();
// 종료 버튼은 아이콘 전용이고 접근성 이름이 title 속성에서 온다.
await page.locator('button[title="종료하기"]').first().click();
await page.waitForTimeout(800);

// 게스트는 "저장하지 않고 나가기" 모달을 거친다.
const leave = page.getByRole('button', { name: '저장하지 않고 나가기' });
if (await leave.count()) {
  console.log('  게스트 종료 모달 노출됨 → "저장하지 않고 나가기" 클릭');
  await leave.first().click();
} else {
  console.log('  종료 모달 없음 (즉시 종료 경로)');
}

await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);

const survived = await page.evaluate(() => window.__survivedReload === true);
const storageCleared = await page.evaluate(() => ({
  ranking: sessionStorage.getItem('worldcup_ranking'),
  tracks: sessionStorage.getItem('worldcup_tracks'),
  artists: localStorage.getItem('selectedArtists'),
}));

console.log(`\n  이동 전 URL : ${before}`);
console.log(`  이동 후 URL : ${page.url()}`);
console.log(`  문서 리로드 없음(클라이언트 내비게이션): ${survived ? '예' : '아니오 — 전체 리로드됨'}`);
console.log(`  스토리지 정리: ranking=${storageCleared.ranking} tracks=${storageCleared.tracks} artists=${storageCleared.artists}`);

await page.screenshot({ path: join(HERE, 'exit-home.png') });
console.log(`  스크린샷: ${join(HERE, 'exit-home.png')}`);

await browser.close();
