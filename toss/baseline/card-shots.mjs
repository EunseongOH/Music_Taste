/**
 * 취향 기록표 카드 — 템플릿·팔레트별 확인용 캡처.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/card-shots.mjs
 *
 * 운영 DB 에 아무것도 쓰지 않는다(비로그인 + 순위 fixture 만 심는다).
 * 출력: toss/baseline/out/cards/
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out', 'cards');
const BASE = nextBase();
mkdirSync(OUT, { recursive: true });

const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const TEMPLATES = [
  ['retro', '레코드형'],
  ['list', '리스트형'],
  ['mosaic', '모자이크형'],
  ['poster', '포스터형'],
];

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' });
// 재킷은 고정 색으로 대체해 네트워크에 기대지 않는다.
await ctx.route('**://i.scdn.co/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#8c7f6d"/></svg>',
  })
);
const page = await ctx.newPage();
await page.addInitScript((r) => {
  sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
  sessionStorage.setItem('locale', 'ko');
}, RANKING);

console.log(`대상 ${BASE} · 출력 ${OUT}`);
await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });

/** 저장 이미지와 같은 DOM(오프스크린 카드)을 그대로 찍는다 — 화면 축소본이 아니다. */
const shootCard = async (name) => {
  await page.waitForTimeout(900);
  const card = page.locator('#export-card-0');
  await page.evaluate(() => {
    const el = document.getElementById('export-card-0');
    Object.assign(el.parentElement.style, { position: 'fixed', top: '0', left: '0', zIndex: '99999' });
  });
  await page.waitForTimeout(400);
  writeFileSync(join(OUT, `${name}.png`), await card.screenshot());
  await page.evaluate(() => {
    const el = document.getElementById('export-card-0');
    Object.assign(el.parentElement.style, { position: '', top: '', left: '', zIndex: '' });
  });
  console.log(`  ${name}.png`);
};

for (const [id, label] of TEMPLATES) {
  await page.getByRole('tab', { name: label }).click();
  await shootCard(`1-${id}`);
}

/* 지운 문구가 정말 사라졌는지. 카드 DOM 전체를 글로 읽어 본다. */
const cardText = await page.locator('#export-card-0').innerText();
check(!/SORTED BY ME/.test('') && /SORTED BY ME/.test(cardText), '포스터 상단이 SORTED BY ME');
check(!/전체 \d+곡/.test(cardText), '포스터 하단에서 "전체 n곡" 사라짐');
check(!/최애 곡 소트하기 · /.test(cardText.split('sortify.kr')[0].slice(-40)), '포스터 하단은 sortify.kr 만');

// 여러 장 나오는 레코드형에서 range 문구가 없어야 한다.
await page.getByRole('tab', { name: '레코드형' }).click();
await page.waitForTimeout(900);
const pages = await page.locator('[id^="export-card-"]').count();
const all = await page.locator('[id^="export-card-"]').allInnerTexts();
const joined = all.join('\n');
check(pages > 1, `레코드형이 여러 장 — ${pages}장`);
check(!/\d+–\d+위/.test(joined), '레코드형에 "11–20위" 없음');
await page.getByRole('tab', { name: '리스트형' }).click();
await page.waitForTimeout(900);
const listAll = (await page.locator('[id^="export-card-"]').allInnerTexts()).join('\n');
check(!/[A-H]면 ·/.test(listAll), '리스트형에 "A면 · …" 없음');
check(/\d\/\d/.test(listAll), '페이지 표시(1/2)는 남아 있음');

/* 팔레트 — 어두운 조합까지 눌러 본다. 칩을 눌러도 닫히지 않아야 한다. */
await page.getByRole('tab', { name: '레코드형' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: '카드 색 바꾸기' }).click();
await page.waitForTimeout(400);
const chips = page.getByRole('radio');
check((await chips.count()) === 7, `색칩 7개 — ${await chips.count()}개`);
writeFileSync(join(OUT, '2-팔레트펼침.png'), await page.screenshot());
console.log('  2-팔레트펼침.png');

for (const [i, name] of [[5, 'neon-lime'], [6, 'midnight-pop'], [3, 'plum-rose']]) {
  await chips.nth(i).click();
  await page.waitForTimeout(500);
  check(await chips.first().isVisible(), `${name} 고른 뒤에도 팔레트가 열려 있음`);
  await shootCard(`3-${name}`);
}

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
