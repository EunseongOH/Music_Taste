/**
 * 화면 아래 고정 버튼이 마지막 콘텐츠를 가리지 않는지 검사한다.
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/bottom-clearance-check.mjs
 *
 * 스크롤을 끝까지 내린 뒤 **마지막 콘텐츠의 아래쪽**과 **고정 바의 위쪽**을 재서
 * 그 사이에 숨 쉴 틈(MIN_GAP)이 있는지 본다. "스크롤이 더 내려간다" 가 아니라
 * "마지막 글자가 보인다" 를 본다.
 *
 * 운영 DB 에는 아무것도 쓰지 않는다 — Supabase 조회를 가로채 지어낸 방으로 답한다.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBase } from './base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = nextBase();
/** 마지막 콘텐츠와 고정 바 사이에 최소한 이만큼은 있어야 한다. */
const MIN_GAP = 12;

const VIEWPORTS = [
  { name: '320×568', width: 320, height: 568 },
  { name: '360×800', width: 360, height: 800 },
  { name: '390×844', width: 390, height: 844 },
  { name: '430×932', width: 430, height: 932 },
];

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/* ── 지어낸 방 한 칸 ─────────────────────────────────── */
const CHALLENGE_ID = '00000000-0000-4000-8000-000000000001';
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));
const TRACKS = RANKING.map((t, i) => ({ id: `t${i + 1}`, title: t.title, artistName: t.artistName, albumImage: '' }));
const ids = TRACKS.map((t) => t.id);

const room = (extra = {}) => ({
  id: CHALLENGE_ID, code: 'clear', creator_id: null, creator_nickname: '나',
  artist_name: '카더가든', artist_id: null, artist_image: '',
  title: '카더가든', tracks: TRACKS, source_result_id: null,
  created_at: '2026-09-24T03:00:00.000Z', ...extra,
});
const me = { id: 'e0', challenge_id: CHALLENGE_ID, participant_key: 'ME', nickname: '나',
  ranking: ids, skipped_count: 0, imported: false, created_at: '2026-09-24T03:00:00.000Z' };
const friend = { id: 'e1', challenge_id: CHALLENGE_ID, participant_key: 'p1', nickname: '지민',
  ranking: [...ids].reverse(), skipped_count: 0, imported: false, created_at: '2026-09-24T04:00:00.000Z' };

async function openRoom(browser, vp, { rows, host, path = '' }) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await page.addInitScript((isHost) => {
    try {
      localStorage.setItem('together_participant', 'ME');
      localStorage.setItem('together_mine', isHost ? JSON.stringify(['clear']) : '[]');
      sessionStorage.setItem('locale', 'ko');
    } catch {}
  }, !!host);
  await page.route((u) => u.href.includes('.supabase.co/rest/v1/'), async (route) => {
    const url = route.request().url();
    let body = null;
    if (route.request().method() === 'GET') {
      if (url.includes('/sort_challenges')) body = [room()];
      else if (url.includes('/sort_challenge_entries')) body = rows;
      else if (url.includes('/tournament_results')) body = [];
    }
    if (!body) return route.continue();
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(body.length - 1, 0)}/${body.length}` },
      body: JSON.stringify(single ? body[0] ?? null : body),
    });
  });
  await page.goto(`${BASE}/together/clear${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(4000);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  return { ctx, page };
}

/**
 * 스크롤을 끝까지 내리고 잰다.
 *
 * 고정 바는 `pointer-events-none` 을 가진 `.fixed.bottom-0` 이다(시트·모달과 구분된다).
 * 마지막 콘텐츠는 **화면에 보이는 것 중 가장 아래**를 찾는다 — 어느 요소가 마지막인지
 * 화면마다 다르므로 자리를 박아 두지 않는다.
 */
async function measure(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const dock = [...document.querySelectorAll('.fixed.bottom-0')].find(
      (el) => el.className.includes('pointer-events-none') && el.getBoundingClientRect().height > 0
    );
    if (!dock) return { dock: null };
    const d = dock.getBoundingClientRect();
    let worst = null;
    const walk = (el) => {
      for (const c of el.children) {
        if (dock.contains(c)) continue;
        const r = c.getBoundingClientRect();
        const style = getComputedStyle(c);
        const paints = style.visibility !== 'hidden' && style.display !== 'none';
        // 글자나 그림이 실제로 있는 잎 노드만 본다(빈 래퍼는 세지 않는다).
        const leaf = c.children.length === 0 && (c.textContent || '').trim().length > 0;
        if (paints && leaf && r.height > 0 && r.width > 0 && r.top < window.innerHeight) {
          if (!worst || r.bottom > worst.bottom) worst = { bottom: r.bottom, text: (c.textContent || '').trim().slice(0, 24) };
        }
        walk(c);
      }
    };
    walk(document.body);
    return {
      dock: { top: d.top, height: d.height },
      last: worst,
      gap: worst ? Math.round(d.top - worst.bottom) : null,
      atBottom: Math.abs(window.scrollY + window.innerHeight - document.body.scrollHeight) < 4,
    };
  });
}

const browser = await chromium.launch();
console.log(`대상 ${BASE} · 최소 간격 ${MIN_GAP}px\n`);

/** 화면 하나를 모든 폭에서 잰다. */
async function scenario(name, open, prepare) {
  console.log(name);
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await open(vp);
    if (prepare) await prepare(page);
    const m = await measure(page);
    if (!m.dock) {
      check(false, `${vp.name} — 고정 바를 찾지 못함`);
    } else {
      check(
        m.gap !== null && m.gap >= MIN_GAP,
        `${vp.name} · 바 ${Math.round(m.dock.height)}px`,
        `마지막 "${m.last?.text ?? '?'}" 아래 여백 ${m.gap}px`
      );
    }
    await ctx.close();
  }
  console.log('');
}

/** 목록을 전부 펼친다 — 가려짐은 가장 긴 상태에서 드러난다. */
const expandAll = async (page) => {
  for (let i = 0; i < 4; i++) {
    const more = page.getByRole('button', { name: /전체 \d+곡 보기/ });
    if ((await more.count()) === 0) break;
    await more.first().click();
    await page.waitForTimeout(250);
  }
};

await scenario('같이 소트하기 초대 — 방장 · 버튼 3개 · 목록 전부 펼침',
  (vp) => openRoom(browser, vp, { rows: [me, friend], host: true }), expandAll);

await scenario('같이 소트하기 초대 — 참여자 · 버튼 1개',
  (vp) => openRoom(browser, vp, { rows: [friend], host: false }));

await scenario('같이 소트하기 결과 — 버튼 2개 · 내 순위 펼침',
  (vp) => openRoom(browser, vp, { rows: [me, friend], host: true, path: '/result' }),
  async (page) => {
    const more = page.getByRole('button', { name: /전체 \d+곡 보기/ });
    if (await more.count()) await more.first().click();
    await page.waitForTimeout(300);
  });

/* 취향 기록표 — 바에 팔레트 트리거가 얹혀 있어 가장 높다(템플릿 탭을 모두 본다). */
async function openTaste(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await ctx.route('**://i.scdn.co/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#8c7f6d"/></svg>' })
  );
  await page.addInitScript((r) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
    sessionStorage.setItem('locale', 'ko');
  }, RANKING);
  await page.goto(`${BASE}/taste?preview=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  return { ctx, page };
}

await scenario('취향 기록표 — 레코드형(여러 장)', openTaste, async (page) => {
  await page.getByRole('tab', { name: '레코드형' }).click();
  await page.waitForTimeout(800);
});

await scenario('취향 기록표 — 포스터형', openTaste, async (page) => {
  await page.getByRole('tab', { name: '포스터형' }).click();
  await page.waitForTimeout(800);
});

await browser.close();
console.log(failed === 0 ? '결과: 통과' : `결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
