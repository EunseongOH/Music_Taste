/**
 * 공유 경로 회귀 검사.
 *
 * `baseline:verify` 는 내보내기(PNG·CSV) 결과만 바이트 비교한다. 공유 버튼이
 * 실제로 무엇을 하는지는 그걸로 안 잡히는데, Task 2.1 에서 그 코드를 전부
 * 어댑터 호출로 바꿨으므로 따로 확인해야 한다.
 *
 * 실제로 나가는 동작(새 창 열기·클립보드·시스템 공유)은 가로채서 기록만 하고
 * 실행하지 않는다.
 *
 * 사용: node toss/baseline/share-check.mjs        # 웹(:3000)
 *       TARGET=toss node toss/baseline/share-check.mjs   # 토스 빌드(:5173)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKING = JSON.parse(readFileSync(join(HERE, 'fixture.json'), 'utf8'));

const TOSS = process.env.TARGET === 'toss';
const BASE = TOSS ? 'http://localhost:5173' : 'http://localhost:3000';

/**
 * 웹에서 보여야 할 공유 수단.
 *
 * 토스 빌드는 개별 SNS 버튼 대신 OS 공유 시트 하나(`다른 앱으로 공유하기`)를
 * 둔다. 외부 SNS 공유가 금지라서가 아니라 — 그런 조항은 없다 — 시트 하나면
 * 사용자가 앱을 직접 고르고, 나가는 링크도 토스 공유 링크로 고정되기 때문이다.
 */
const WEB_LABELS = [
  'X (트위터)로 공유',
  '카카오톡으로 공유',
  '인스타그램 스토리에 공유',
  '취향표 링크 복사하기',
];
const TOSS_LABELS = ['다른 앱으로 공유하기', '취향표 링크 복사하기'];

/** 공유 본문(`<TOP 10>\n\n<링크>`)에서 링크를 뺀 앞부분. */
const topTenPart = (text) => text.split('\n\n').slice(0, -1).join('\n\n');

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();

// 앨범아트는 고정 색으로 대체해 네트워크에 기대지 않는다.
await ctx.route('**://i.scdn.co/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#c8b8a0"/></svg>',
  })
);

/**
 * 결과 화면이 뜨려면 순위 fixture 가 sessionStorage 에 있어야 한다.
 * sessionStorage 는 탭마다 따로라서 **페이지를 새로 열 때마다** 심어야 한다
 * (컨텍스트 단위로 한 번 심으면 두 번째 탭에서 결과 화면이 아예 안 뜬다).
 */
const seed = (p) => p.addInitScript(({ ranking }) => {
  sessionStorage.setItem('worldcup_ranking', JSON.stringify(ranking));
  sessionStorage.setItem('locale', 'ko');

  // 바깥으로 나가는 동작을 가로채 기록만 한다.
  window.__acts = [];
  window.open = (url) => {
    window.__acts.push({ kind: 'open', url });
    return null;
  };
  navigator.clipboard.writeText = async (text) => {
    window.__acts.push({ kind: 'clipboard', text });
  };
  navigator.share = async (data) => {
    window.__acts.push({ kind: 'share', data });
  };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__acts.push({ kind: 'download', name: this.download });
      return;
    }
    return origClick.apply(this, arguments);
  };
}, { ranking: RANKING });

await seed(page);

const acts = () => page.evaluate(() => window.__acts);

try {
  console.log(`\n대상: ${BASE}${TOSS ? ' (토스 빌드)' : ' (웹)'}`);
  await page.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: '피라미드형' }).waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: '공유하기' }).first().click();
  await page.waitForTimeout(1200);

  console.log('\n[1] 공유 모달 구성');
  const expected = TOSS ? TOSS_LABELS : WEB_LABELS;
  const absent = TOSS ? WEB_LABELS.filter((l) => !TOSS_LABELS.includes(l)) : [];
  for (const l of expected) {
    check((await page.getByRole('button', { name: l }).count()) > 0, `"${l}" 있음`);
  }
  for (const l of absent) {
    check((await page.getByRole('button', { name: l }).count()) === 0, `"${l}" 없음 (정책상 제외)`);
  }

  console.log('\n[2] 각 버튼이 실제로 하는 일');
  if (!TOSS) {
    await page.getByRole('button', { name: 'X (트위터)로 공유' }).click();
    await page.waitForTimeout(600);
    const x = (await acts()).find((a) => a.kind === 'open');
    check(
      !!x && x.url.startsWith('https://twitter.com/intent/tweet?text='),
      'X — 트윗 작성 창 주소 생성',
      x ? decodeURIComponent(x.url).slice(0, 60) : '동작 없음'
    );
    check(!!x && /취향표 TOP 10/.test(decodeURIComponent(x.url)), 'X — 본문에 TOP 10 포함');

    await page.getByRole('button', { name: '카카오톡으로 공유' }).click();
    await page.waitForTimeout(600);
    const k = (await acts()).find((a) => a.kind === 'share');
    check(!!k, '카카오 — 시스템 공유 시트 호출', k ? `title="${k.data.title}"` : '동작 없음');
    check(!!k && typeof k.data.url === 'string' && k.data.url.length > 0, '카카오 — 공유 링크 포함');
  }

  await page.getByRole('button', { name: '취향표 링크 복사하기' }).click();
  await page.waitForTimeout(800);

  if (TOSS) {
    /*
     * 앱인토스 SDK 는 토스 앱 밖에서 "apps-in-toss 웹뷰 환경이 아니에요" 로
     * throw 한다. 그러니 브라우저에서 확인할 수 있는 것은 성공이 아니라
     * **실패가 사용자에게 보이는가** 다. 버튼이 먹통처럼 보이면 안 된다.
     * 복사 성공 경로는 실기기에서만 확인할 수 있다(Phase 8.3).
     */
    check(
      (await page.getByText(/클립보드를 쓸 수 없어요|클립보드 권한이 꺼져 있어요|복사에 실패했어요|링크를 복사하지 못했어요/).count()) > 0,
      '토스 앱 밖 — 실패가 오류 토스트로 보임'
    );
  } else {
    const c = (await acts()).find((a) => a.kind === 'clipboard');
    check(!!c, '링크 복사 — 클립보드 기록', c ? c.text.replace(/\n/g, ' / ').slice(0, 60) : '동작 없음');
    // 링크만이 아니라 TOP 10 까지 복사한다(의도된 웹 동작 변경).
    check(!!c && /취향표 TOP 10/.test(c.text), '링크 복사 — 본문에 TOP 10 포함');
    check(!!c && /https?:\/\//.test(c.text), '링크 복사 — http(s) 주소 포함');
    // 심사 제한: "공유하기 링크가 자사 웹사이트로 랜딩되는 경우". 링크는
    // 어댑터가 만든 것 하나뿐이어야 한다 — buildShareText 가 주소를 섞기
    // 시작하면 토스 빌드의 공유 메시지까지 같이 오염되므로 여기서 잡는다.
    check(!!c && !/https?:\/\//.test(topTenPart(c.text)), '링크 복사 — TOP 10 본문에는 주소 없음');
    check(
      (await page.getByText('취향표가 복사되었어요').count()) > 0,
      '링크 복사 — 토스트 노출'
    );
  }

  if (TOSS) {
    /*
     * [3] 가짜 호스트로 공유 시트에 **실제로 나가는 값**을 본다.
     *
     * 위 [2] 는 토스 앱 밖이라 SDK 가 throw 하는 것까지만 확인한다. 무엇을
     * 공유하는지는 실기기에서만 보이는데, 그러면 `intoss-private://` 같은
     * 출시 차단 사유가 QR 테스트까지 안 잡힌다. 그래서 SDK 가 기대하는
     * 브리지 프로토콜만 흉내 내 호출 인자를 가로챈다.
     *
     * 프로토콜(@webview-bridge/web + @apps-in-toss/web-framework):
     *  - 나갈 때: window.ReactNativeWebView.postMessage(JSON{type:'bridge',
     *    body:{method, eventId, args}})
     *  - 받을 때: window.nativeEmitter.emit(`${method}-${eventId}`, 값)
     *  - operationalEnvironment='sandbox' 면 버전 게이트가 통과해
     *    ogImageUrl 을 넘기는 V2 경로를 탄다(V1 은 인자를 버린다).
     */
    const probe = await ctx.newPage();
    await seed(probe);
    await probe.addInitScript(() => {
      window.__appsInTossConstants = {
        operationalEnvironment: 'sandbox',
        platformOS: 'ios',
        tossAppVersion: '5.239.0',
      };
      window.__bridgeCalls = [];
      window.ReactNativeWebView = {
        postMessage(raw) {
          let msg;
          try {
            msg = JSON.parse(raw);
          } catch {
            return;
          }
          if (msg.type !== 'bridge') return;
          const { method, eventId, args } = msg.body;
          window.__bridgeCalls.push({ method, args });
          const reply =
            method === 'getTossShareLink'
              ? { shareLink: 'https://minion.toss.im/TESTLINK' }
              : undefined;
          setTimeout(() => window.nativeEmitter?.emit(`${method}-${eventId}`, reply), 0);
        },
      };
    });

    console.log('\n[3] 공유 시트에 나가는 값 (가짜 호스트)');
    await probe.goto(`${BASE}/taste`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await probe.getByRole('button', { name: '피라미드형' }).waitFor({ state: 'visible', timeout: 180_000 });
    await probe.waitForTimeout(1500);
    await probe.getByRole('button', { name: '공유하기' }).first().click();
    await probe.waitForTimeout(1200);
    await probe.getByRole('button', { name: '다른 앱으로 공유하기' }).click();
    await probe.waitForTimeout(1500);

    const calls = await probe.evaluate(() => window.__bridgeCalls);
    const link = calls.find((c) => c.method === 'getTossShareLink');
    const sheet = calls.find((c) => c.method === 'share');
    const linkArg = link?.args?.[0] ?? {};
    const sheetMsg = sheet?.args?.[0]?.message ?? '';

    check(!!link, '링크 생성 브리지 호출', link ? JSON.stringify(linkArg).slice(0, 80) : '호출 없음');
    check(
      typeof linkArg.url === 'string' && linkArg.url.startsWith('intoss://sortify-musictaste'),
      '딥링크 — intoss:// + 콘솔 appName',
      linkArg.url ?? '없음'
    );
    // 출시 체크리스트: 공유 기능에 테스트 스킴을 쓰면 안 된다.
    check(!/intoss-private:\/\//.test(linkArg.url ?? ''), '딥링크 — 테스트 스킴 아님');
    check(
      typeof linkArg.ogImageUrl === 'string' && linkArg.ogImageUrl.startsWith('https://'),
      '미리보기 이미지 전달',
      linkArg.ogImageUrl ?? '없음'
    );
    check(!!sheet, '공유 시트 브리지 호출');
    check(/취향표 TOP 10/.test(sheetMsg), '시트 메시지 — TOP 10 포함');
    check(sheetMsg.includes('https://minion.toss.im/TESTLINK'), '시트 메시지 — 생성된 링크 포함');
    // 시트가 열렸는데 클립보드까지 건드리면 권한 팝업이 겹쳐 뜬다.
    check(
      !calls.some((c) => c.method === 'setClipboardText'),
      '시트 경로에서 클립보드 브리지 호출 없음'
    );

    /*
     * 로그인하지 않은 검사라 savedId 가 null 이다. 그래서 `?id=<uuid>` 가
     * 붙는지는 여기서 못 본다 — 확인하려면 운영 DB 에 취향표를 써야 한다.
     * 실기기(QR) 확인 항목으로 남긴다.
     */
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
