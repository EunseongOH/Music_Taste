/**
 * 공유 경로 회귀 검사.
 *
 * `baseline:verify` 는 내보내기(PNG·CSV) 결과만 바이트 비교한다. 공유 버튼이
 * 실제로 무엇을 하는지는 그걸로 안 잡히는데, Task 2.1 에서 그 코드를 전부
 * 어댑터 호출로 바꿨으므로 따로 확인해야 한다.
 *
 * 실제로 나가는 동작(새 창 열기·클립보드·시스템 공유)은 가로채서 기록만 하고
 * 실행하지 않는다.
 *
 * 사용: node toss/baseline/share-check.mjs        # 웹(:3000)
 *       TARGET=toss node toss/baseline/share-check.mjs   # 토스 빌드(:5173)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

const TOSS = process.env.TARGET === 'toss';
const BASE = TOSS ? 'http://localhost:5173' : 'http://localhost:3000';

/** 웹에서 보여야 할 공유 수단. 토스 빌드는 링크 복사만 남는다. */
const WEB_LABELS = [
  'X (트위터)로 공유',
  '카카오톡으로 공유',
  '인스타그램 스토리에 공유',
  '취향표 링크 복사하기',
];
const TOSS_LABELS = ['취향표 링크 복사하기'];

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();

// 앨범아트는 고정 색으로 대체해 네트워크에 기대지 않는다.
await ctx.route('**://i.scdn.co/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#c8b8a0"/></svg>',
  })
);

await page.addInitScript(({ ranking }) => {
  sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
  sessionStorage.setItem('locale', 'ko');

  // 바깥으로 나가는 동작을 가로채 기록만 한다.
  window.__acts = [];
  window.open = (url) => {
    window.__acts.push({ kind: 'open', url });
    return null;
  };
  navigator.clipboard.writeText = async (text) => {
    window.__acts.push({ kind: 'clipboard', text });
  };
  navigator.share = async (data) => {
    window.__acts.push({ kind: 'share', data });
  };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__acts.push({ kind: 'download', name: this.download });
      return;
    }
    return origClick.apply(this, arguments);
  };
}, { ranking: RANKING });

const acts = () => page.evaluate(() => window.__acts);

try {
  console.log(`\n대상: ${BASE}${TOSS ? ' (토스 빌드)' : ' (웹)'}`);
  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: '피라미드형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: '공유하기' }).first().click();
  await page.waitForTimeout(1200);

  console.log('\n[1] 공유 모달 구성');
  const expected = TOSS ? TOSS_LABELS : WEB_LABELS;
  const absent = TOSS ? WEB_LABELS.filter((l) => !TOSS_LABELS.includes(l)) : [];
  for (const l of expected) {
    check((await page.getByRole('button', { name: l }).count()) > 0, `"${l}" 있음`);
  }
  for (const l of absent) {
    check((await page.getByRole('button', { name: l }).count()) === 0, `"${l}" 없음 (정책상 제외)`);
  }

  console.log('\n[2] 각 버튼이 실제로 하는 일');
  if (!TOSS) {
    await page.getByRole('button', { name: 'X (트위터)로 공유' }).click();
    await page.waitForTimeout(600);
    const x = (await acts()).find((a) => a.kind === 'open');
    check(
      !!x && x.url.startsWith('https://twitter.com/intent/tweet?text='),
      'X — 트윗 작성 창 주소 생성',
      x ? decodeURIComponent(x.url).slice(0, 60) : '동작 없음'
    );
    check(!!x && /취향표 TOP 10/.test(decodeURIComponent(x.url)), 'X — 본문에 TOP 10 포함');

    await page.getByRole('button', { name: '카카오톡으로 공유' }).click();
    await page.waitForTimeout(600);
    const k = (await acts()).find((a) => a.kind === 'share');
    check(!!k, '카카오 — 시스템 공유 시트 호출', k ? `title="${k.data.title}"` : '동작 없음');
    check(!!k && typeof k.data.url === 'string' && k.data.url.length > 0, '카카오 — 공유 링크 포함');
  }

  await page.getByRole('button', { name: '취향표 링크 복사하기' }).click();
  await page.waitForTimeout(800);

  if (TOSS) {
    /*
     * 앱인토스 SDK 는 토스 앱 밖에서 "apps-in-toss 웹뷰 환경이 아니에요" 로
     * throw 한다. 그러니 브라우저에서 확인할 수 있는 것은 성공이 아니라
     * **실패가 사용자에게 보이는가** 다. 버튼이 먹통처럼 보이면 안 된다.
     * 복사 성공 경로는 실기기에서만 확인할 수 있다(Phase 8.3).
     */
    check(
      (await page.getByText('링크를 복사하지 못했어요').count()) > 0,
      '토스 앱 밖 — 실패가 오류 토스트로 보임'
    );
  } else {
    const c = (await acts()).find((a) => a.kind === 'clipboard');
    check(!!c, '링크 복사 — 클립보드 기록', c ? c.text : '동작 없음');
    check(!!c && /^https?:/.test(c.text), '링크 복사 — http(s) 주소');
    check(
      (await page.getByText('링크가 복사되었어요').count()) > 0,
      '링크 복사 — 토스트 노출'
    );
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
