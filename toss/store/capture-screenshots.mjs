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
 *   BASE=http://localhost:5174 THEME=sky-tint node toss/store/capture-screenshots.mjs
 *   THEME 은 legacy(기본) | toss-white | sky-tint. 출력은 out/<THEME>/ 로 나뉜다(legacy 세트는 out/legacy/).
 *   토스 dev 빌드: VITE_DEV_API_BASE=http://localhost:3300 npx vite --config toss/app/vite.config.mts --port 5174 --strictPort
 *   (API 는 SPOTIFY_CACHE_ONLY 가 켜진 Next 서버로 — Spotify 를 부르지 않는다)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.env.THEME ?? 'legacy';
const OUT = join(HERE, 'out', THEME);
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE ?? process.argv[2] ?? 'http://localhost:5173';
console.log(`대상 ${BASE} · 테마 ${THEME} · 출력 ${OUT}`);

/* 새 톤(docs/design-system/color.md)의 프레임 색. legacy 는 지금까지의 크림. */
const TONE =
  THEME === 'legacy'
    ? { bg: '#EAE2D6', ink: '26,42,108', title: '#1A2A6C', body: '#2D3436', dot: '#E67E22', font: "'Playfair Display',Georgia,serif", fontUrl: 'Playfair+Display:wght@700', weight: 700 }
    : { bg: THEME === 'sky-tint' ? '#E6F1FD' : '#F2F4F6', ink: '24,33,59', title: '#18213B', body: '#333D4B', dot: '#FD7E3E', font: "'Nunito',system-ui,sans-serif", fontUrl: 'Nunito:wght@800', weight: 800 };
const LOGO = readFileSync(join(HERE, '..', '..', 'public', 'logo-mark.png')).toString('base64');
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

/* 곡 고르기 화면용 아티스트 — 전곡이 캐시에 있어(coverage 1.0) Spotify 를 부르지 않는다. */
const TRACKS_ARTIST = { id: '6HvZYsbFfjnjFrWF950C9d', name: 'NewJeans', image: 'https://i.scdn.co/image/ab6761610000e5eb841bdcf28a956f3a384ffcf4' };
/* 같이 소트하기 초대 화면 — 실제 방 코드 하나(읽기 전용). INVITE_CODE 로 바꿀 수 있다. */
const INVITE_CODE = process.env.INVITE_CODE ?? '9vtwkaq';

const SCREENS = [
  { name: '1-home', route: '/', seed: {}, wait: 3000, logo: true },
  { name: '2-explore', route: '/explore?mode=single', seed: { worldcup_is_single_artist: 'true' }, wait: 7000 },
  {
    name: '3-tracks',
    route: '/tracks?mode=single',
    seed: { worldcup_is_single_artist: 'true', selectedArtists: JSON.stringify([TRACKS_ARTIST]) },
    wait: 8000,
    // 첫 앨범을 펼쳐 수록곡과 LP 연출이 보이게 한다.
    act: async (page) => {
      const card = page.locator('button', { hasText: /곡$/ }).first();
      if (await card.count()) { await card.click(); await page.waitForTimeout(2500); }
    },
  },
  {
    name: '4-worldcup',
    route: '/worldcup?mode=single',
    seed: { worldcup_is_single_artist: 'true', worldcup_tracks: JSON.stringify(RANKING) },
    wait: 5000,
  },
  {
    name: '5-taste',
    route: '/taste?mode=single',
    seed: { worldcup_is_single_artist: 'true', worldcup_ranking: JSON.stringify(RANKING) },
    wait: 3000,
    // 결과 화면은 순위를 하나씩 공개하는 연출로 시작한다. 최종 취향표를
    // 보여 줘야 하므로 '스킵' 을 눌러 끝으로 보낸다.
    act: async (page) => {
      const skip = page.getByRole('button', { name: '스킵' }).first();
      if (await skip.count()) await skip.click();
      await page.waitForTimeout(4000);
    },
  },
  { name: '6-invite', route: `/together/${INVITE_CODE}`, seed: {}, wait: 6000 },
];

/** 기기 화면을 톤의 바깥 바탕 위에 둥근 모서리로 얹어 콘솔 규격에 맞춘다. 첫 장에만 로고 마크를 작게. */
async function frame(page, buf, logo = false) {
  await page.setContent(`
    <style>
      html,body{margin:0;width:${PORTRAIT.w}px;height:${PORTRAIT.h}px;overflow:hidden}
      body{background:${TONE.bg};display:grid;place-items:center;position:relative}
      img.shot{width:${FRAME_W}px;height:${FRAME_H}px;display:block;
          border-radius:30px;border:1px solid rgba(${TONE.ink},.14);
          box-shadow:0 18px 44px rgba(${TONE.ink},.18)}
      img.logo{position:absolute;right:18px;bottom:14px;width:44px;height:44px;border-radius:12px;
          box-shadow:0 4px 12px rgba(${TONE.ink},.18)}
    </style>
    <img class="shot" src="data:image/png;base64,${buf.toString('base64')}"/>
    ${logo ? `<img class="logo" src="data:image/png;base64,${LOGO}"/>` : ''}
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

    await page.addInitScript(([seed, theme]) => {
      try { if (theme === 'legacy') localStorage.removeItem('sortify_theme'); else localStorage.setItem('sortify_theme', theme); } catch {}
      sessionStorage.setItem('locale', 'ko');
      for (const [k, v] of Object.entries(seed)) {
        try {
          sessionStorage.setItem(k, v);
          localStorage.setItem(k, v);
        } catch {}
      }
    }, [s.seed, THEME]);

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
    const out = await frame(helper, raw, !!s.logo);
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
  const [titleL, bodyL] = THEME === 'legacy'
    ? ['Sortify', '최애곡 월드컵으로 완성하는<br/>나만의 음악 취향표']
    : ['Sortify', '좋아하는 곡 중에서도,<br/>더 마음이 가는 곡을 찾는 곳'];
  const land = await browser.newContext({
    viewport: { width: LANDSCAPE.w, height: LANDSCAPE.h },
    deviceScaleFactor: 1,
  });
  const lp = await land.newPage();
  await lp.setContent(`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=${TONE.fontUrl}&display=swap');
      html,body{margin:0;width:${LANDSCAPE.w}px;height:${LANDSCAPE.h}px;overflow:hidden}
      body{
        background:${TONE.bg};
        display:flex;align-items:center;justify-content:center;gap:52px;
        padding:0 72px;box-sizing:border-box;
        font-family:${TONE.font};
      }
      .copy{width:400px;flex:none}
      h1{font-size:72px;line-height:1;margin:0 0 22px;color:${TONE.title};letter-spacing:-.02em;font-weight:${TONE.weight}}
      p{font-family:system-ui,-apple-system,sans-serif;font-size:23px;line-height:1.6;
        margin:0;color:${TONE.body};opacity:.78;font-weight:500}
      .dot{display:inline-block;width:12px;height:12px;border-radius:50%;
      background:${TONE.dot};margin-right:12px;vertical-align:middle}
      .shots{display:flex;gap:28px;align-items:center}
      .shots img{width:246px;height:533px;object-fit:cover;border-radius:26px;
        border:1px solid rgba(${TONE.ink},.16);
        box-shadow:0 26px 60px rgba(${TONE.ink},.20)}
      .shots img:nth-child(2){width:278px;height:603px;
        box-shadow:0 32px 72px rgba(${TONE.ink},.26)}
    </style>
    <div class="copy">
      <h1>${titleL}</h1>
      <p>${bodyL}</p>
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
