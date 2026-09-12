// 공유 모달 스크린샷 — 스레드 버튼이 제대로 렌더되는지 눈으로 확인한다.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const RANKING = JSON.parse(readFileSync('C:/Users/User/Music_Taste/toss/baseline/fixture.json', 'utf8'));
const OUT = 'C:/Users/User/Music_Taste/toss/baseline/share-modal.png';

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

await page.addInitScript(({ ranking }) => {
  sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
  sessionStorage.setItem('locale', 'ko');
}, { ranking: RANKING });

await page.goto('http://localhost:3000/taste', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.getByRole('button', { name: '피라미드형' }).waitFor({ state: 'visible', timeout: 180_000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: '공유하기' }).first().click();
await page.waitForTimeout(1200);

const labels = ['X (트위터)로 공유', '스레드로 공유', '카카오톡으로 공유', '인스타그램 스토리에 공유', '취향표 링크 복사하기'];
for (const l of labels) {
  const n = await page.getByRole('button', { name: l }).count();
  console.log(`  ${n ? '있음' : '없음'}  ${l}`);
}

await page.screenshot({ path: OUT });
console.log(`\n스크린샷: ${OUT}`);
await browser.close();
