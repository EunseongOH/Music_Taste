/**
 * 기준선 캡처용 로그인 프로필 만들기 (사람이 1회만 수행).
 *
 * 구글·카카오 OAuth는 실제 계정이 필요해서 자동화할 수 없다. 대신 영속 브라우저
 * 프로필을 띄워 사람이 한 번 로그인하면, 이후 capture-auth.mjs가 그 세션을
 * 재사용해 로그인 상태 기준선을 자동으로 뜬다.
 *
 *   node toss/baseline/login.mjs
 *
 * 창이 뜨면 평소처럼 로그인하세요. 세션이 감지되면 스크립트가 알아서 종료됩니다.
 * 프로필은 toss/baseline/.profile 에 저장되고 .gitignore 되어 있습니다(토큰 포함).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, '.profile');
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:3000';

const TIMEOUT_MS = 15 * 60 * 1000;

console.log(`프로필: ${PROFILE}`);
console.log(`대상  : ${BASE}\n`);

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  args: ['--window-size=480,1000'],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });

console.log('창이 열렸습니다. 평소처럼 로그인해 주세요 (구글/카카오/이메일 무엇이든).');
console.log('로그인이 감지되면 자동으로 닫힙니다.\n');

/**
 * Supabase 세션이 들어왔는지 확인한다.
 *
 * @supabase/ssr 의 createBrowserClient 는 토큰을 localStorage 가 아니라 **쿠키**에
 * 넣고, 4KB 를 넘으면 `...auth-token.0`, `.1` 로 쪼갠다(이 프로젝트가 HTTP 431
 * 대응 코드를 갖고 있는 이유). 그래서 localStorage 만 보면 로그인을 놓친다.
 */
const readSession = () => page.evaluate(readSessionInPage).catch(() => ({ key: null }));

function readSessionInPage() {
  const out = { key: null, email: null, nickname: null };
  try {
    const jar = {};
    for (const part of document.cookie.split('; ')) {
      const i = part.indexOf('=');
      if (i > 0) jar[part.slice(0, i)] = part.slice(i + 1);
    }
    const hit = Object.keys(jar).find((k) => /^sb-.*-auth-token(\.0)?$/.test(k));
    if (!hit) return out;
    const root = hit.replace(/\.0$/, '');
    out.key = root;

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
      // atob 은 바이트를 latin1 문자열로 돌려준다 — UTF-8 로 다시 디코드해야
      // 한글 닉네임이 깨지지 않는다.
      const bin = atob(raw.slice(7));
      raw = new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    const v = JSON.parse(raw);
    out.email = v?.user?.email ?? null;
    out.nickname = v?.user?.user_metadata?.nickname ?? null;
  } catch {}
  return out;
}

const started = Date.now();
let found = null;
let ticks = 0;

while (Date.now() - started < TIMEOUT_MS) {
  const s = await readSession();
  if (s.key) {
    found = s;
    break;
  }
  if (++ticks % 15 === 0) {
    console.log(`  대기 중… ${Math.round((Date.now() - started) / 1000)}초 경과`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

if (!found) {
  console.error('\n시간 초과 — 로그인이 감지되지 않았습니다.');
  await context.close();
  process.exit(1);
}

// 토큰이 디스크에 확실히 flush 되도록 잠시 둔다.
await page.waitForTimeout(2500);

console.log('\n로그인 감지됨');
console.log(`  스토리지 키 : ${found.key}`);
console.log(`  이메일      : ${found.email ?? '(없음)'}`);
console.log(`  닉네임      : ${found.nickname ?? '(없음)'}`);
console.log('\n프로필을 저장했습니다. 이제 capture-auth.mjs 를 돌릴 수 있습니다.');

await context.close();
