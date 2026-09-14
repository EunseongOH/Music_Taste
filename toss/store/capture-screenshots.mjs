/**
 * 앱인토스 콘솔 "노출 정보" 용 스크린샷 생성.
 *
 * 콘솔 요구 규격:
 *   세로형 636×1048 (최소 3장) / 가로형 1504×741 (최소 1장)
 *
 * 실제 토스 빌드(:5173)를 찍는다. 목업이 아니라 사용자가 보게 될 화면 그대로다.
 *
 * 세로형은 636/1048 = 0.607 비율인데 휴대폰보다 짧다. 그래서 430px 폭(실제
 * 모바일 레이아웃)으로 같은 비율(430×708)을 잡아 고해상도로 찍은 뒤 규격에
 * 맞게 줄인다. 636×1048 뷰포트로 바로 찍으면 앱이 max-w-[430px] 라서 양옆에
 * 배경만 남는다.
 *
 * 사용: node toss/store/capture-screenshots.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
// 여러 아티스트가 섞인 픽스처를 쓴다. 기준선용(카더가든 전용)은 회귀 비교의
// 고정 입력이라 건드리지 않는다.
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture-mix.json'), 'utf8'));

/*
 * 실제 기기 화면비로 찍는다 — 아이폰 16 (393×852pt, 비율 0.461).
 * 콘솔 규격(636×1048)은 비율이 0.607 이라 더 뭉툭하다. 그 비율로 바로 찍으면
 * 화면 위아래가 잘리므로, 기기 화면을 통째로 넣고 양옆을 크림 배경으로 채운다.
 */
const PHONE = { w: 393, h: 852 };
const PORTRAIT = { w: 636, h: 1048 };
const LANDSCAPE = { w: 1504, h: 741 };

// 프레임 안에서 기기 화면이 차지할 크기 (위아래 여백 24px)
const FRAME_H = PORTRAIT.h - 48;
const FRAME_W = Math.round(FRAME_H * (PHONE.w / PHONE.h));

const SCREENS = [
  { name: '1-home', route: '/', seed: {}, wait: 3000 },
  { name: '2-genres', route: '/genres', seed: {}, wait: 3000 },
  {
    name: '3-explore',
    route: '/explore',
    seed: { selected_genres: JSON.stringify(['k-pop', 'korean indie', 'jazz']) },
    wait: 7000,
  },
  {
    name: '4-worldcup',
    route: '/worldcup',
    seed: { worldcup_tracks: JSON.stringify(RANKING) },
    wait: 5000,
  },
  {
    name: '5-taste',
    route: '/taste',
    seed: { worldcup_ranking: JSON.stringify(RANKING) },
    wait: 3000,
    // 결과 화면은 순위를 하나씩 공개하는 연출로 시작한다. 최종 취향표를
    // 보여 줘야 하므로 '스킵' 을 눌러 끝으로 보낸다.
    act: async (page) => {
      const skip = page.getByRole('button', { name: '스킵' }).first();
      if (await skip.count()) await skip.click();
      await page.waitForTimeout(4000);
    },
  },
];

/** 기기 화면을 크림 배경 위에 둥근 모서리로 얹어 콘솔 규격에 맞춘다. */
async function frame(page, buf) {
  await page.setContent(`
    <style>
      html,body{margin:0;width:${PORTRAIT.w}px;height:${PORTRAIT.h}px;overflow:hidden}
      body{background:#EAE2D6;display:grid;place-items:center}
      img{width:${FRAME_W}px;height:${FRAME_H}px;display:block;
          border-radius:30px;border:1px solid rgba(26,42,108,.14);
          box-shadow:0 18px 44px rgba(26,42,108,.18)}
    </style>
    <img src="data:image/png;base64,${buf.toString('base64')}"/>
  `);
  await page.waitForTimeout(400);
  return page.screenshot();
}

/** PNG 를 canvas 로 정확한 규격에 맞춰 축소한다. */
async function resize(page, buf, w, h) {
  return Buffer.from(
    await page.evaluate(
      async ([dataUrl, tw, th]) => {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = dataUrl;
        });
        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, tw, th);
        return c.toDataURL('image/png').split(',')[1];
      },
      [`data:image/png;base64,${buf.toString('base64')}`, w, h]
    ),
    'base64'
  );
}

const browser = await chromium.launch();
// 합성용 페이지. 뷰포트를 콘솔 규격에 맞춰야 스크린샷이 그 크기로 나온다.
const helper = await (
  await browser.newContext({
    viewport: { width: PORTRAIT.w, height: PORTRAIT.h },
    deviceScaleFactor: 1,
  })
).newPage();
await helper.goto('about:blank');

const portraits = [];
const phoneShots = [];

try {
  for (const s of SCREENS) {
    const ctx = await browser.newContext({
      viewport: { width: PHONE.w, height: PHONE.h },
      deviceScaleFactor: 3, // 1179×2556 (아이폰 16 실제 픽셀) 로 찍어 축소
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    const page = await ctx.newPage();

    await page.addInitScript((seed) => {
      sessionStorage.setItem('locale', 'ko');
      for (const [k, v] of Object.entries(seed)) {
        try {
          sessionStorage.setItem(k, v);
          localStorage.setItem(k, v);
        } catch {}
      }
    }, s.seed);

    await page.goto(`${BASE}${s.route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(s.wait);
    if (s.act) await s.act(page);

    /*
     * 로그인 버튼을 숨긴다.
     * 실제 토스 미니앱은 익명 식별키로 항상 로그인 상태라 이 버튼이 렌더되지
     * 않는다. 개발용 브라우저에서만(세션 없이 진행) 나타나는 것이므로,
     * 숨기는 쪽이 실제 화면에 더 가깝다.
     */
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent?.trim() === '로그인') b.style.visibility = 'hidden';
      }
    });

    // 애니메이션을 멈춰 매번 같은 프레임이 나오게 한다.
    await page.addStyleTag({
      content: `*{animation:none!important;transition:none!important}`,
    });
    await page.waitForTimeout(500);

    const raw = await page.screenshot();
    const out = await frame(helper, raw);
    const file = join(OUT, `portrait-${s.name}.png`);
    writeFileSync(file, out);
    portraits.push({ name: s.name, data: out.toString('base64') });
    // 가로형 목업에는 프레임 없는 기기 화면 원본을 쓴다(비율 그대로).
    phoneShots.push({ name: s.name, data: raw.toString('base64') });
    console.log(`  세로형 ${PORTRAIT.w}×${PORTRAIT.h}  ${s.name}`);
    await ctx.close();
  }

  // 가로형: 브랜드 배경 위에 세로 화면 3장을 올린다.
  const pick = phoneShots.filter((p) => ['1-home', '4-worldcup', '5-taste'].includes(p.name));
  const land = await browser.newContext({
    viewport: { width: LANDSCAPE.w, height: LANDSCAPE.h },
    deviceScaleFactor: 1,
  });
  const lp = await land.newPage();
  await lp.setContent(`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
      html,body{margin:0;width:${LANDSCAPE.w}px;height:${LANDSCAPE.h}px;overflow:hidden}
      body{
        background:#EAE2D6;
        display:flex;align-items:center;justify-content:center;gap:52px;
        padding:0 72px;box-sizing:border-box;
        font-family:'Playfair Display',Georgia,serif;
      }
      .copy{width:400px;flex:none}
      h1{font-size:72px;line-height:1;margin:0 0 22px;color:#1A2A6C;letter-spacing:-.02em}
      p{font-family:system-ui,-apple-system,sans-serif;font-size:23px;line-height:1.6;
        margin:0;color:#2D3436;opacity:.78;font-weight:500}
      .dot{display:inline-block;width:12px;height:12px;border-radius:50%;
      background:#E67E22;margin-right:12px;vertical-align:middle}
      .shots{display:flex;gap:28px;align-items:center}
      .shots img{width:246px;height:533px;object-fit:cover;border-radius:26px;
        border:1px solid rgba(26,42,108,.16);
        box-shadow:0 26px 60px rgba(26,42,108,.20)}
      .shots img:nth-child(2){width:278px;height:603px;
        box-shadow:0 32px 72px rgba(26,42,108,.26)}
    </style>
    <div class="copy">
      <h1>Sortify</h1>
      <p>최애곡 월드컵으로 완성하는<br/>나만의 음악 취향표</p>
    </div>
    <div class="shots">
      ${pick.map((p) => `<img src="data:image/png;base64,${p.data}"/>`).join('')}
    </div>
  `);
  await lp.waitForTimeout(2500);
  writeFileSync(join(OUT, 'landscape-1.png'), await lp.screenshot());
  console.log(`  가로형 ${LANDSCAPE.w}×${LANDSCAPE.h}  1`);
  await land.close();

  console.log(`\n저장 위치: ${OUT}`);
} finally {
  await browser.close();
}
