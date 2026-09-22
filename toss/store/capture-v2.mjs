/**
 * 토스 앱인토스 콘솔용 스토어 스크린샷 v2 — 세로형 여러 장.
 *
 * 한 장 = 위에 카피 두 줄(Level 1) + 아래 그 화면 목업(Level 2). 다섯 장 모두 같은 문법을 반복한다
 * (docs/design-system/ux-principles.md §8·§9). 카피는 앱 안의 문장과 글자까지 같다(§6, ux-writing).
 * 전부 단일 아티스트 모드·새 톤(기본 테마). 가로형은 만들지 않는다.
 *
 * 사용: NEXT_BASE=http://localhost:3300 node toss/store/capture-v2.mjs
 *   - 서버는 채택본(sky-tint 기본)이어야 한다. .next 를 지우고 재시작한 뒤 찍는다(옛 CSS 캐시).
 *   - 5장(내 취향 스페이스)은 toss/baseline/.profile 의 로그인 세션을 쓴다(login.mjs 로 만든다).
 *   - 픽스처는 toss/baseline/fixture.json(카더가든 20곡, 커버 캐시 있음) + fixture-space.json(4·5장).
 *     옛 capture-screenshots.mjs(믹스 매치 픽스처·가로형)는 2026-09-23 에 지웠다 — 이 스크립트가 유일하다.
 *   - Spotify 를 부르지 않는다(SPOTIFY_CACHE_ONLY 서버).
 * 출력: toss/store/out/v2-sky/store-1~5.png (636×1048). 저장소에 커밋하지 않는다.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NEXT_BASE ?? 'http://localhost:3300';
const OUT = join(HERE, 'out', 'v2-sky');
mkdirSync(OUT, { recursive: true });
const PROFILE = join(HERE, '..', 'baseline', '.profile');
const RANKING = JSON.parse(readFileSync(join(HERE, '..', 'baseline', 'fixture.json'), 'utf8'));
const ARTIST = { id: '2vHhrJBTC4VNXUMrDe7whx', name: '카더가든', image: '' };
/*
 * 4·5장의 데이터. 운영 DB 에는 아무것도 쓰지 않는다 — 브라우저가 Supabase 로 보내는 조회를 가로채 이 JSON 으로 답한다
 * (make-fixture-space.mjs 가 만든다). 5장은 실제 로그인 계정에 기록이 한 장뿐이라 "한곳에 모여요"가 성립하지 않았다.
 */
const SPACE = JSON.parse(readFileSync(join(HERE, 'fixture-space.json'), 'utf8'));

/* 콘솔 규격과 기기 화면비. 기기 화면을 통째로 넣고(잘리는 곳 없이) 위에 카피를 둔다. */
const PORTRAIT = { w: 636, h: 1048 };
const PHONE = { w: 393, h: 852 };
const COPY_H = 236; // 카피 영역 높이(위 여백 포함)
const FRAME_H = PORTRAIT.h - COPY_H; // 아래 여백 없이 바닥까지 — 폰이 바닥에 놓인 느낌
const FRAME_W = Math.round(FRAME_H * (PHONE.w / PHONE.h));
const TONE = { bg: '#E6F1FD', ink: '#18213B', inkRgb: '24,33,59' };

/* 5장. 카피는 앱 문구와 같다: 1 = 홈 태그라인, 2 = 홈 카드 설명. */
const PAGES = [
  // 로고 마크는 두지 않는다: 폰 안의 워드마크와 겹치고, 이 장에만 있어 다섯 장의 문법이 깨진다(§9·§47 — 빼도 잃는 것이 없다).
  { n: 1, copy: ['좋아하는 곡 중에서도,', '더 마음이 가는 곡을 찾는 곳'], route: '/', wait: 3000 },
  {
    n: 2,
    copy: ['한 아티스트의 전곡을 둘씩 비교하며', '내가 더 좋아하는 곡을 찾아요'],
    route: '/worldcup?mode=single',
    seed: { worldcup_is_single_artist: 'true', worldcup_tracks: JSON.stringify(RANKING), selectedArtists: JSON.stringify([ARTIST]) },
    wait: 5000,
  },
  {
    n: 3,
    copy: ['다 고르면 순위가 취향표로 남아요.', '이미지로 저장하고 공유해요'],
    route: '/taste?mode=single',
    // 상위 8곡 — 한 장짜리 기록표. 16곡 미만이라 로그인 상태여도 자동 저장이 걸리지 않는다.
    seed: { worldcup_is_single_artist: 'true', worldcup_ranking: JSON.stringify(RANKING.slice(0, 8)), selectedArtists: JSON.stringify([ARTIST]) },
    wait: 3000,
    act: async (page) => {
      const skip = page.getByRole('button', { name: /건너뛰기|스킵/ }).first();
      if (await skip.count()) await skip.click();
      await page.waitForTimeout(4000);
    },
  },
  {
    n: 4,
    copy: ['같은 곡을 친구와 각자 소트하고,', '취향이 얼마나 닮았는지 봐요'],
    route: `/together/${process.env.INVITE_CODE ?? '9vtwkaq'}`,
    wait: 6000,
    // 참여자 셋(픽스처) — "0명"이 찍히지 않게. 초대 코드 줄은 스토어 이미지에 코드가 박히지 않도록 가린다.
    mock: (url) => (url.includes('/rest/v1/sort_challenge_entries') ? SPACE.entries.map((e) => ({ ...e, challenge_id: (url.split("challenge_id=eq.")[1] ?? "").split("&")[0] || e.challenge_id })) : null),
    act: async (page) => {
      await page.waitForTimeout(1500);
      await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^코드 .* 링크 보내기$/.test(b.textContent?.trim() ?? '')) b.style.visibility = 'hidden'; });
    },
  },
  {
    n: 5,
    copy: ['내 취향표는 한곳에 모여요.', '취향이 닮은 리스너도 만나요'],
    route: '/explore-taste',
    auth: true,
    wait: 6000,
    // 내 취향표 5장 + 다른 리스너 4명(취향 메이트용). 들어볼 곡은 실제 값.
    mock: (url) => {
      if (!url.includes('/rest/v1/tournament_results')) return null;
      if (url.includes('user_id=eq.')) return SPACE.mine;
      if (url.includes('is_public=eq.true')) return SPACE.others;
      return null;
    },
    // 같은 데이터로 "취향 메이트" 탭을 연 장도 하나 더(5b) — 카피 뒷줄의 근거 확인용
    extra: async (page, shoot) => {
      await page.getByText(/^취향 메이트/).first().click();
      await page.waitForTimeout(2500);
      await shoot('5b');
    },
  },
];

/** 카피 + 폰 목업을 한 장으로 */
async function compose(helper, shot, page) {
  await helper.setContent(`
    <style>
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
      html,body{margin:0;width:${PORTRAIT.w}px;height:${PORTRAIT.h}px;overflow:hidden}
      body{background:${TONE.bg};position:relative;font-family:Pretendard,-apple-system,system-ui,sans-serif}
      h1{position:absolute;left:48px;right:48px;top:78px;margin:0;
         font-size:34px;line-height:1.38;font-weight:700;letter-spacing:-0.02em;color:${TONE.ink};word-break:keep-all}
      img.shot{position:absolute;left:${Math.round((PORTRAIT.w - FRAME_W) / 2)}px;top:${COPY_H}px;
         width:${FRAME_W}px;height:${FRAME_H}px;display:block;
         border-radius:34px 34px 0 0;border:1px solid rgba(${TONE.inkRgb},.14);border-bottom:0;
         box-shadow:0 18px 44px rgba(${TONE.inkRgb},.16)}
    </style>
    <h1>${page.copy[0]}<br/>${page.copy[1]}</h1>
    <img class="shot" src="data:image/png;base64,${shot.toString('base64')}"/>
  `);
  await helper.evaluate(() => document.fonts.ready);
  await helper.waitForTimeout(800);
  return helper.screenshot();
}

const browser = await chromium.launch();
const helper = await (await browser.newContext({ viewport: { width: PORTRAIT.w, height: PORTRAIT.h }, deviceScaleFactor: 1 })).newPage();
console.log(`대상 ${BASE} · 출력 ${OUT}`);

for (const p of PAGES) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(p.n))) continue;
  const opts = { viewport: { width: PHONE.w, height: PHONE.h }, deviceScaleFactor: 3, locale: 'ko-KR', timezoneId: 'Asia/Seoul' };
  let ctx;
  if (p.auth) {
    if (!existsSync(PROFILE)) throw new Error(`로그인 프로필이 없습니다: ${PROFILE} — node toss/baseline/login.mjs`);
    ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, ...opts });
  } else {
    ctx = await browser.newContext(opts);
  }
  const page = ctx.pages?.()[0] ?? (await ctx.newPage());
  await page.addInitScript((seed) => {
    try { localStorage.removeItem('sortify_theme'); } catch {}
    sessionStorage.setItem('locale', 'ko');
    for (const [k, v] of Object.entries(seed ?? {})) { try { sessionStorage.setItem(k, v); localStorage.setItem(k, v); } catch {} }
    // 월드컵 첫 대진이 매번 같게
    let s = 7; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }, p.seed ?? null);
  if (p.mock) {
    await page.route((u) => u.href.includes(".supabase.co/rest/v1/"), async (route) => {
      const url = route.request().url();
      const body = route.request().method() === 'GET' ? p.mock(url) : null;
      if (body) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${body.length - 1}/${body.length}` }, body: JSON.stringify(body) });
      return route.continue();
    });
  }
  await page.goto(`${BASE}${p.route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(p.wait);
  if (p.act) await p.act(page);
  await page.addStyleTag({
    content: `*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}`,
  });
  // 로그인 버튼은 미니앱(익명 식별키로 항상 로그인)에서는 없다
  await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent?.trim() === '로그인') b.style.visibility = 'hidden'; });
  await page.waitForTimeout(600);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const shoot = async (label) => {
    const shot = await page.screenshot();
    const out = await compose(helper, shot, p);
    (await import('node:fs')).writeFileSync(join(OUT, `store-${label}.png`), out);
    console.log(`  ${label}  ${p.route}  body=${bg}  → store-${label}.png`);
  };
  await shoot(String(p.n));
  if (p.extra) await p.extra(page, shoot);
  await ctx.close();
}
await browser.close();
console.log(`\n저장 위치: ${OUT}`);
