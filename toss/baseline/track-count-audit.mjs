/**
 * 곡 수가 세 곳에서 같은지 실제 아티스트로 확인한다.
 *
 *   NEXT_BASE=http://localhost:3100 node --experimental-strip-types \
 *     toss/baseline/track-count-audit.mjs 4k5fFEYgkWYrYvtOK3zVBl 볼빨간사춘기
 *
 * 머리말은 "84 Tracks" 라고 적는데 시작 단추는 80 이라고 적는 일이 있었다. 셋 중 어디가
 * 다른지 말로 따지지 않고, 실제 화면이 들고 있는 값을 그대로 꺼내 비교한다.
 * (화면의 `window.__trackAudit` — 개발 빌드에서만 열린다)
 *
 * Spotify 는 부르지 않는다. 개발 모드는 기본이 캐시 전용이라(SPOTIFY_CACHE_ONLY) 우리
 * DB 에 담긴 것만 나온다 — 쿼터가 바닥난 날의 운영과 같은 조건이다.
 */
import { chromium } from 'playwright';
import { nextBase } from './base.mjs';

const BASE = nextBase();
const [, , ARTIST_ID = '4k5fFEYgkWYrYvtOK3zVBl', ARTIST_NAME = '볼빨간사춘기'] = process.argv;

/* 화면과 같은 규칙. src/utils 를 그대로 가져와 쓴다. */
const { songKey } = await import('../../src/utils/songKey.ts');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'ko-KR' });
const page = await ctx.newPage();
await page.addInitScript(
  ([id, name]) => {
    sessionStorage.setItem('selectedArtists', JSON.stringify([{ id, name, image: '' }]));
    sessionStorage.setItem('isSingleArtistMode', 'true');
    sessionStorage.setItem('locale', 'ko');
  },
  [ARTIST_ID, ARTIST_NAME]
);

console.log(`대상 ${BASE} · ${ARTIST_NAME}`);
console.log('');
await page.goto(`${BASE}/tracks`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => typeof window.__trackAudit === 'function', { timeout: 180_000 });

/* 배경 수집이 멎을 때까지 기다린다. 멎지 않으면 그 사실 자체가 답이다. */
const settled = await page
  .waitForFunction(() => window.__trackAudit()[0]?.backgroundLoading === false, { timeout: 180_000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(1500);

const [a] = await page.evaluate(() => window.__trackAudit());
if (!a) {
  console.log('아티스트를 못 불러왔다. 우리 DB 에 이 아티스트가 없을 수 있다.');
  await browser.close();
  process.exit(1);
}

const loaded = a.albums.filter((x) => !x.empty && x.loaded > 0);
const pendingAlbums = a.albums.filter((x) => !x.empty && x.loaded === 0);
const nullSlots = a.albums.filter((x) => x.empty);
const pending = pendingAlbums.reduce((n, x) => n + (x.totalTracks || 0), 0);

const releasedKeys = new Set();
let releasedRaw = 0;
for (const al of loaded) {
  for (const t of al.titles) {
    releasedRaw++;
    releasedKeys.add(songKey(a.name, t));
  }
}

console.log(`배경 수집 끝남: ${settled ? '예' : '아니오(시간 초과)'}`);
console.log(`앨범 ${a.albums.length}장 — 수록곡 받음 ${loaded.length} · 받았는데 비어 있음 ${pendingAlbums.length} · 아직 자리만 ${nullSlots.length}`);
console.log('');
console.log('단계별 수');
console.log(`  발매 앨범 원본 트랙            ${releasedRaw}`);
console.log(`  제목(songKey)만으로 센 수      ${releasedKeys.size}   <- 옛 머리말이 이렇게 셌다`);
console.log(`  미발매곡(원본)                 ${a.unreleased.length}`);
console.log(`  수록곡을 못 받은 앨범의 곡 수  ${pending}   <- 셈에 넣지 않는다`);
console.log('');
console.log('화면이 적는 수');
console.log(`  머리말 (canonicalUniverse)     ${a.headline}`);
console.log(`  체크된 곡 (원본 id)            ${a.selectedRaw}`);
console.log(`  하단 (canonicalSelection)      ${a.selectedDistinct}   <- 월드컵에 올라가는 수`);
console.log('');

const gap = a.headline - a.selectedDistinct;
console.log(`머리말 - 하단 = ${gap}`);

if (gap !== 0) {
  console.log('  갈라진 곳:');
  const selKeys = new Set(a.selectedTitles.filter(Boolean).map((t) => songKey(a.name, t)));
  const missing = new Set([...releasedKeys].filter((k) => !selKeys.has(k)));
  for (const al of loaded) {
    for (const t of al.titles) {
      if (missing.has(songKey(a.name, t))) console.log(`    ${t}   (${al.title})`);
    }
  }
  if (pending) console.log(`    수록곡을 못 받은 앨범이 말하는 곡 수: ${pending}`);
}

if (pendingAlbums.length) {
  console.log('');
  console.log('수록곡을 못 받은 앨범');
  for (const x of pendingAlbums.slice(0, 20)) {
    console.log(`    ${x.totalTracks}곡이라 함 · ${x.type} · ${x.year} · ${x.title}`);
  }
}

console.log('');
console.log(`머리말을 확정해서 말할 수 있나: ${a.settled ? '예' : '아니오 — "곡 수 확인 중…" 으로 보인다'}`);
console.log('');
console.log(gap === 0 ? '결과: 통과 (머리말 = 하단)' : `결과: 실패 — ${gap}곡 어긋남`);
process.exitCode = gap === 0 ? 0 : 1;

await browser.close();
