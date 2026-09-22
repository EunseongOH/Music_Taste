/**
 * 링크 미리보기 이미지와 로고 축소본을 만든다.
 *
 *   node scripts/make-og.mjs
 *
 * 손으로 만든 PNG 를 저장소에 넣어 두면, 마크가 바뀌었을 때 무엇을 어떻게
 * 다시 만들어야 하는지가 아무 데도 남지 않는다. 그래서 만드는 방법 자체를 둔다.
 *
 * 만드는 것
 *   public/og-sortify.png        1200×630 — 링크 미리보기(변형 B: 앱 아이콘 + 워드마크)
 *   public/og-image.png          같은 그림. 사이트 기본 미리보기
 *   public/logo-mark-sm.png      160×160 — 기다리는 화면용(원본은 600px·294KB)
 *   toss/app/public/logo-mark-sm.png   미니앱은 public 이 따로다
 *
 * 원본은 public/logo-mark.png 하나뿐이다. 그것만 바꾸고 이걸 다시 돌리면 된다.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => path.join(REPO, ...parts);

/** 디자인 토큰과 같은 값 — globals.css 의 --color-cream / --color-navy */
const CREAM = '#F5F2ED';
const NAVY = '#1A2A6C';

const markDataUri = `data:image/png;base64,${readFileSync(p('public', 'logo-mark.png')).toString('base64')}`;

/*
 * 워드마크는 Nunito 800. 앱 안의 워드마크(Playfair)와 다른 이유는, 미리보기는
 * 타임라인에서 작게 스쳐 지나가는 그림이라 세리프의 가는 획이 뭉개지기 때문이다.
 * 굵은 산세리프가 같은 크기에서 훨씬 또렷하다.
 */
const html = `
<!doctype html>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=block');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: ${CREAM};
    display: flex; align-items: center; justify-content: center; gap: 64px;
  }
  /* 앱 아이콘 타일 — 마크 원본의 흰 바탕을 타일 자체로 쓴다(따로 지울 것이 없다) */
  .tile {
    width: 404px; height: 404px; border-radius: 100px; background: #fff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 24px 60px rgba(26, 42, 108, 0.10);
    /* 마크 원본이 흰 네모라, 둥근 모서리 밖으로 삐져나온 귀퉁이를 잘라 낸다 */
    overflow: hidden;
  }
  .tile img { width: 88%; height: 88%; }
  .wordmark {
    font-family: 'Nunito', system-ui, sans-serif; font-weight: 800;
    font-size: 148px; letter-spacing: -0.02em; color: ${NAVY};
    /* 폰트 기준선 때문에 글자 덩어리가 살짝 위로 뜬다. 광학적으로 맞춘다. */
    margin-top: -10px;
  }
</style>
<div class="tile"><img src="${markDataUri}" alt=""></div>
<div class="wordmark">Sortify</div>
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// 폰트가 실제로 잡혔는지 확인한다 — 못 받으면 조용히 system-ui 로 그려진다.
const gotFont = await page.evaluate(() => document.fonts.check('800 148px Nunito'));
if (!gotFont) {
  await browser.close();
  throw new Error('Nunito 800 을 받지 못했습니다. 네트워크를 확인하세요 (system-ui 로 그려질 뻔했습니다).');
}
const og = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(p('public', 'og-sortify.png'), og);
writeFileSync(p('public', 'og-image.png'), og);
console.log(`og-sortify.png · og-image.png — 1200×630, ${(og.length / 1024).toFixed(0)}KB`);

// 기다리는 화면용 축소본. 그 화면이 제 그림을 기다리게 하면 안 된다.
const sharp = await import('sharp').catch(() => null);
if (sharp) {
  await sharp.default(p('public', 'logo-mark.png')).resize(160, 160).png({ compressionLevel: 9 }).toFile(p('public', 'logo-mark-sm.png'));
  copyFileSync(p('public', 'logo-mark-sm.png'), p('toss', 'app', 'public', 'logo-mark-sm.png'));
  console.log('logo-mark-sm.png — 160×160 (public · toss/app/public)');
} else {
  console.log('logo-mark-sm.png 는 건너뜁니다 — sharp 가 없습니다. 마크를 바꿨다면 손으로 160px 로 줄여 두 곳에 넣으세요.');
}
