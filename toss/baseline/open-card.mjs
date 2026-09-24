/**
 * 취향 기록표 화면을 **사람이 직접 만져 볼 수 있게** 띄운다.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/open-card.mjs
 *
 * `/taste` 는 sessionStorage 의 순위가 있어야 열린다. 매번 소트를 끝내지 않아도
 * 되게 픽스처를 심어 두고 창을 열어 둔다. 창을 닫으면 이 스크립트도 끝난다.
 *
 * 운영 DB 에는 아무것도 쓰지 않는다 — 로그인하지 않으므로 자동 저장이 돌지 않고,
 * `?preview=1` 로 한 번 더 막는다.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const BASE = nextBase();

const browser = await chromium.launch({ headless: false, args: ['--window-size=460,1000'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await ctx.newPage();
await page.addInitScript((r) => {
  sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
  sessionStorage.setItem('locale', 'ko');
}, RANKING);

console.log(`\n창을 띄웁니다 — ${BASE}/taste?preview=1`);
console.log('템플릿 탭 4개, 왼쪽 아래 동그라미로 색 바꾸기를 눌러 보세요.');
console.log('창을 닫으면 끝납니다.\n');

await page.goto(`${BASE}/taste?preview=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

// 창이 닫힐 때까지 붙잡아 둔다.
await new Promise((resolve) => {
  browser.on('disconnected', resolve);
  page.on('close', resolve);
});
console.log('창이 닫혔습니다.');
