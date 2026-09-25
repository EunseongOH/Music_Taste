/**
 * 로그인 창이 **화면 맨 위에, 잘리지 않고** 있는지 본다.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/login-modal-layer-check.mjs
 *
 * 월드컵 화면에서 로그인 창을 열면 후보 앨범 카드가 창 위로 올라오고 창 위쪽이
 * 화면 밖으로 잘렸다. 원인은 z 숫자가 아니라 **자리**였다 — `<main>` 이
 * `relative z-10` 으로 쌓임 맥락을 만들어, 그 안에서는 아무리 큰 z 를 줘도
 * 그 맥락 밖으로 못 나간다. 그리고 `max-h-[90vh]` 는 웹뷰에서 실제로 보이는
 * 높이보다 컸다.
 *
 * 그래서 눈으로 확인할 것을 그대로 잰다.
 *   - 창이 body 바로 아래에 있는가 (쌓임 맥락 밖)
 *   - 창의 위가 화면 안에 있는가
 *   - 후보 카드 한가운데를 찍었을 때 맨 위에 있는 것이 창/가림막인가
 *   - 닫기·구글·카카오 단추에 닿을 수 있는가
 */
import { chromium } from 'playwright';
import { nextBase } from './base.mjs';

const BASE = nextBase();
const VIEWPORTS = [
  // 실제로 신고된 크기. 창이 화면보다 길어지는 구간을 꼭 지난다.
  { width: 294, height: 593 },
  { width: 320, height: 480 },
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/** 월드컵 화면을 게스트로 연다. 곡은 fixture 로 넣어 Spotify 를 부르지 않는다. */
async function openWorldcup(browser, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await ctx.route('**://i.scdn.co/**', (r) =>
    r.fulfill({
      status: 200, contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#8c7f6d"/></svg>',
    })
  );
  await page.route((u) => u.href.includes('.supabase.co/'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  const tracks = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`, title: `곡 ${i + 1}`, artistName: '카더가든',
    albumTitle: '앨범', albumImage: 'https://i.scdn.co/image/x', albumId: 'al1', duration: '3:00',
  }));
  await page.addInitScript((tr) => {
    sessionStorage.setItem('worldcup_tracks', JSON.stringify(tr));
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id: 'art1', name: '카더가든', image: '' }]));
    sessionStorage.setItem('locale', 'ko');
  }, tracks);
  await page.goto(`${BASE}/worldcup`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  return { ctx, page };
}

const browser = await chromium.launch();
console.log(`대상 ${BASE}`);

for (const vp of VIEWPORTS) {
  console.log(`\n${vp.width} x ${vp.height}`);
  const { ctx, page } = await openWorldcup(browser, vp);

  // 헤더의 로그인 단추로 연다.
  const loginBtn = page.getByRole('button', { name: /로그인|Log ?in/ }).first();
  if ((await loginBtn.count()) === 0) {
    check(false, '헤더에 로그인 단추가 있다');
    await ctx.close();
    continue;
  }
  await loginBtn.click();
  await page.waitForTimeout(900);

  const panel = page.locator('.bg-cream.rounded-\\[2rem\\]').first();
  const visible = await panel.isVisible().catch(() => false);
  check(visible, '로그인 창이 열린다');
  if (!visible) {
    await ctx.close();
    continue;
  }

  /* 1) 쌓임 맥락 밖에 있는가 — body 바로 아래인가 */
  const outsideApp = await page.evaluate(() => {
    const el = document.querySelector('.bg-cream.rounded-\\[2rem\\]');
    if (!el) return null;
    // 창에서 위로 올라가며 app 래퍼(<main>)를 지나는지 본다.
    let cur = el.parentElement;
    let depth = 0;
    let insideMain = false;
    while (cur && cur !== document.body) {
      if (cur.tagName === 'MAIN') insideMain = true;
      cur = cur.parentElement;
      depth++;
    }
    return { insideMain, depth, reachedBody: cur === document.body };
  });
  check(outsideApp?.reachedBody === true && outsideApp.insideMain === false,
    '창이 화면의 <main> 밖에 있다 (쌓임 맥락 탈출)',
    outsideApp ? `main 안: ${outsideApp.insideMain} · 깊이 ${outsideApp.depth}` : '못 찾음');

  /* 2) 위가 잘리지 않았는가 */
  const box = await panel.boundingBox();
  check(!!box && box.y >= -1, '창의 위가 화면 안에 있다', box ? `top ${Math.round(box.y)}` : '없음');
  check(!!box && box.x >= -1 && box.x + box.width <= vp.width + 1,
    '좌우로 잘리지 않는다', box ? `x ${Math.round(box.x)} w ${Math.round(box.width)}` : '없음');

  /* 3) 후보 카드 한가운데를 찍으면 맨 위가 창/가림막인가 */
  const onTop = await page.evaluate(() => {
    const card = document.querySelector('[class*="aspect-square"], img[alt]');
    if (!card) return 'no-card';
    const r = card.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit) return 'no-hit';
    // 가림막이거나 창 안쪽이면 통과.
    if (hit.closest('.bg-cream.rounded-\\[2rem\\]')) return 'panel';
    const cs = getComputedStyle(hit);
    if (cs.position === 'fixed' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return 'backdrop';
    return `other:${hit.tagName}.${hit.className?.toString().slice(0, 40)}`;
  });
  check(onTop === 'panel' || onTop === 'backdrop' || onTop === 'no-card',
    '후보 카드 자리에서 창·가림막이 맨 위', String(onTop));

  /* 4) 닿을 수 있는가 */
  for (const [label, rx] of [['닫기', /Close modal/i], ['구글', /google/i], ['카카오', /kakao|카카오/i]]) {
    const b = page.getByRole('button', { name: rx }).first();
    const n = await b.count();
    if (n === 0) {
      console.log(`      (${label} 단추 없음 — 건너뜀)`);
      continue;
    }
    // 굴려서라도 닿을 수 있으면 된다 — 창 안쪽 스크롤이 정상인지까지 함께 본다.
    await b.scrollIntoViewIfNeeded().catch(() => {});
    const bb = await b.boundingBox();
    const inView = !!bb && bb.y >= -1 && bb.y + bb.height <= vp.height + 1;
    check(inView, `${label} 단추에 닿을 수 있다`, bb ? `y ${Math.round(bb.y)}..${Math.round(bb.y + bb.height)}` : '없음');
  }

  /* 5) 뒤 화면이 굴러가지 않는가 */
  const locked = await page.evaluate(() => document.body.style.overflow === 'hidden');
  check(locked, '뒤 화면 스크롤이 잠긴다');

  /* 6) 닫으면 원래대로 */
  await page.getByRole('button', { name: /Close modal/i }).first().click();
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => document.body.style.overflow !== 'hidden');
  check(restored, '닫으면 스크롤이 돌아온다');

  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
