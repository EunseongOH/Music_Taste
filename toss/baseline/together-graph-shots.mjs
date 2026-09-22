/**
 * 같이 소트하기 결과 화면 — 인원별 관계도 확인용 캡처.
 *
 *   NEXT_BASE=http://localhost:3300 node toss/baseline/together-graph-shots.mjs
 *
 * 운영 DB 에는 아무것도 쓰지 않는다. 브라우저가 Supabase 로 보내는 조회를 가로채
 * 지어낸 참여자로 답한다(capture-v2.mjs 와 같은 방식). 닉네임 길이도 섞어 둔다 —
 * 긴 이름에서 노드가 어떻게 깨지는지가 이 캡처의 목적 중 하나다.
 *
 * 출력: toss/baseline/out/graph/ (저장소에 커밋하지 않는다)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NEXT_BASE ?? process.env.BASE ?? 'http://localhost:3300';
const OUT = join(HERE, 'out', 'graph');
mkdirSync(OUT, { recursive: true });

const CODE = 'graphdemo';
const CHALLENGE_ID = '00000000-0000-4000-8000-000000000001';
const TRACKS = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  title: ['Harmony', '나의 계절', 'Night Drive', '흰 밤', 'Slow Dance', '우리가 지나온', 'Blue Hour',
          '오후 세 시', 'Echo', '먼 길', 'Lantern', '끝나지 않는'][i],
  artistName: '유라',
  albumImage: '',
}));

/** 닉네임은 짧은 것·긴 것·같은 것·비어 있는 것을 섞는다. */
const NAMES = [
  '지민', '민준', '서연', '현우', '다다',
  '아주아주긴닉네임을쓰는사람', '하루', '무드등', '창가자리', '새벽라디오',
  '지민', null, '리스너_하루', '초코', '연우',
];

const shift = (n) => [...TRACKS.slice(n), ...TRACKS.slice(0, n)].map((t) => t.id);
const ids = TRACKS.map((t) => t.id);

/** i 번째 참여자의 순위. 사람마다 다르게, 그러나 언제나 같게. */
function rankingFor(i) {
  if (i === 0) return ids;                       // 나
  if (i === 1) return shift(1);
  if (i === 2) return [...ids].reverse();        // 정반대 하나는 있어야 "가장 다른 조합"이 산다
  if (i === 3) return shift(2);
  return shift((i * 3) % 12);
}

function entriesFor(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    challenge_id: CHALLENGE_ID,
    participant_key: i === 0 ? 'ME' : `p${i}`,
    nickname: NAMES[i % NAMES.length],
    ranking: rankingFor(i),
    skipped_count: 0,
    created_at: new Date(Date.UTC(2026, 8, 22, 12, i)).toISOString(),
  }));
}

const CHALLENGE = {
  id: CHALLENGE_ID,
  code: CODE,
  creator_id: null,
  creator_nickname: '은은',
  artist_name: '유라',
  artist_id: null,
  // 사진이 있는 방과 없는 방을 둘 다 본다(NO_HERO=1 이면 사진 없이).
  artist_image: process.env.NO_HERO ? '' : 'https://i.scdn.co/image/ab6761610000e5eb5d03d4733df7799d27a83a16',
  title: '유라',
  tracks: TRACKS,
  source_result_id: null,
  created_at: '2026-09-22T12:00:00.000Z',
};

const PHONE = { width: 393, height: 852 };
const browser = await chromium.launch();
console.log(`대상 ${BASE} · 출력 ${OUT}`);

for (const n of [2, 6, 10, 15]) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  // 나를 'ME' 로 고정한다. 그래야 가로챈 자료의 첫 사람이 "나"가 된다.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('together_participant', 'ME');
      localStorage.removeItem('sortify_theme');
      sessionStorage.setItem('locale', 'ko');
      sessionStorage.removeItem('worldcup_ranking');   // 새 기록을 저장하지 않게
    } catch {}
  });
  const rows = entriesFor(n);
  await page.route((u) => u.href.includes('.supabase.co/rest/v1/'), async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    let body = null;
    if (method === 'GET' && url.includes('/sort_challenges')) body = [CHALLENGE];
    else if (method === 'GET' && url.includes('/sort_challenge_entries')) body = rows;
    if (!body) return route.continue();
    // maybeSingle() 은 배열이 아닌 한 행을 기대한다 — Accept 헤더로 갈린다.
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${body.length - 1}/${body.length}` },
      body: JSON.stringify(single ? body[0] : body),
    });
  });

  await page.goto(`${BASE}/together/${CODE}/result`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(4000);
  await page.addStyleTag({ content: `*{animation:none!important;transition:none!important} nextjs-portal{display:none!important}` });
  await page.waitForTimeout(400);

  const shoot = async (label, full = false) => {
    /*
     * 전체 페이지를 찍을 때는 하단 고정 버튼을 잠시 흐름 속으로 내린다.
     * 그러지 않으면 버튼이 화면 한가운데에 박혀 그 아래 내용을 가린다(fullPage 의 성질).
     */
    /* 하단 CTA 막대만 고른다. `.fixed.bottom-0` 만 쓰면 시트(Sheet)까지 걸려서
       시트가 화면 아래가 아니라 본문 끝에 붙는다 — CTA 막대에만 있는 pointer-events-none 으로 가른다. */
    if (full) await page.addStyleTag({ content: `.fixed.bottom-0.pointer-events-none{position:static!important;background:none!important;padding-top:1.5rem!important}` });
    writeFileSync(join(OUT, `${label}.png`), await page.screenshot({ fullPage: full }));
    console.log(`  ${label}.png`);
  };
  await shoot(`n${n}`);
  // 6명은 페이지 전체를 한 장으로 — 섹션 사이 여백과 흐름을 통째로 본다.
  if (n === 6) await shoot('n6-full', true);

  // 15명은 묶음 노드(+N)를 눌러 참여자 시트까지 본다.
  if (n === 15) {
    const more = page.getByRole('button', { name: /나머지 참여자/ });
    if (await more.count()) {
      await more.first().click();
      await page.waitForTimeout(900);
      await shoot('n15-sheet');
    } else {
      console.log('  (묶음 노드를 찾지 못했습니다)');
    }
  }
  // 6명은 다른 사람을 골랐을 때의 강조 상태도 본다.
  if (n === 6) {
    const node = page.getByRole('button', { name: /^서연/ });
    if (await node.count()) {
      await node.first().click();
      await page.waitForTimeout(700);
      await shoot('n6-selected');
    }
    /* 기본 선택은 100% 라 "가장 갈린 곡"이 없다. 69% 인 민준을 골라 상세를 통째로 본다
       — 받침 있는 이름("민준과 나")과 없는 이름("다다와 나")을 둘 다 확인하는 자리이기도 하다. */
    const gapNode = page.getByRole('button', { name: /^민준/ });
    if (await gapNode.count()) {
      await gapNode.first().click();
      await page.waitForTimeout(700);
      await shoot('n6-detail', true);
    }
    // 공유 시트
    const share = page.getByRole('button', { name: '결과 공유하기' });
    if (await share.count()) {
      await share.first().click();
      await page.waitForTimeout(800);
      await shoot('n6-share');
      await page.getByRole('button', { name: '닫기' }).first().click();
      await page.waitForTimeout(500);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n저장 위치: ${OUT}`);
