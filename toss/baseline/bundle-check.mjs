/**
 * `.ait` 로 나갈 번들이 정책과 범위를 지키는지 확인한다.
 *
 * 화면을 열어 보는 검사(flow-check)로는 잡히지 않는 것들이다 —
 * "실리면 안 되는 것이 실렸는가"는 빌드 산출물을 봐야 안다.
 *
 * 사용: npm run build:toss && node toss/baseline/bundle-check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../app/dist');

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const files = readdirSync(join(DIST, 'assets'));
const js = files
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, src: readFileSync(join(DIST, 'assets', f), 'utf8') }));
const all = js.map((j) => j.src).join('\n');

console.log('\n[1] 관리자 화면 미포함');
/*
 * `/manager-taste-control` 은 App.tsx 의 라우트 표에 없어야 하고, 그러면
 * 번들에도 들어가지 않는다. 경로 문자열 자체는 두 곳에서 남는다 —
 * LayoutWrapper 의 pathname 검사와, 홈의 어드민 링크(is_admin 인 사용자에게만
 * 보인다). 그래서 경로명이 아니라 **관리자 화면에만 있는 문구**로 판정한다.
 */
const ADMIN_ONLY = ['공식 발매 완료 목록', '거절 및 삭제', '공식 발매 완료로 변경'];
for (const s of ADMIN_ONLY) check(!all.includes(s), `"${s}" 없음`);

/*
 * 믹스 매치(여러 아티스트)는 사용자 화면에서 내렸다 — docs/mode-pivot.md.
 * 라우트 표에서 빠졌으면 번들에도 없어야 한다. 관리자 화면과 같은 방식으로,
 * 경로명이 아니라 **그 화면에만 있는 문구**로 판정한다. 되살릴 때 이 블록을 지운다.
 */
console.log('\n[1-b] 장르 선택 화면 미포함 (믹스 매치 격리)');
const GENRE_ONLY = ['선호하는 음악 장르를 골라주세요', 'Select your favorite music genres'];
for (const g of GENRE_ONLY) check(!all.includes(g), `"${g}" 없음`);

console.log('\n[2] appName 일관성');
/*
 * appName 은 세 곳에 흩어져 있다 — 설정, CORS 허용 origin, 딥링크.
 * 한 군데만 고치면 다른 쪽이 조용히 어긋나고, 그 결과는 기기에서야 드러난다
 * (preflight 실패 / 열리지 않는 공유 링크).
 * 실제 파일에서 읽어 셋이 같은지 본다.
 */
const REPO = join(DIST, '../../..');
const pick = (file, re) => (readFileSync(join(REPO, file), 'utf8').match(re) ?? [])[1];
const appName = pick('apps-in-toss.config.ts', /appName:\s*'([^']+)'/);
const corsName = pick('src/app/api/toss/cors.ts', /APP_NAME\s*=\s*'([^']+)'/);
const linkName = pick('toss/app/src/platform.toss.ts', /intoss:\/\/([A-Za-z0-9_-]+)/);

check(!!appName, 'apps-in-toss.config.ts 에서 appName 읽음', appName);
check(corsName === appName, 'CORS 허용 origin 의 appName 일치', `${corsName} vs ${appName}`);
check(linkName === appName, '딥링크의 appName 일치', `${linkName} vs ${appName}`);
// 빌드된 번들에도 같은 딥링크가 들어갔는지 본다.
check(all.includes(`intoss://${appName}`), `번들에 intoss://${appName} 포함`);

console.log('\n[3] 앱인토스 정책');
// 비게임 출시 가이드: eval 금지.
check(!/\beval\s*\(/.test(all), 'eval 호출 없음');
// 라이트 모드 필수 — 다크 모드 분기가 없어야 한다.
check(!all.includes('prefers-color-scheme'), 'prefers-color-scheme 분기 없음');

console.log('\n[4] Safe Area — 화면 아래 고정 요소');
/*
 * `fixed bottom-0` 인 요소는 홈 인디케이터에 가리지 않게 toss.css 에서
 * 패딩을 더해 준다. 그 규칙은 요소가 쓰는 Tailwind 패딩 클래스별로 있어서,
 * 새 조합이 생기면 조용히 누락된다 — 기기에서만 드러나는 종류의 문제다.
 * 관리자 화면은 토스에 실리지 않으므로 제외한다.
 */
const css = readFileSync(join(REPO, 'toss/app/src/toss.css'), 'utf8');
const covered = [
  ...new Set([...css.matchAll(/\.fixed\.bottom-0\.([a-z]+-\d+)\s*\{/g)].map((m) => m[1])),
];
/*
 * 반응형 변형(`sm:p-6`)은 세지 않는다. 모바일 폭에서는 적용되지 않으므로
 * 그걸 근거로 통과시키면 실제로는 처리되지 않은 요소를 놓친다.
 * `pt-`·`px-` 는 아래 패딩과 무관하므로 p-/pb- 만 본다.
 */
const PAD = /(?<![\w:-])(?:p|pb)-\d+\b/g;

const pages = [];
const walk = (dir) => {
  for (const e of readdirSync(join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'manager-taste-control') walk(rel);
    } else if (e.name.endsWith('.tsx')) pages.push(rel);
  }
};
walk('src/app');

const missing = [];
for (const f of pages) {
  for (const line of readFileSync(join(REPO, f), 'utf8').split('\n')) {
    if (!/fixed bottom-0/.test(line)) continue;
    const pads = line.match(PAD) ?? [];
    // 하나라도 규칙에 없으면 잡는다. `some` 으로 두면 다른 패딩이 걸렸다는
    // 이유로 처리되지 않은 클래스를 통과시킨다.
    const uncovered = pads.filter((p) => !covered.includes(p));
    if (pads.length === 0 || uncovered.length > 0) {
      missing.push(`${f}: ${uncovered.join(' ') || '(패딩 클래스 없음)'}`);
    }
  }
}
check(
  missing.length === 0,
  `고정 요소가 모두 Safe Area 규칙에 걸림 (규칙: ${covered.join(', ')})`,
  missing.join(' | ')
);

console.log('\n[5] 번들 크기');
const total = files.reduce((n, f) => n + statSync(join(DIST, 'assets', f)).size, 0);
const jsBytes = js.reduce((n, j) => n + Buffer.byteLength(j.src), 0);
console.log(`      assets 합계 ${(total / 1024).toFixed(0)}kB (JS ${(jsBytes / 1024).toFixed(0)}kB)`);
// 압축 해제 기준 100MB 제한에는 한참 못 미친다. 여기서 보는 건 첫 로딩 체감이다.
check(jsBytes < 1.5 * 1024 * 1024, 'JS 1.5MB 미만', '넘으면 라우트별 분할 필요(Phase 9.3)');

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
