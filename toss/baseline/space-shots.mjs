/**
 * 내 취향 스페이스 · 공유 모달 — 확인용 캡처.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/space-shots.mjs
 *
 * 내 취향 스페이스는 로그인해야 보인다. login.mjs 로 만들어 둔 프로필을 재사용한다
 * (capture-auth.mjs 와 같은 방식). 세션이 죽었으면 찍지 않고 멈춘다 —
 * 로그아웃 화면을 찍어 두고 "확인했다"고 말하지 않기 위해서다.
 *
 * 운영 DB 에 아무것도 쓰지 않는다(읽기만 하는 화면이다).
 *
 * 출력: toss/baseline/out/space/
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, '.profile');
const OUT = join(HERE, 'out', 'space');
const BASE = nextBase();
mkdirSync(OUT, { recursive: true });

let failed = 0;

/* ── 공유 모달 — 로그인이 필요 없다(순위 fixture 만 심으면 열린다) ── */
{
  const RANKING = Array.from({ length: 12 }, (_, i) => ({
    id: `t${i + 1}`,
    title: ['Harmony', '네 번의 여름', '내일의 우리', '흰 밤', 'Slow Dance', '우리가 지나온',
            'Blue Hour', '오후 세 시', 'Echo', '먼 길', 'Lantern', '끝나지 않는'][i],
    artistName: '카더가든',
    albumImage: '',
  }));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
    locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();
  await page.addInitScript((r) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
    // "지금 고른 곡" 의 출처. 비로그인은 저장된 취향표가 없어 이쪽을 탄다.
    sessionStorage.setItem('worldcup_tracks', JSON.stringify(r));
    sessionStorage.setItem('locale', 'ko');
  }, RANKING);
  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /공유/ }).first().click();
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  await page.waitForTimeout(300);
  writeFileSync(join(OUT, '2-공유모달.png'), await page.screenshot());
  console.log('  2-공유모달.png');

  /* 같이 소트하기가 공유 수단 **아래** 에 있어야 한다. 사이에 끼어 있으면 안 된다. */
  const labels = await page.locator('button').allInnerTexts();
  const order = labels.map((l) => l.trim()).filter(Boolean);
  const iTogether = order.findIndex((l) => l.includes('같이 소트하기'));
  const iCopy = order.findIndex((l) => l.includes('링크 복사'));
  const ok = iTogether > iCopy && iCopy >= 0;
  console.log(`  ${ok ? '[O]' : '[X]'} 같이 소트하기가 공유 수단 아래 — 복사 ${iCopy} / 같이 ${iTogether}`);
  if (!ok) failed++;

  /*
   * "이 곡들로 같이 소트하기" 는 아티스트 검색 화면이 아니라 **곡 고르기 화면**으로
   * 가야 한다. 방금 소트한 곡을 두고 아티스트를 다시 고르라는 말이 되면 안 된다.
   */
  await page.getByRole('button', { name: '이 곡들로 같이 소트하기' }).click();
  await page.waitForTimeout(2500);
  const url = page.url();
  const hasSource = /\/together\/new\?source=/.test(url);
  console.log(`  ${hasSource ? '[O]' : '[X]'} 만들기 화면으로 source 를 들고 감 — ${url.replace(BASE, '')}`);
  if (!hasSource) failed++;
  const body = await page.locator('body').innerText();
  const atStep2 = /고른 곡/.test(body) && /링크 만들기/.test(body);
  console.log(`  ${atStep2 ? '[O]' : '[X]'} 곡 고르기 화면에서 시작 — ${atStep2 ? '"고른 곡" + "링크 만들기" 보임' : body.slice(0, 40)}`);
  if (!atStep2) failed++;
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  await page.waitForTimeout(300);
  writeFileSync(join(OUT, '3-같이소트하기로.png'), await page.screenshot());
  console.log('  3-같이소트하기로.png');
  await browser.close();
}

if (!existsSync(PROFILE)) {
  console.error('로그인 프로필이 없습니다. 먼저 `node toss/baseline/login.mjs` 를 실행하세요.');
  process.exit(1);
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
console.log(`대상 ${BASE} · 출력 ${OUT}`);

const settle = async () => {
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  await page.waitForTimeout(400);
};
const shoot = async (label, full = false) => {
  writeFileSync(join(OUT, `${label}.png`), await page.screenshot({ fullPage: full }));
  console.log(`  ${label}.png`);
};
const expect = async (wanted, label) => {
  const body = await page.locator('body').innerText();
  const ok = body.includes(wanted);
  console.log(`  ${ok ? '[O]' : '[X]'} ${label} — "${wanted}"`);
  if (!ok) failed++;
};

/* ── 내 취향 스페이스 ─────────────────────────────────── */
await page.goto(`${BASE}/explore-taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(6000);
await settle();

const text = await page.locator('body').innerText();
if (/로그인하고 내 취향을 모아 보세요|로그인하고 시작하기/.test(text)) {
  console.error('\n로그인 세션이 만료됐습니다. `node toss/baseline/login.mjs` 로 다시 로그인하세요.');
  await ctx.close();
  process.exit(1);
}

await expect('내 취향표', '탭 — 내 취향표');
await expect('들어볼 곡', '탭 — 들어볼 곡');
await expect('취향 메이트', '탭 — 취향 메이트');
// 독립 탭은 사라지고 모드명으로만 남는다.
const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
const tabCount = tabs.length;
console.log(`  ${tabCount === 3 ? '[O]' : '[X]'} 탭이 3개 — ${tabs.join(' / ') || '역할 tab 없음'}`);
if (tabCount !== 3) failed++;
await expect('같이 소트하기', '목록에 같이 소트하기 모드명');

await shoot('1-내취향표', true);

await ctx.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
