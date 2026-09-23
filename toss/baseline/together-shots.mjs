/**
 * 같이 소트하기 — 화면 전부를 한 번에 찍는다(확인용).
 *
 *   NEXT_BASE=http://localhost:3100 node toss/baseline/together-shots.mjs
 *
 * 운영 DB 에는 **아무것도 쓰지 않는다**. 브라우저가 Supabase 로 보내는 조회를 가로채
 * 지어낸 방과 참여자로 답한다(together-graph-shots.mjs 와 같은 방식).
 *
 * 관계도만 보던 together-graph-shots.mjs 와 달리 **초대 화면**까지 본다 —
 * 방장에게만 보이는 줄(불러왔어요 · 누가 끝냈어요)이 거기 있다.
 *
 * 출력: toss/baseline/out/together/ (저장소에 커밋하지 않는다)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NEXT_BASE ?? process.env.BASE ?? 'http://localhost:3100';
const OUT = join(HERE, 'out', 'together');
mkdirSync(OUT, { recursive: true });

const CHALLENGE_ID = '00000000-0000-4000-8000-000000000001';
const RESULT_ID = '00000000-0000-4000-8000-0000000000ff';
const TITLES = ['Harmony', '나의 계절', 'Night Drive', '흰 밤', 'Slow Dance', '우리가 지나온',
                'Blue Hour', '오후 세 시', 'Echo', '먼 길', 'Lantern', '끝나지 않는'];
const TRACKS = TITLES.map((title, i) => ({ id: `t${i + 1}`, title, artistName: '유라', albumImage: '' }));
const ids = TRACKS.map((t) => t.id);
const shift = (n) => [...ids.slice(n), ...ids.slice(0, n)];

/** 나. 참여키를 'ME' 로 고정해 두고 가로챈 자료의 첫 사람으로 쓴다. */
const me = (extra = {}) => ({
  id: 'e0', challenge_id: CHALLENGE_ID, participant_key: 'ME', nickname: 'Crongcrong',
  ranking: ids, skipped_count: 0, imported: false,
  created_at: '2026-09-23T03:00:00.000Z', ...extra,
});
const other = (i, nickname, at) => ({
  id: `e${i}`, challenge_id: CHALLENGE_ID, participant_key: `p${i}`, nickname,
  ranking: shift((i * 3) % 12), skipped_count: 0, imported: false,
  created_at: at ?? `2026-09-23T04:0${i}:00.000Z`,
});

const challenge = (extra = {}) => ({
  id: CHALLENGE_ID, code: 'demo', creator_id: null, creator_nickname: 'Crongcrong',
  artist_name: '유라', artist_id: null,
  artist_image: 'https://i.scdn.co/image/ab6761610000e5eb5d03d4733df7799d27a83a16',
  title: '유라', tracks: TRACKS, source_result_id: null,
  created_at: '2026-09-23T03:00:00.000Z', ...extra,
});

/** 불러온 취향표의 원래 날짜. 화면에는 "6월 3일" 로 나와야 한다. */
const SOURCE_ROW = { id: RESULT_ID, created_at: '2026-06-03T09:00:00.000Z' };

const PHONE = { width: 393, height: 852 };
const browser = await chromium.launch();
console.log(`대상 ${BASE} · 출력 ${OUT}`);

/**
 * 한 장면을 연다.
 *  - `host`: 이 기기가 방을 만든 것으로 둔다(localStorage 의 together_mine).
 */
async function open({ room, rows, host, path = '' }) {
  const ctx = await browser.newContext({
    viewport: PHONE, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();
  await page.addInitScript((isHost) => {
    try {
      localStorage.setItem('together_participant', 'ME');
      localStorage.setItem('together_mine', isHost ? JSON.stringify(['demo']) : '[]');
      localStorage.removeItem('sortify_theme');
      sessionStorage.setItem('locale', 'ko');
      sessionStorage.removeItem('worldcup_ranking');
    } catch {}
  }, !!host);

  await page.route((u) => u.href.includes('.supabase.co/rest/v1/'), async (route) => {
    const url = route.request().url();
    let body = null;
    if (route.request().method() === 'GET') {
      if (url.includes('/sort_challenges')) body = [room];
      else if (url.includes('/sort_challenge_entries')) body = rows;
      else if (url.includes('/tournament_results')) body = [SOURCE_ROW];
    }
    if (!body) return route.continue();
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'content-range': `0-${body.length - 1}/${body.length}` },
      body: JSON.stringify(single ? body[0] : body),
    });
  });

  await page.goto(`${BASE}/together/demo${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(4500);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}' });
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function shoot(page, label, full = false) {
  // 하단 고정 막대는 전체 캡처에서 본문 한가운데를 가린다. 잠시 흐름 속으로 내린다.
  if (full) {
    await page.addStyleTag({ content: '.fixed.bottom-0.pointer-events-none{position:static!important;background:none!important;padding-top:1.5rem!important}' });
    await page.waitForTimeout(300);
  }
  writeFileSync(join(OUT, `${label}.png`), await page.screenshot({ fullPage: full }));
  console.log(`  ${label}.png`);
}

/** 화면에 그 말이 실제로 있는지 확인한다. 캡처만 남기고 넘어가면 틀린 걸 못 본다. */
async function expectText(page, wanted, label) {
  const body = await page.locator('body').innerText();
  const ok = body.includes(wanted);
  console.log(`  ${ok ? '[O]' : '[X]'} ${label} — "${wanted}"`);
  if (!ok) process.exitCode = 1;
  return ok;
}

/* ── 1. 초대받은 사람이 처음 여는 화면 ───────────────────────── */
{
  const { ctx, page } = await open({ room: challenge(), rows: [], host: false });
  await shoot(page, '1-초대받은사람', true);
  await ctx.close();
}

/* ── 2. 방장 · 이전 취향표를 불러와 만든 방 ──────────────────── */
{
  const { ctx, page } = await open({
    room: challenge({ source_result_id: RESULT_ID }),
    rows: [me({ imported: true })],
    host: true,
  });
  await expectText(page, 'Crongcrong님이 6월 3일에 했던 소트 내역을 불러왔어요', '불러온 방 안내');
  await shoot(page, '2-방장-불러온방', true);
  await ctx.close();
}

/* ── 3. 방장 · 친구가 막 끝낸 뒤 ─────────────────────────────── */
{
  const { ctx, page } = await open({
    room: challenge({ source_result_id: RESULT_ID }),
    rows: [me({ imported: true }), other(1, '지민'), other(2, '서연')],
    host: true,
  });
  await expectText(page, '지금까지 3명이 소트했어요', '사람 수만 센다');
  await expectText(page, '내가 매긴 순위', '내 순위를 이 화면에서 바로 본다');
  await expectText(page, '전체 12곡 보기', '곡 목록은 3곡 + 더보기');
  await shoot(page, '3-방장-친구가끝냄', true);
  await ctx.close();
}

/* ── 4·5·6. 결과 화면 ────────────────────────────────────────── */
{
  const rows = [me(), other(1, '지민'), other(2, '서연'), other(3, '현우'), other(4, '민준')];
  const { ctx, page } = await open({ room: challenge(), rows, host: true, path: '/result' });
  await expectText(page, '우리의 취향 관계도', '결과 화면');
  await shoot(page, '4-결과-관계도');
  await shoot(page, '5-결과-전체', true);

  const node = page.getByRole('button', { name: /^민준/ });
  if (await node.count()) {
    await node.first().click();
    await page.waitForTimeout(800);
    await shoot(page, '6-결과-짝상세', true);
  } else {
    console.log('  (민준 노드를 찾지 못했습니다)');
  }
  await ctx.close();
}

await browser.close();
console.log(`\n저장 위치: ${OUT}`);
