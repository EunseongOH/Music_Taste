/**
 * 곡 그림 사다리 — 브라우저 검사 (월드컵 후보 · 결과 카드 · 저장 이미지 · 저장된 취향표)
 *
 *   NEXT_BASE=http://localhost:3600 node toss/baseline/artwork-e2e-check.mjs
 *
 * 하츠투하츠 FOCUS 처럼 재킷 주소가 404 인 곡이 1위가 되면 레코드형 큰 슬리브에 깨진 그림
 * 아이콘이 떴고, 저장 이미지에도 그대로 들어갔다. 여기서는 재킷 주소를 일부러 404 로 답하고
 * 아티스트 사진이 그 자리를 채우는지 본다.
 *
 * 운영 DB 에는 쓰지 않는다 — Supabase 호출은 가로채 답한다. 그림도 모두 가로채 답한다.
 */
import { chromium } from 'playwright';
import { nextBase } from './base.mjs';

const BASE = nextBase();
console.log(`대상 ${BASE}\n`);

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const BROKEN = (n) => `https://coverartarchive.org/release-group/broken-${n}/front-500`;
const ALBUM = (n) => `https://i.scdn.co/image/album-${n}`;
const ARTIST = 'https://i.scdn.co/image/artist-h2h';
const ARTIST_MARK = '#d0021b';          // 아티스트 사진 픽스처의 색 — 저장 이미지에서 이 그림인지 가린다
const svg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${fill}"/></svg>`;

const delivered = {};   // 그림 주소 -> 응답을 보낸 시각
async function newPage({ artistDelayMs = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'ko-KR', reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.route('**://coverartarchive.org/**', (r) => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' }));
  await ctx.route('**://i.scdn.co/**', async (r) => {
    const artist = r.request().url() === ARTIST;
    if (artist && artistDelayMs) await new Promise((ok) => setTimeout(ok, artistDelayMs));
    await r.fulfill({
      status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
      body: svg(artist ? ARTIST_MARK : '#8c7f6d'),
    });
    delivered[r.request().url()] = Date.now();
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => sessionStorage.setItem('locale', 'ko'));
  return { ctx, page };
}

/** 깨진 그림: 불러오기를 마쳤는데 크기가 0 인 <img>. */
const brokenImages = (page, scope = 'body') =>
  page.evaluate((sel) =>
    [...document.querySelectorAll(`${sel} img`)]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')?.slice(0, 80)), scope);

/** src 가 아티스트 사진인가 — 원격 주소 그대로이거나, 그것을 굳힌 data URL. */
const isArtist = (src) =>
  src === ARTIST || (src?.startsWith('data:image/svg+xml;base64,') && Buffer.from(src.split(',')[1], 'base64').toString().includes(ARTIST_MARK));

const browser = await chromium.launch();

/* ── 1. 월드컵 후보 ─────────────────────────────────────────── */
{
  console.log('[1] 월드컵 후보 — 재킷 404 → 아티스트 사진, 슬리브와 LP 라벨이 같은 그림');
  const { ctx, page } = await newPage();
  const tracks = [
    { id: 'w1', title: 'FOCUS', artistName: 'Hearts2Hearts', albumImage: BROKEN(1), artistImage: ARTIST, albumId: 'a1', albumTitle: 'FOCUS' },
    { id: 'w2', title: 'The Chase', artistName: 'Hearts2Hearts', albumImage: BROKEN(2), artistImage: ARTIST, albumId: 'a2', albumTitle: 'The Chase' },
    { id: 'w3', title: 'STYLE', artistName: 'Hearts2Hearts', albumImage: ALBUM(3), artistImage: ARTIST, albumId: 'a3', albumTitle: 'STYLE' },
    { id: 'w4', title: 'Pretty Please', artistName: 'Hearts2Hearts', albumImage: BROKEN(4), albumImageFallbacks: [ALBUM(4)], artistImage: ARTIST, albumId: 'a4', albumTitle: 'X' },
  ];
  await page.addInitScript((t) => {
    sessionStorage.setItem('worldcup_tracks', JSON.stringify(t));
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id: '1ZLU77nRzQIaP23mVSYpCQ', name: 'Hearts2Hearts', image: 'https://i.scdn.co/image/artist-h2h' }]));
  }, tracks);
  await page.route((u) => u.href.includes('.supabase.co/'), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`${BASE}/worldcup?mode=single`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.locator('h3').filter({ hasText: /FOCUS|The Chase|STYLE|Pretty Please/ }).first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(2500);

  const seen = new Set();
  for (let round = 0; round < 3; round++) {
    const info = await page.evaluate(() => {
      const byAlt = {};
      for (const img of document.querySelectorAll('img[alt]')) (byAlt[img.alt] ??= []).push(img.getAttribute('src'));
      return { byAlt, labels: [...document.querySelectorAll('[data-artwork-fallback="artist"]')].map((e) => e.textContent) };
    });
    for (const t of tracks) {
      const srcs = info.byAlt[t.title];
      if (!srcs || seen.has(t.id)) continue;
      seen.add(t.id);
      const expectArtist = t.id === 'w1' || t.id === 'w2';
      const expect = expectArtist ? ARTIST : t.id === 'w3' ? ALBUM(3) : ALBUM(4);
      check(srcs.length >= 2 && srcs.every((s) => s === expect), `${t.title}: 슬리브·LP 라벨 모두 ${expectArtist ? '아티스트' : t.id === 'w4' ? '2순위 재킷' : '재킷'}`, srcs.join(' | ').slice(0, 120));
      check(expectArtist === info.labels.includes(t.title), `${t.title}: 곡 제목 보조 표시는 ${expectArtist ? '있다' : '없다'}`);
    }
    check((await brokenImages(page)).length === 0, `깨진 그림 없음 (${round + 1}번째 대진)`, (await brokenImages(page)).join(','));
    if (seen.size === tracks.length) break;
    // 다음 대진으로: 왼쪽 후보를 아래로 끌어 고른다
    const cand = page.locator('h3').filter({ hasText: /FOCUS|The Chase|STYLE|Pretty Please/ }).first();
    const box = await cand.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(3500);
  }
  check(seen.size === tracks.length, '네 곡을 모두 확인', `${seen.size}곡`);
  await ctx.close();
}

/* ── 2. 결과 카드 + 저장 이미지 ─────────────────────────────────── */
const RANKING = [
  { id: 'r1', title: 'FOCUS', artistName: 'Hearts2Hearts', albumImage: BROKEN(1), artistImage: ARTIST, artistId: '1ZLU77nRzQIaP23mVSYpCQ' },
  { id: 'r2', title: 'STYLE', artistName: 'Hearts2Hearts', albumImage: ALBUM(2), artistImage: ARTIST },
  { id: 'r3', title: 'The Chase', artistName: 'Hearts2Hearts', albumImage: BROKEN(3), albumImageFallbacks: [ALBUM(3)], artistImage: ARTIST },
  { id: 'r4', title: 'Nothing', artistName: 'Hearts2Hearts', albumImage: BROKEN(4) },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 5}`, title: `Song ${i + 5}`, artistName: 'Hearts2Hearts', albumImage: ALBUM(i + 5) })),
];

async function heroSrc(page) {
  // 레코드형 1위 슬리브 = 화면 카드 안에서 가장 큰 그림
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((i) => !i.closest('[id^="export-card-"]') && i.getBoundingClientRect().width > 0);
    imgs.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    return imgs[0]?.getAttribute('src') ?? null;
  });
}

{
  console.log('\n[2] 결과 화면 — 레코드형 1위 · 리스트형 · 모자이크형 · 저장 이미지');
  const { ctx, page } = await newPage();
  await page.addInitScript((r) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id: '1ZLU77nRzQIaP23mVSYpCQ', name: 'Hearts2Hearts', image: '' }]));
  }, RANKING);
  await page.route((u) => u.href.includes('.supabase.co/'), (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('/auth/v1/') ? '{}' : '[]' }));
  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('tab', { name: '레코드형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(3000);

  const hero = await heroSrc(page);
  check(isArtist(hero), '레코드형 1위 큰 슬리브 = 아티스트 사진', hero?.slice(0, 60));
  check((await brokenImages(page)).length === 0, '레코드형: 깨진 그림 없음', (await brokenImages(page)).join(','));

  // 저장용 카드: 원격 주소가 하나도 없고, 1위 자리는 아티스트 사진
  const exp = await page.evaluate(() => [...document.querySelectorAll('#export-card-0 img')].map((i) => i.getAttribute('src') ?? ''));
  check(exp.length > 0 && exp.every((s) => s.startsWith('data:')), '저장용 카드의 그림은 모두 data URL', `${exp.filter((s) => !s.startsWith('data:')).length}개 원격`);
  check(!exp.some((s) => s.includes('coverartarchive')), '깨진 재킷 주소가 저장용 카드에 남지 않는다');
  check(isArtist(exp.sort((a, b) => b.length - a.length).find(isArtist)), '저장용 1위도 아티스트 사진');
  const nothing = await page.evaluate(() => [...document.querySelectorAll('#export-card-0 img')].some((i) => (i.getAttribute('src') ?? '').startsWith('data:image/svg+xml;utf8,')));
  check(nothing, '그림이 하나도 없는 곡은 대체 그림(네트워크 없음)');

  // 실제 저장 — 다운로드가 나오고 PNG 여야 한다
  await page.getByRole('button', { name: '저장하기' }).first().click();
  await page.waitForTimeout(700);
  const dl = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  await page.getByRole('button', { name: /9:16 이미지 저장/ }).first().click();
  // 여러 장이면 "n장 저장하기" 를 한 번 더 묻는다
  await page.waitForTimeout(700);
  const confirm = page.getByRole('button', { name: /^\d+장 저장하기$/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const d = await dl;
  if (d) {
    const buf = await (await d.createReadStream()).toArray().then((c) => Buffer.concat(c));
    check(buf.subarray(1, 4).toString() === 'PNG' && buf.length > 20_000, '저장 이미지가 만들어진다', `${d.suggestedFilename()} ${buf.length}B`);
  } else check(false, '저장 이미지가 만들어진다', '다운로드 없음');

  for (const [tab, label] of [['리스트형', '리스트형'], ['모자이크형', '모자이크형']]) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(1500);
    check((await brokenImages(page)).length === 0, `${label}: 깨진 그림 없음`, (await brokenImages(page)).join(','));
    const ex = await page.evaluate(() => [...document.querySelectorAll('[id^="export-card-"] img')].map((i) => i.getAttribute('src') ?? ''));
    check(ex.length > 0 && ex.every((s) => s.startsWith('data:')), `${label} 저장용 카드도 data URL 만`);
  }
  await ctx.close();
}

/* ── 2b. 화면이 뜨자마자 저장 — 그림을 굳히기 전에 캡처하지 않는다 ───────── */
{
  console.log('\n[2b] 결과가 뜨자마자 저장 (아티스트 사진이 4초 늦게 온다)');
  const { ctx, page } = await newPage({ artistDelayMs: 4000 });
  await page.addInitScript((r) => {
    sessionStorage.setItem('worldcup_ranking', JSON.stringify(r));
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id: 'x', name: 'Hearts2Hearts', image: '' }]));
  }, RANKING.slice(0, 4));
  await page.route((u) => u.href.includes('.supabase.co/'), (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('/auth/v1/') ? '{}' : '[]' }));
  delete delivered[ARTIST];
  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('button', { name: '저장하기' }).first().waitFor({ timeout: 180_000 });
  await page.getByRole('button', { name: '저장하기' }).first().click();
  const dl = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  await page.getByRole('button', { name: /9:16 이미지 저장/ }).first().click();
  const clickedAt = Date.now();
  const d = await dl;
  const doneAt = Date.now();
  check(!!d, '저장 이미지가 만들어진다');
  check(delivered[ARTIST] && delivered[ARTIST] <= doneAt && clickedAt < delivered[ARTIST],
    '누른 뒤 아티스트 사진이 올 때까지 기다렸다가 캡처한다',
    `클릭→사진 ${delivered[ARTIST] ? delivered[ARTIST] - clickedAt : '-'}ms, 클릭→저장 ${doneAt - clickedAt}ms`);
  const exp = await page.evaluate(() => [...document.querySelectorAll('#export-card-0 img')].map((i) => i.getAttribute('src') ?? ''));
  check(exp.every((s) => s.startsWith('data:')), '캡처된 카드에 원격 주소가 없다');
  await ctx.close();
}

/* ── 3. 저장된 예전 취향표 — 곡에 아티스트 사진이 없다 ─────────────── */
for (const [label, path] of [['내 취향표 (/my-taste)', '/my-taste?id=legacy-1'], ['공유 취향표 (/taste/[id])', '/taste/legacy-1']]) {
  console.log(`\n[3] 예전 순위 · ${label}`);
  const { ctx, page } = await newPage();
  const lookups = [];
  const row = {
    id: 'legacy-1', title: '하츠투하츠 취향', is_public: true, is_single_artist: true,
    artist_id: '1ZLU77nRzQIaP23mVSYpCQ', artist_name: 'Hearts2Hearts', created_at: '2026-09-01T00:00:00Z',
    user_nickname: '나', user_profile_image: '', ranking: RANKING.map(({ id, title, artistName, albumImage }) => ({ id, title, artistName, albumImage })),
  };
  await page.route((u) => u.href.includes('.supabase.co/'), (r) => {
    const url = r.request().url();
    const one = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/auth/v1/')) return json({});
    if (url.includes('/canonical_artist')) { lookups.push(url); return json(one ? { images: [{ url: ARTIST }] } : [{ images: [{ url: ARTIST }] }]); }
    if (url.includes('/tournament_results')) return json(one ? row : [row]);
    return json([]);
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByText('FOCUS').first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(3000);
  check(lookups.length === 1 && lookups[0].includes('spotify_id=eq.1ZLU77nRzQIaP23mVSYpCQ'), 'artist_id 로 정확히 한 번 찾는다', lookups[0]?.split('?')[1]);
  check(isArtist(await heroSrc(page)), '1위 자리 = 아티스트 사진', (await heroSrc(page))?.slice(0, 60));
  check((await brokenImages(page)).length === 0, '깨진 그림 없음', (await brokenImages(page)).join(','));
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
