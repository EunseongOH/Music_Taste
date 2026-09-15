/**
 * 앱 로고 600×600 생성 (라이트 / 다크).
 *
 * 앱의 실제 디자인 토큰만 쓴다 — globals.css 의 @theme inline 값 그대로다.
 *   cream #F5F2ED · navy #1A2A6C · point #E67E22 · charcoal #2D3436
 * 서체도 앱과 같은 Playfair Display(제목용)를 쓴다.
 *
 * 모티프는 앱 곳곳에 나오는 LP 턴테이블이다. 작은 크기에서 알아보기 쉽고,
 * 앱을 열었을 때 보이는 그림과 바로 이어진다.
 *
 * 사용: node toss/store/make-logo.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

const SIZE = 600;

/** @param {{bg:string,ink:string,point:string,ring:string}} c */
const lp = (c) => `
  <div class="art">
    <svg viewBox="0 0 600 600" width="600" height="600">
      <circle cx="300" cy="300" r="238" fill="none" stroke="${c.ring}" stroke-width="16"/>
      <circle cx="300" cy="300" r="204" fill="none" stroke="${c.ring}" stroke-width="7"/>
      <circle cx="300" cy="300" r="178" fill="none" stroke="${c.ring}" stroke-width="7"/>
      <circle cx="300" cy="300" r="152" fill="none" stroke="${c.ring}" stroke-width="7"/>
      <circle cx="300" cy="300" r="126" fill="none" stroke="${c.ring}" stroke-width="7"/>
      <circle cx="300" cy="300" r="92" fill="${c.point}"/>
      <circle cx="300" cy="300" r="19" fill="${c.bg}"/>
    </svg>
  </div>`;

const VARIANTS = [
  {
    name: 'logo-light',
    // 라이트 모드 기본. 앱을 열면 보이는 색 그대로다.
    bg: '#F5F2ED',
    ink: '#1A2A6C',
    point: '#E67E22',
    ring: '#1A2A6C',
  },
  {
    name: 'logo-dark',
    // 콘솔의 '다크모드 앱 로고' 슬롯용. 네이비 배경에 크림 잉크.
    bg: '#1A2A6C',
    ink: '#F5F2ED',
    point: '#E67E22',
    ring: '#F5F2ED',
  },
];

const browser = await chromium.launch();

try {
  for (const v of VARIANTS) {
    for (const style of ['mark', 'letter', 'combo']) {
      const ctx = await browser.newContext({
        viewport: { width: SIZE, height: SIZE },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.setContent(`
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&display=swap');
          html,body{margin:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
          body{background:${v.bg};display:grid;place-items:center}
          .art,.letter{grid-area:1/1}
          .letter{
            font-family:'Playfair Display',Georgia,serif;
            font-weight:800;
            color:${v.ink};
            line-height:1;
            letter-spacing:-.02em;
          }
          /* 마크형: LP 만 */
          .only-mark .letter{display:none}
          /* 레터형: 큰 S 오른쪽 아래에 주황 점으로 LP 를 암시한다 */
          .only-letter .art{display:none}
          .only-letter .letter{font-size:380px;position:relative;transform:translateX(-32px)}
          .only-letter .letter::after{
            content:'';position:absolute;right:-72px;bottom:26px;
            width:54px;height:54px;border-radius:50%;background:${v.point};
          }
          /* 결합형: 레코드 라벨 자리에 S 를 얹는다 */
          .only-combo .letter{font-size:118px;color:${v.bg};transform:translateY(4px)}
        </style>
        <body class="only-${style}">
          ${lp(v)}
          <div class="letter">S</div>
        </body>
      `);
      await page.waitForTimeout(2000);
      const file = join(OUT, `${v.name}-${style}.png`);
      writeFileSync(file, await page.screenshot());
      console.log(`  ${SIZE}×${SIZE}  ${v.name}-${style}`);
      await ctx.close();
    }
  }
  console.log(`\n저장 위치: ${OUT}`);
} finally {
  await browser.close();
}
