/**
 * 월드컵 "모르는 곡 빼기" 검사.
 *
 * 곡을 위로 끌어 올리면 상대 곡이 자동 진출하고, 뺀 곡은 순위에서 빠진다.
 * 확정 전에 되돌리기가 있다. 실제 드래그(포인터 이벤트)로 확인한다.
 *
 * 로그인하지 않은 상태로 돈다 — 들어볼 곡 DB 저장은 하지 않는다(운영 DB).
 *
 * 사용: node toss/baseline/remove-check.mjs                 # 웹(:3000)
 *       TARGET=toss node toss/baseline/remove-check.mjs     # 토스 빌드(:5173)
 *       BASE=http://localhost:3100 node ...                 # 포트 변경
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { announce, nextBase, vite } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

const TOSS = process.env.TARGET === 'toss';
const BASE = TOSS ? vite() : nextBase();
announce(['기준 서버:', BASE]);

/** worldcup/page.tsx 의 REMOVE_UNDO_MS 보다 조금 길게. */
const UNDO_WAIT = 3600;

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();

async function openWorldcup(count) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'ko-KR' });
  await ctx.route('**://i.scdn.co/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c8b8a0"/></svg>',
    })
  );
  const page = await ctx.newPage();
  await page.addInitScript((tracks) => {
    // 새로 시작하는 월드컵: 진행 기록 없이 곡만 심는다.
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      sessionStorage.setItem('worldcup_tracks', JSON.stringify(tracks));
      sessionStorage.removeItem('worldcup_progress');
      localStorage.removeItem('worldcup_progress');
      sessionStorage.setItem('locale', 'ko');
    }
  }, FIXTURE.slice(0, count));
  await page.goto(`${BASE}/worldcup`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[style*="touch-action"]').first().waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const candidates = (page) => page.locator('[style*="touch-action"]');
const titles = (page) => page.locator('[style*="touch-action"] h3').allTextContents();

/** 커버를 꾹 누른 뒤(LP 등장) dy 만큼 끈다. 음수면 위로. */
async function drag(page, idx, dy) {
  const box = await candidates(page).nth(idx).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x, y + (dy * i) / 12);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

const roundName = (page) => page.locator('main h2').first().textContent();

try {
  console.log(`\n대상: ${BASE}${TOSS ? ' (토스 빌드)' : ' (웹)'}`);

  console.log('\n[1] 4곡 — 빼기 · 되돌리기 · 결승에서 빼기');
  {
    const { ctx, page } = await openWorldcup(4);
    const first = await titles(page);

    await drag(page, 0, -180);
    await page.waitForTimeout(1200); // 후보 퇴장 애니메이션이 끝날 때까지
    check((await page.getByRole('button', { name: '되돌리기' }).count()) === 1, '위로 끌면 되돌리기 카드');
    check((await candidates(page).count()) === 0, '확정 전에는 후보가 가려짐');

    await page.getByRole('button', { name: '되돌리기' }).click();
    await page.waitForTimeout(800);
    const back = await titles(page);
    check(JSON.stringify(back) === JSON.stringify(first), '되돌리면 같은 매치로 복귀', back.join(' vs '));

    // 이번엔 확정까지 기다린다.
    const removed1 = (await titles(page))[0];
    await drag(page, 0, -180);
    await page.waitForTimeout(UNDO_WAIT);
    const m2 = await titles(page);
    check(m2.length === 2 && !m2.includes(removed1), '확정되면 다음 매치로', m2.join(' vs '));

    // 두 번째 매치는 평소처럼 아래로 골라서 결승으로.
    await drag(page, 0, 220);
    await page.waitForTimeout(2600);
    check((await roundName(page))?.trim() === '결승전', '결승 진출', await roundName(page));

    const finalists = await titles(page);
    const removed2 = finalists[1];
    await drag(page, 1, -180);
    await page.waitForTimeout(UNDO_WAIT + 800);
    const cta = page.getByRole('button', { name: '취향표 보기' });
    await cta.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    check((await cta.count()) > 0, '결승에서 빼면 상대가 우승하고 1위 공개로');
    // 제목은 한 문장이 됐다: `'{아티스트}' {n}곡 중 {닉네임}님의 1위곡은 '{곡제목}'`.
    // 곡 제목이 그 안에 들어 있는지로 본다 — 앞부분은 문구라 바뀔 수 있다.
    const revealTitle = (await page.locator('h1').first().textContent())?.trim() ?? '';
    check(revealTitle.includes(finalists[0]), '1위 공개 문구에 남은 곡이 들어감', revealTitle);
    // 모른다고 뺀 곡을 "결승 상대"(이긴 곡)로 부르면 안 된다.
    check((await page.getByText('결승 상대').count()) === 0, '뺀 곡은 결승 상대로 보이지 않음');

    const ranking = JSON.parse((await page.evaluate(() => sessionStorage.getItem('worldcup_ranking'))) ?? '[]');
    const rankTitles = ranking.map((t) => t.title);
    check(rankTitles[0] === finalists[0], '우승은 남은 곡', rankTitles[0]);
    check(!rankTitles.includes(removed1) && !rankTitles.includes(removed2), '뺀 곡은 순위에 없음', rankTitles.join(', '));
    check(ranking.length === 2, '순위 = 4곡 − 뺀 2곡', `${ranking.length}곡`);
    check((await page.evaluate(() => sessionStorage.getItem('worldcup_skipped_count'))) === '2', '뺀 곡 수 기록(자동 저장 기준용)');
    await ctx.close();
  }

  console.log('\n[2] 5곡(예선전) — 빼도 다음 라운드로 넘어감');
  {
    const { ctx, page } = await openWorldcup(5);
    // 표시 이름 버그(예선전이 준결승으로, 준결승이 결승으로 보임)도 함께 잡는다.
    check((await roundName(page))?.trim() === '4강 진출 예선전', '예선전으로 시작', await roundName(page));
    await drag(page, 0, -180);
    await page.waitForTimeout(UNDO_WAIT + 800);
    check((await roundName(page))?.trim() === '준결승전', '예선에서 빼도 4강으로', await roundName(page));
    check((await candidates(page).count()) === 2, '멈추지 않고 매치가 뜸');

    // 이어하기: 새로고침해도 뺀 곡이 유지된다.
    const before = JSON.parse((await page.evaluate(() => sessionStorage.getItem('worldcup_progress'))) ?? '{}');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await candidates(page).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const after = JSON.parse((await page.evaluate(() => sessionStorage.getItem('worldcup_progress'))) ?? '{}');
    check(before.skippedTracks?.length === 1, '진행 기록에 뺀 곡 저장', `${before.skippedTracks?.length ?? 0}곡`);
    check(after.skippedTracks?.length === 1, '새로고침 후에도 뺀 곡 유지', `${after.skippedTracks?.length ?? 0}곡`);
    await ctx.close();
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
