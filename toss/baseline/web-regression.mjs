/**
 * 운영 웹(sortify.kr) 회귀 검사 — Phase 7.3 / 7.4.
 *
 * 이식 작업이 웹을 건드리지 않았는지 diff 로는 이미 확인했다. 여기서는
 * **실제로 동작하는지**를 본다. 내보내기는 `baseline:verify`(바이트 비교),
 * 공유는 `share-check.mjs` 가 맡고, 이 파일은 나머지를 본다:
 *
 *  1. Server Actions — /explore 의 아티스트, /tracks 의 앨범이 실제로 온다
 *     (토스 빌드는 REST 디스패치를 쓰지만 웹은 Server Action 그대로다)
 *  2. 인증 UI — 로그인 모달이 열리고 이메일·구글·카카오 경로가 다 있다
 *  3. 나가기 — /taste 의 종료가 홈으로 이동한다
 *     (window.location.href → router.push 로 바뀐 유일한 웹 동작 변경)
 *
 * 사용: node toss/baseline/web-regression.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const WEB = 'http://localhost:3000';
const ARTIST = { id: '7c1HgFDe8ogy5NOZ1ANCJQ', name: 'IU', image: '' };

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();

/** 케이스마다 새 컨텍스트 — 심은 저장소가 다음으로 새면 안 된다. */
const open = async (route, seed = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  if (Object.keys(seed).length) {
    await page.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) {
        try {
          sessionStorage.setItem(k, v);
          localStorage.setItem(k, v);
        } catch {}
      }
    }, seed);
  }
  await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { ctx, page };
};

try {
  console.log('\n[1] Server Actions');
  {
    const { ctx, page } = await open('/explore', {
      selected_genres: JSON.stringify(['k-pop', 'korean indie', 'jazz']),
    });
    await page.waitForTimeout(6000);
    const imgs = await page.locator('main img').count();
    check(imgs > 0, '/explore — 장르 기반 아티스트 로드', `이미지 ${imgs}개`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/tracks', {
      selectedArtists: JSON.stringify([ARTIST]),
    });
    await page.waitForTimeout(4000);
    const open2 = page.locator('section[id^="artist-section-"] h2').first();
    check((await open2.count()) > 0, '/tracks — 선택한 아티스트 표시');
    if (await open2.count()) {
      await open2.click();
      await page.waitForTimeout(4000);
      const albums = await page.locator('section[id^="artist-section-"] img').count();
      check(albums > 0, '/tracks — 앨범 목록 로드', `커버 ${albums}개`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/archive');
    await page.waitForTimeout(5000);
    const imgs = await page.locator('main img').count();
    check(imgs > 0, '/archive — 공개 취향표 로드', `이미지 ${imgs}개`);
    await ctx.close();
  }

  console.log('\n[2] 인증 UI (팝업 경로는 건드리지 않았다 — 노출 여부만 본다)');
  {
    const { ctx, page } = await open('/');
    await page.waitForTimeout(2500);
    const loginBtn = page.getByRole('button', { name: '로그인' }).first();
    check((await loginBtn.count()) > 0, '홈 — 로그인 버튼 노출');
    await loginBtn.click();
    await page.waitForTimeout(1200);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(body.includes('Google 계정으로 로그인'), '로그인 모달 — 구글 경로');
    check(body.includes('카카오 로그인'), '로그인 모달 — 카카오 경로');
    // 이메일 경로는 입력칸 placeholder 라 innerText 에 잡히지 않는다.
    const email = page.locator('input[placeholder*="이메일"]');
    const pw = page.locator('input[type="password"]');
    check((await email.count()) > 0, '로그인 모달 — 이메일 입력칸');
    check((await pw.count()) > 0, '로그인 모달 — 비밀번호 입력칸');
    await ctx.close();
  }

  console.log('\n[3] 나가기 (window.location.href → router.push 변경 확인)');
  {
    const { ctx, page } = await open('/taste', {
      worldcup_ranking: JSON.stringify(RANKING),
    });
    await page.getByRole('button', { name: '피라미드형' }).waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);

    // 전체 리로드가 일어나면 사라지는 표식
    await page.evaluate(() => {
      window.__noReload = true;
    });
    page.on('dialog', (d) => d.accept());

    await page.locator('button[title="종료하기"]').click();
    await page.waitForTimeout(1200);
    // 비로그인 상태에서는 저장 안내 모달이 먼저 뜬다.
    const leave = page.getByRole('button', { name: '저장하지 않고 나가기' });
    if (await leave.count()) await leave.click();
    await page.waitForTimeout(2500);

    check(new URL(page.url()).pathname === '/', '홈으로 이동', page.url());
    check(
      await page.evaluate(() => window.__noReload === true),
      '전체 리로드 없이 이동 (router.push)'
    );
    const cleared = await page.evaluate(() => ({
      ranking: sessionStorage.getItem('worldcup_ranking'),
      tracks: sessionStorage.getItem('worldcup_tracks'),
    }));
    check(!cleared.ranking && !cleared.tracks, '진행 중이던 저장소가 비워짐');
    const home = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    check(home.includes('Sortify'), '홈 화면이 정상 렌더');
    await ctx.close();
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
