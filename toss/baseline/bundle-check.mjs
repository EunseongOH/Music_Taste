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

console.log('\n[4] 번들 크기');
const total = files.reduce((n, f) => n + statSync(join(DIST, 'assets', f)).size, 0);
const jsBytes = js.reduce((n, j) => n + Buffer.byteLength(j.src), 0);
console.log(`      assets 합계 ${(total / 1024).toFixed(0)}kB (JS ${(jsBytes / 1024).toFixed(0)}kB)`);
// 압축 해제 기준 100MB 제한에는 한참 못 미친다. 여기서 보는 건 첫 로딩 체감이다.
check(jsBytes < 1.5 * 1024 * 1024, 'JS 1.5MB 미만', '넘으면 라우트별 분할 필요(Phase 9.3)');

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
