/**
 * Phase 1.1 — 웹 기준선(레퍼런스) 내보내기 캡처.
 *
 * Task 2.1(`platform.ts` 추출 + `taste/page.tsx` 리팩터)은 "리팩터 전/후 내보내기
 * 결과가 바이트 단위로 같다"가 완료 조건이다. 이 스크립트가 '전' 쪽을 뜬다.
 * 리팩터 후 똑같이 한 번 더 돌려 manifest.json의 sha256을 비교하면 된다.
 *
 * 동작 방식
 *  - `/taste`는 스토리지의 `worldcup_ranking`만 읽으므로 fixture.json을 주입하고
 *    곧장 진입한다(월드컵 드래그 플로우를 클릭으로 재현하지 않는다).
 *  - 내보내기는 `<a download>.click()`이라 앵커 클릭을 가로채 앱이 만든 dataURL을
 *    그대로 받는다. 다운로드 폴더를 경유하지 않아 결정적이다.
 *  - 카드에 오늘 날짜가 렌더되므로 시계를 고정한다. 고정하지 않으면 날짜가 바뀌는
 *    순간 바이트 비교가 무조건 깨진다.
 *
 *   node toss/baseline/capture.mjs [--out <dir>] [--base http://localhost:3000]
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

/*
 * 어느 서버를 찍는지가 이 검사의 전부다. 기본값 :3000 을 다른 브랜치의 dev 서버가
 * 쓰고 있으면 엉뚱한 화면을 기준선으로 삼게 된다(실제로 세 세션이 여기 걸렸다).
 * 다른 검사들과 같은 NEXT_BASE 를 읽고, 무엇을 보고 있는지 첫 줄에 찍는다.
 */
const BASE = arg('--base', process.env.NEXT_BASE ?? 'http://localhost:3000');
console.log(`기준 서버: ${BASE}`);
const OUT = join(HERE, arg('--out', 'refs'));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

// 카드에 렌더되는 날짜를 고정한다. 이 값을 바꾸면 기존 레퍼런스와 비교할 수 없다.
const FIXED_TIME = new Date('2026-01-15T09:00:00+09:00');

const TEMPLATES = [
  { key: 'list', tab: '리스트형' },
  { key: 'retro', tab: '레코드형' },
  { key: 'mosaic', tab: '모자이크형' },
  { key: 'poster', tab: '포스터형' },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 430, height: 932 }, // 앱 셸이 max-w-[430px]
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});

const page = await context.newPage();

// Date는 고정, 타이머는 계속 돌게 둔다(애니메이션이 멈추면 UI가 안 나온다).
await page.clock.setFixedTime(FIXED_TIME);

// 원격 앨범 아트를 결정적인 응답으로 대체한다.
//
// 앱은 커버를 미리 data URL 로 받아 두고(useInlinedCovers) 저장한다. 실제
// 네트워크에 의존하면 같은 입력으로도 결과 PNG가 달라지므로 결정적인 응답으로
// 바꾼다. URL에서 유도한 색을 쓰므로 슬롯이 뒤바뀌는 회귀는 그대로 잡힌다.
// (예전 cacheBust 는 `?<타임스탬프>` 를 붙였다 — 혹시 남아 있어도 색이 같게 떼어 낸다.)
await context.route('**://i.scdn.co/**', async (route) => {
  const url = route.request().url().replace(/[?&](t=)?\d{10,}$/g, '');
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (url.charCodeAt(i) + ((h << 5) - h)) | 0;
  const hue = Math.abs(h) % 360;
  const tag = Math.abs(h).toString(16).slice(0, 6);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">` +
    `<rect width="640" height="640" fill="hsl(${hue} 55% 62%)"/>` +
    `<text x="320" y="345" font-family="monospace" font-size="72" fill="#fff" ` +
    `text-anchor="middle">${tag}</text></svg>`;
  await route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: svg,
  });
});

await page.addInitScript(
  ({ ranking }) => {
    try {
      sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
      sessionStorage.setItem('locale', 'ko');
    } catch {}

    // 앱이 만드는 다운로드 앵커를 가로채 실제 바이트를 수집한다.
    window.__captured = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__captured.push({ name: this.download, href: this.href });
        return;
      }
      return origClick.apply(this, arguments);
    };
  },
  { ranking: RANKING }
);

// 다중 페이지 내보내기 확인창은 '전체 다운로드'로 수락한다.
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push({ type: d.type(), message: d.message() });
  await d.accept();
});

const log = (...a) => console.log(...a);

log(`→ ${BASE}/taste  (${RANKING.length}곡, 시계 고정 ${FIXED_TIME.toISOString()})`);
await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

// 시네마틱 리빌이 끝나면 템플릿 탭(showButton)이 나타난다. 20곡이면 30초쯤 걸린다.
log('  리빌 애니메이션 대기…');
await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
log('  템플릿 탭 노출됨');

// 리빌이 끝난 뒤 CSS 애니메이션/트랜지션을 정지시킨다.
// 정지 전에는 `animate-pulse` 같은 무한 애니메이션이 캡처 순간마다 다른 프레임에
// 걸려서, 같은 입력인데도 PNG 바이트가 달라진다. 리빌 자체는 이미 끝났으므로
// 여기서 꺼도 최종 레이아웃은 바뀌지 않는다.
await page.addStyleTag({
  content: `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
  }`,
});

// 화면에 보이는 앨범 아트가 자리를 잡을 시간을 준다.
// 오프스크린 내보내기 카드(top:-9999px)의 next/image는 lazy라 끝까지 complete가
// 되지 않는다. html-to-image는 cacheBust로 이미지를 직접 받아 인라인하므로
// 이 대기는 필수가 아니다 — 따라서 실패시키지 않고 로그만 남긴다.
const waitImages = async () => {
  try {
    await page.waitForFunction(
      () => Array.from(document.images).every((i) => i.complete),
      null,
      { timeout: 15_000 }
    );
  } catch {
    const pending = await page.evaluate(
      () => Array.from(document.images).filter((i) => !i.complete).length
    );
    log(`    (미로드 이미지 ${pending}개 — lazy 오프스크린으로 추정, 계속 진행)`);
  }
  await page.waitForTimeout(1200);
};
await waitImages();

const manifest = { fixedTime: FIXED_TIME.toISOString(), trackCount: RANKING.length, files: [], dialogs: [] };

async function drainCaptures(label) {
  const items = await page.evaluate(() => {
    const c = window.__captured;
    window.__captured = [];
    return c;
  });
  for (const it of items) {
    const comma = it.href.indexOf(',');
    const meta = it.href.slice(0, comma);
    const payload = it.href.slice(comma + 1);
    const isB64 = /;base64/i.test(meta);
    const buf = isB64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    const safe = it.name.replace(/[^\w.\-가-힣]/g, '_');
    writeFileSync(join(OUT, safe), buf);
    const sha = createHash('sha256').update(buf).digest('hex');
    manifest.files.push({ name: safe, bytes: buf.length, sha256: sha, from: label });
    log(`    ✓ ${safe}  ${(buf.length / 1024).toFixed(0)} KB  ${sha.slice(0, 16)}…`);
  }
  if (!items.length) log(`    ! ${label}: 캡처된 파일 없음`);
  return items.length;
}

async function openSaveSheet() {
  await page.getByRole('button', { name: '저장', exact: false }).first().click();
  await page.getByRole('button', { name: '9:16 이미지 저장' }).waitFor({ state: 'visible', timeout: 20_000 });
}

// 템플릿별 이미지 내보내기
for (const tpl of TEMPLATES) {
  log(`  [${tpl.key}]`);
  await page.getByRole('tab', { name: tpl.tab }).click();
  await page.waitForTimeout(2500); // 레이아웃/모션이 완전히 정착할 시간
  await waitImages();

  await openSaveSheet();
  await page.getByRole('button', { name: '9:16 이미지 저장' }).click();
  // 여러 장이면 확인 시트가 뜬다("N장 저장하기").
  const saveAll = page.getByRole('button', { name: /장 저장하기$/ });
  await saveAll.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (await saveAll.count()) await saveAll.click();

  // pixelRatio 5 (2250×4000)라 렌더가 느리다. 시트가 닫히면 완료.
  await page
    .getByRole('button', { name: '9:16 이미지 저장' })
    .waitFor({ state: 'hidden', timeout: 180_000 })
    .catch(() => log('    (시트가 안 닫힘 — 캡처는 계속 시도)'));
  await page.waitForTimeout(1500);
  await drainCaptures(tpl.key);
}

// CSV는 템플릿과 무관하므로 한 번만
log('  [csv]');
await openSaveSheet();
await page.getByRole('button', { name: 'Excel 저장' }).click();
await page.waitForTimeout(1500);
await drainCaptures('csv');

manifest.dialogs = dialogs;
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

log(`\n파일 ${manifest.files.length}개 → ${OUT}`);
log(`확인창 ${dialogs.length}회 발생${dialogs.length ? ' (다중 페이지 경로 동작 확인)' : ''}`);

await browser.close();
