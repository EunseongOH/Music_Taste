/**
 * 로그인 상태 기준선 캡처 (login.mjs 로 프로필을 만든 뒤 실행).
 *
 * 게스트 기준선(capture.mjs)이 못 덮는 부분을 덮는다. 공유 핸들러 4종이 전부
 *   savedId ? `${origin}/taste/${savedId}` : location.href
 * 로 분기하는데, 게스트는 savedId 가 없어 이 분기를 탈 수 없다. 로그인 + 16곡
 * 이상이면 자동저장이 걸려 savedId 가 생기므로 진짜 공유 URL 경로를 검증할 수 있다.
 *
 *   node toss/baseline/capture-auth.mjs
 *
 * 주의: 자동저장은 운영 Supabase 의 tournament_results 에 실제 행을 만든다.
 * 생성된 id 는 manifest 와 콘솔에 남기며, cleanup.mjs 로 지울 수 있다.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, '.profile');
const OUT = join(HERE, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'refs-auth');
const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:3000';
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

// capture.mjs 와 동일해야 두 기준선을 나란히 비교할 수 있다.
const FIXED_TIME = new Date('2026-01-15T09:00:00+09:00');

const TEMPLATES = [
  { key: 'pyramid', tab: '피라미드형' },
  { key: 'list', tab: '리스트형' },
  { key: 'retro', tab: '레코드형' },
  { key: 'mosaic', tab: '모자이크형' },
  { key: 'poster', tab: '포스터형' },
];

if (!existsSync(PROFILE)) {
  console.error(`프로필이 없습니다: ${PROFILE}\n먼저 node toss/baseline/login.mjs 를 실행해 로그인하세요.`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});

const page = context.pages()[0] ?? (await context.newPage());
await page.clock.setFixedTime(FIXED_TIME);

// 원격 앨범아트를 결정적 응답으로 대체 (capture.mjs 와 동일 규칙).
await context.route('**://i.scdn.co/**', async (route) => {
  const url = route.request().url().replace(/[?&](t=)?\d{10,}$/g, ''); // capture.mjs 와 같은 규칙
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (url.charCodeAt(i) + ((h << 5) - h)) | 0;
  const hue = Math.abs(h) % 360;
  const tag = Math.abs(h).toString(16).slice(0, 6);
  await route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body:
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">` +
      `<rect width="640" height="640" fill="hsl(${hue} 55% 62%)"/>` +
      `<text x="320" y="345" font-family="monospace" font-size="72" fill="#fff" ` +
      `text-anchor="middle">${tag}</text></svg>`,
  });
});

await page.addInitScript(
  ({ ranking }) => {
    try {
      sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
      sessionStorage.setItem('locale', 'ko');
    } catch {}

    window.__captured = [];
    window.__shares = [];

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__captured.push({ name: this.download, href: this.href });
        return;
      }
      return origClick.apply(this, arguments);
    };

    // 공유 경로를 실제로 실행하지 않고 인자만 기록한다.
    window.open = (url) => {
      window.__shares.push({ via: 'window.open', url: String(url) });
      return null;
    };
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (t) => {
            window.__shares.push({ via: 'clipboard', url: String(t) });
            return Promise.resolve();
          },
        },
      });
    } catch {}
    try {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d) => {
          window.__shares.push({ via: 'navigator.share', url: d?.url, title: d?.title, text: d?.text });
          return Promise.resolve();
        },
      });
    } catch {}
  },
  { ranking: RANKING }
);

page.on('dialog', (d) => d.accept());

const log = (...a) => console.log(...a);
log(`→ ${BASE}/taste  (로그인 프로필, ${RANKING.length}곡)`);
await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

await page.getByRole('tab', { name: '리스트형' }).waitFor({ state: 'visible', timeout: 180_000 });
log('  템플릿 탭 노출됨');

await page.addStyleTag({
  content: `*, *::before, *::after {
    animation: none !important; transition: none !important; animation-play-state: paused !important; }`,
});

const settle = async () => {
  try {
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 15_000 });
  } catch {}
  await page.waitForTimeout(1200);
};
await settle();

// 자동저장(16곡 이상)이 끝나 savedId 가 생길 때까지 기다린다.
log('  자동저장 대기…');
await page.waitForTimeout(8000);

const manifest = { fixedTime: FIXED_TIME.toISOString(), trackCount: RANKING.length, mode: 'authenticated', files: [], shares: [], savedId: null, user: null };

// 세션은 쿠키에 들어있고, 4KB 를 넘으면 `...auth-token.0`, `.1` 로 쪼개진다.
manifest.user = await page.evaluate(() => {
  try {
    const jar = {};
    for (const part of document.cookie.split('; ')) {
      const i = part.indexOf('=');
      if (i > 0) jar[part.slice(0, i)] = part.slice(i + 1);
    }
    const hit = Object.keys(jar).find((k) => /^sb-.*-auth-token(\.0)?$/.test(k));
    if (!hit) return null;
    const root = hit.replace(/\.0$/, '');
    let raw = jar[root] ?? '';
    if (!raw) {
      for (let i = 0; ; i++) {
        const chunk = jar[`${root}.${i}`];
        if (chunk == null) break;
        raw += chunk;
      }
    }
    raw = decodeURIComponent(raw);
    if (raw.startsWith('base64-')) {
      // atob 은 바이트를 latin1 문자열로 돌려준다. 그대로 JSON.parse 하면
      // 한글 닉네임이 깨지므로 UTF-8 로 다시 디코드한다.
      const bin = atob(raw.slice(7));
      raw = new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    const v = JSON.parse(raw);
    return { id: v?.user?.id ?? null, nickname: v?.user?.user_metadata?.nickname ?? null };
  } catch {
    return null;
  }
});
log(`  사용자: ${manifest.user?.nickname ?? '?'} (${manifest.user?.id ?? '?'})`);

async function drain(label) {
  const items = await page.evaluate(() => {
    const c = window.__captured;
    window.__captured = [];
    return c;
  });
  for (const it of items) {
    const comma = it.href.indexOf(',');
    const payload = it.href.slice(comma + 1);
    const buf = /;base64/i.test(it.href.slice(0, comma))
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    const safe = it.name.replace(/[^\w.\-가-힣]/g, '_');
    writeFileSync(join(OUT, safe), buf);
    manifest.files.push({ name: safe, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), from: label });
    log(`    ✓ ${safe}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
  if (!items.length) log(`    ! ${label}: 캡처 없음`);
}

const openSheet = async () => {
  await page.getByRole('button', { name: '저장', exact: false }).first().click();
  await page.getByRole('button', { name: '9:16 이미지 저장' }).waitFor({ state: 'visible', timeout: 20_000 });
};

for (const tpl of TEMPLATES) {
  log(`  [${tpl.key}]`);
  await page.getByRole('tab', { name: tpl.tab }).click();
  await page.waitForTimeout(2500);
  await settle();
  await openSheet();
  await page.getByRole('button', { name: '9:16 이미지 저장' }).click();
  // 여러 장이면 확인 시트가 뜬다("N장 저장하기").
  const saveAll = page.getByRole('button', { name: /장 저장하기$/ });
  await saveAll.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (await saveAll.count()) await saveAll.click();
  await page
    .getByRole('button', { name: '9:16 이미지 저장' })
    .waitFor({ state: 'hidden', timeout: 180_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  await drain(tpl.key);
}

log('  [csv]');
await openSheet();
await page.getByRole('button', { name: 'Excel 저장' }).click();
await page.waitForTimeout(1500);
await drain('csv');

// 공유 경로 — savedId 분기를 타는지 확인한다.
//
// 주의: Excel 저장은 바텀시트를 닫지 않는다(이미지 저장만 setShowSaveSheet(false)
// 를 호출). 열린 시트가 하단 액션바를 가리므로 먼저 닫아야 한다.
// 공유 모달도 마찬가지로 각 공유 핸들러가 스스로 닫지 않으므로(인스타그램만 예외)
// 한 번만 열고 버튼을 연속으로 누른다.
log('  [share]');
const dismiss = async () => {
  const cancel = page.getByRole('button', { name: '취소' });
  if (await cancel.count()) {
    await cancel
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(600);
  }
};
await dismiss();

await page.getByRole('button', { name: '공유하기' }).first().click();
await page.waitForTimeout(800);

// 인스타그램은 handleDownloadImage 를 다시 돌리고 안내 모달을 띄우므로 제외한다.
for (const label of ['취향표 링크 복사하기', 'X (트위터)로 공유', '스레드로 공유', '카카오톡으로 공유']) {
  const btn = page.getByRole('button', { name: label });
  if (!(await btn.count())) {
    log(`    ! "${label}" 버튼 없음`);
    continue;
  }
  await btn
    .first()
    .click({ timeout: 15_000 })
    .catch((e) => log(`    ! "${label}" 클릭 실패: ${String(e).split('\n')[0]}`));
  await page.waitForTimeout(900);
}
await dismiss();

manifest.shares = await page.evaluate(() => window.__shares);
for (const s of manifest.shares) log(`    ${s.via}: ${String(s.url).slice(0, 90)}`);

const m = manifest.shares.map((s) => String(s.url ?? '')).join(' ').match(/\/taste\/([0-9a-f-]{36})/i);
manifest.savedId = m ? m[1] : null;

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

log(`\n파일 ${manifest.files.length}개, 공유 ${manifest.shares.length}건 → ${OUT}`);
if (manifest.savedId) {
  log(`\n자동저장으로 생성된 tournament_results id:\n  ${manifest.savedId}`);
  log('정리하려면: node toss/baseline/cleanup.mjs ' + manifest.savedId);
} else {
  log('\nsavedId 를 확인하지 못했습니다 (자동저장이 걸리지 않았을 수 있음).');
}

await context.close();
