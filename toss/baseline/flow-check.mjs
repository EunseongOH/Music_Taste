/**
 * 토스 빌드의 핵심 동선을 실제로 걸어 본다.
 *
 * 확인하려는 것:
 *  - 각 라우트가 오류 없이 렌더되고, Next 판과 같은 화면으로 끝나는가
 *    (리다이렉트도 결과에 포함된다 — /worldcup 은 데이터가 없으면 /tracks 로 간다)
 *  - Spotify 데이터가 shim → /api/toss/spotify 디스패치를 통해 실제로 오는가.
 *    토스 빌드에는 Server Action 이 없으므로 이 경로가 유일하다.
 *  - 상대 경로로 나가는 fetch(`/api/spotify-search`)가 apiBase 패치로
 *    기존 Next 서버를 향하는가
 *
 * 클릭으로 퍼널을 끝까지 끌고 가는 대신 저장소를 심는다. 선택 결과만 주면
 * 각 페이지가 자기 데이터 경로를 그대로 타므로, 셀렉터에 덜 의존한다.
 *
 * 사용: node toss/baseline/flow-check.mjs
 */
import { chromium } from 'playwright';

const VITE = 'http://localhost:5173';
// 3000 을 다른 앱이 쓰고 있으면 NEXT_BASE 로 바꾼다(토스 dev 서버는 VITE_DEV_API_BASE 도 같이).
const NEXT = process.env.NEXT_BASE ?? 'http://localhost:3000';

/** 아이유 — 기준선(fixture.json)에서 쓰는 것과 같은 아티스트다. */
const ARTIST = { id: '7c1HgFDe8ogy5NOZ1ANCJQ', name: 'IU', image: '' };

/** 실제 공개 취향표 하나. 읽기만 하며 DB 를 바꾸지 않는다. */
const SHARED_ID = '631ac9fe-0305-4b26-bad8-05908a5ccae4';

/**
 * `/tracks` 는 아티스트를 펼쳐야 앨범을 부르고, 앨범을 눌러야 트랙을 부른다.
 * 검색창은 디바운스 후 `/api/spotify-search` 로 나간다(상대 경로 → apiBase 패치).
 */
async function digTracks(page) {
  // 아코디언 토글은 <button> 이 아니라 onClick 이 달린 div 다. 아티스트
  // 이름(h2)을 누르면 이벤트가 그 div 로 올라간다.
  const open = page.locator('section[id^="artist-section-"] h2').first();
  if (await open.count()) {
    await open.click();
    await page.waitForTimeout(3500); // getArtistAlbums
    const album = page.locator('section[id^="artist-section-"] img').first();
    if (await album.count()) {
      // 앨범 커버 위에 hover 오버레이 div 가 덮여 있다. 클릭은 그 div 에
      // 떨어지지만 같은 컨테이너 안이라 핸들러까지 버블링된다.
      await album.click({ force: true });
      await page.waitForTimeout(3500); // getAlbumTracks
    }
  }
  const search = page.locator('main input[type="text"], main input:not([type])').first();
  if (await search.count()) {
    await search.fill('밤편지');
    await page.waitForTimeout(3000); // 디바운스 + /api/spotify-search
  }
}

const CASES = [
  { route: '/', seed: {} },
  { route: '/genres', seed: {} },
  // 장르를 심으면 장르 기반 아티스트 검색을 탄다.
  // (getSpotifyGenreQuery 는 explore 에서 import 만 하고 쓰지 않는다 —
  //  서버의 searchArtistsByGenres 안에서 호출된다)
  {
    route: '/explore',
    seed: { selected_genres: JSON.stringify(['k-pop', 'korean indie', 'jazz']) },
    expect: ['searchArtistsByGenres'],
    // 장르 기반 추천은 매번 다른 아티스트를 준다. 웹만 연속 두 번 열어도
    // 목록이 달라지는 것을 확인했으므로, 텍스트 완전 일치를 요구할 수 없다.
    // 대신 고정된 문구가 있는지와 이미지 개수로 본다.
    text: 'skip',
    contains: ['어떤 아티스트를 좋아하시나요?', '선택 장르'],
  },
  // 아티스트를 심고 펼치면 앨범 → 트랙 → 검색까지 이어진다.
  {
    route: '/tracks',
    seed: { selectedArtists: JSON.stringify([ARTIST]) },
    act: digTracks,
    expect: ['getArtistAlbums', 'getAlbumTracks'],
    expectUrl: ['/api/spotify-search'],
  },
  { route: '/worldcup', seed: {} },
  { route: '/taste', seed: {} },
  { route: '/explore-taste', seed: {} },
  // 공개 아카이브는 실제 DB 를 읽는다. 목록이 바뀔 수 있어 고정 문구로 본다.
  { route: '/archive', seed: {}, text: 'skip', contains: ['취향 아카이브'] },
  // 공유된 취향표. 토스는 `/shared?id=`, 웹은 `/taste/<id>` 로 같은 화면을 연다.
  {
    route: `/taste/${SHARED_ID}`,
    tossRoute: `/shared?id=${SHARED_ID}`,
    seed: {},
  },
  // 앱 안에서의 이동은 웹과 같은 `/taste/<uuid>` 형태다 (archive/page.tsx:801).
  { route: `/taste/${SHARED_ID}`, seed: {} },
  // 저장된 취향표 다시 보기(자동 저장 없음). 공개 취향표라 게스트도 열린다.
  { route: `/my-taste?id=${SHARED_ID}`, seed: {} },
];

/** 두 문자열이 처음 갈라지는 지점을 사람이 읽을 수 있게 보여준다. */
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `${a.length}자 vs ${b.length}자, ${i}번째부터: 웹 "${a.slice(i, i + 40)}" / 토스 "${b.slice(i, i + 40)}"`;
}

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

/** 페이지를 열고 화면 텍스트·API 호출·오류를 모은다. */
async function visit(ctx, base, route, seed, act) {
  const page = await ctx.newPage();
  const errors = [];
  const api = [];

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => {
    // GA 는 헤드리스에서 차단된다. 토스 빌드에는 아예 없다.
    if (r.url().includes('google-analytics')) return;
    errors.push(`요청 실패 ${r.url().slice(0, 70)}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    let fn = '';
    if (u.includes('/api/toss/spotify')) {
      try {
        fn = JSON.parse(r.postData() ?? '{}').fn;
      } catch {}
    }
    api.push({ u, fn });
  });
  page.on('response', (r) => {
    const hit = api.find((a) => a.u === r.url() && a.status === undefined);
    if (hit) hit.status = r.status();
  });

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

  // networkidle 은 쓰지 않는다 — /tracks 는 앨범을 배경에서 계속 불러오므로
  // 네트워크가 조용해지는 순간이 오지 않아 그대로 타임아웃난다.
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 장르 기반 검색은 여러 번 왕복하므로 넉넉히 기다린다.
  await page.waitForTimeout(5000);

  if (act) await act(page);

  const view = await page.evaluate(() => {
    const root = document.querySelector('main') ?? document.getElementById('root') ?? document.body;
    return {
      imgs: root.querySelectorAll('img').length,
      text: (root.innerText ?? '').replace(/\s+/g, ' ').trim(),
    };
  });

  return { page, errors: [...new Set(errors)], api, view, url: new URL(page.url()).pathname };
}

const browser = await chromium.launch();
/** 케이스마다 새 컨텍스트를 연다 — 심은 저장소가 다음 케이스로 새면 안 된다. */
const freshCtx = () => browser.newContext({ viewport: { width: 430, height: 900 } });

try {
  for (const { route, tossRoute, seed, act, expect = [], expectUrl = [], text = 'exact', contains = [] } of CASES) {
    console.log(`\n${route}`);
    const [vc, nc] = [await freshCtx(), await freshCtx()];
    const v = await visit(vc, VITE, tossRoute ?? route, seed, act);
    const n = await visit(nc, NEXT, route, seed, act);

    console.log(`      토스: ${v.url} / 이미지 ${v.view.imgs} / "${v.view.text.slice(0, 60)}"`);
    console.log(`      웹  : ${n.url} / 이미지 ${n.view.imgs}`);

    if (tossRoute) {
      // 토스는 딥링크를 쿼리 형태로 받는다. 경로는 다르고 화면이 같아야 한다.
      console.log(`      (토스는 ${tossRoute} 로 같은 화면을 연다)`);
    } else {
      check(v.url === n.url, '최종 경로가 웹과 같음', `${v.url} vs ${n.url}`);
    }
    if (text === 'exact') {
      check(
        v.view.text === n.view.text,
        '화면 텍스트가 웹과 같음',
        v.view.text === n.view.text ? '' : firstDiff(n.view.text, v.view.text)
      );
    } else {
      for (const frag of contains) {
        check(v.view.text.includes(frag), `문구 "${frag}" 표시됨`);
      }
      console.log('      (텍스트 완전 일치는 건너뜀 — 목록이 매번 달라진다)');
    }
    if (text === 'exact') {
      check(v.view.imgs === n.view.imgs, '이미지 수가 웹과 같음', `${v.view.imgs} vs ${n.view.imgs}`);
    } else {
      // 목록이 매번 달라지면 개수도 달라진다(웹끼리도 50 vs 30 이 나온다).
      // 여기서 볼 것은 "토스에서도 이미지가 실제로 붙는가" 뿐이다.
      check(v.view.imgs > 0 && n.view.imgs > 0, '양쪽 다 이미지 로드됨', `토스 ${v.view.imgs} / 웹 ${n.view.imgs}`);
    }

    const called = v.api.filter((a) => a.fn).map((a) => a.fn);
    for (const fn of expect) {
      const hit = v.api.find((a) => a.fn === fn);
      check(hit?.status === 200, `디스패치 ${fn}`, hit ? `HTTP ${hit.status}` : '호출 안 됨');
    }
    for (const frag of expectUrl) {
      const hit = v.api.find((a) => a.u.includes(frag));
      check(hit?.status === 200, `호출 ${frag}`, hit ? `HTTP ${hit.status}` : '호출 안 됨');
    }
    if (called.length) console.log(`      디스패치: ${[...new Set(called)].join(', ')}`);

    const bad = v.api.filter((a) => a.status !== 200);
    check(bad.length === 0, 'API 응답 전부 200', bad.map((b) => `${b.fn || b.u} ${b.status}`).join(', '));

    // apiBase 패치 확인 — 상대 경로가 아니라 Next 서버로 나가야 한다.
    const leaked = v.api.filter((a) => a.u.startsWith(VITE));
    check(leaked.length === 0, `API 가 ${NEXT} 로 나감`, leaked.length ? `${leaked.length}건 샘` : `${v.api.length}건`);

    check(v.errors.length === 0, '토스 콘솔/네트워크 오류 없음', v.errors.slice(0, 3).join(' | '));

    await vc.close();
    await nc.close();
  }

  /*
   * 공유받은 사람의 참여 동선.
   *
   * 남의 취향표를 보고 "나도 만들기"를 누르면, 그 취향표를 만든 모드로 홈이
   * 열려야 한다. '최애 곡 줄 세우기' 결과를 보고 들어왔는데 '믹스 매치
   * 월드컵'이 먼저 뜨면 흐름이 끊긴다.
   *
   * 홈의 시작 버튼 href 로 확인한다 — 카드마다 목적지가 다르므로 어떤 카드가
   * 열려 있는지가 그대로 드러난다(카드 0 = /explore?mode=single,
   * 카드 1 = /genres). 캐러셀의 transform 을 읽는 것보다 덜 깨진다.
   */
  console.log('\n참여 동선 (?mode 이어받기)');
  const startHref = (page) =>
    page.evaluate(() => document.querySelector('main a[href^="/explore"], main a[href="/genres"]')?.getAttribute('href') ?? null);

  for (const [base, label, sharedRoute] of [
    [NEXT, '웹  ', `/taste/${SHARED_ID}`],
    [VITE, '토스', `/shared?id=${SHARED_ID}`],
  ]) {
    const ctx = await freshCtx();

    // 1) 파라미터 없는 홈은 지금과 같아야 한다(기존 진입 경로 무영향).
    const plain = await ctx.newPage();
    await plain.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await plain.waitForTimeout(2500);
    check((await startHref(plain)) === '/explore?mode=single', `${label} — 파라미터 없으면 기존과 같이 카드 0`, (await startHref(plain)) ?? '없음');

    // 2) ?mode=multi 로 들어오면 '믹스 매치 월드컵' 카드가 먼저 보인다.
    const multi = await ctx.newPage();
    await multi.goto(`${base}/?mode=multi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await multi.waitForTimeout(2500);
    check((await startHref(multi)) === '/genres', `${label} — ?mode=multi → 믹스 매치 월드컵`, (await startHref(multi)) ?? '없음');

    // 3) 공유 화면의 CTA 가 원본 모드를 붙여 홈으로 보낸다.
    //    SHARED_ID 는 '최애 곡 줄 세우기'(is_single_artist) 결과다.
    const shared = await ctx.newPage();
    await shared.goto(`${base}${sharedRoute}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await shared.waitForTimeout(4000);
    const cta = shared.getByRole('button', { name: '나도 나만의 취향표 소트하기' }).last();
    if ((await cta.count()) === 0) {
      check(false, `${label} — 공유 화면에 CTA 있음`, '버튼 없음');
    } else {
      await cta.click();
      await shared.waitForTimeout(2500);
      const q = new URL(shared.url()).search;
      check(q.includes('mode=single'), `${label} — CTA 가 원본 모드를 이어받음`, shared.url());
      check((await startHref(shared)) === '/explore?mode=single', `${label} — 이동한 홈이 최애 곡 줄 세우기`, (await startHref(shared)) ?? '없음');
    }

    await ctx.close();
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
