/**
 * Phase 7.2 — 내보내기 회귀 검증.
 *
 * refs/(리팩터 전 기준선)를 다시 뜬 결과와 바이트 단위로 비교한다.
 * `taste/page.tsx`를 고친 뒤 이 스크립트가 통과하면 이미지·CSV 내보내기가
 * 변하지 않았다는 뜻이다.
 *
 *   node toss/baseline/verify.mjs
 *
 * 차이가 있으면 exit 1. refs/ 자체를 갱신하려면 refs/를 지우고 capture.mjs를
 * 다시 돌린다(= 기준선을 새로 잡는 것이므로 의도적으로만).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = join(HERE, 'refs');
const TMP = join(HERE, 'refs-verify');

if (!existsSync(join(REFS, 'manifest.json'))) {
  console.error(`기준선이 없습니다: ${REFS}\n먼저 node toss/baseline/capture.mjs 를 실행하세요.`);
  process.exit(2);
}

rmSync(TMP, { recursive: true, force: true });
execFileSync(process.execPath, [join(HERE, 'capture.mjs'), '--out', 'refs-verify', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

const load = (d) => JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'));
const before = load(REFS);
const after = load(TMP);

if (before.fixedTime !== after.fixedTime) {
  console.error(`\n시계 고정값이 다릅니다 — 비교 불가 (${before.fixedTime} vs ${after.fixedTime})`);
  process.exit(2);
}

const map = new Map(after.files.map((f) => [f.name, f]));
let same = 0;
const diffs = [];

console.log('\n=== 내보내기 회귀 비교 ===');
for (const f of before.files) {
  const o = map.get(f.name);
  if (!o) {
    diffs.push(`${f.name} — 생성되지 않음`);
    console.log(`  없음  ${f.name}`);
  } else if (o.sha256 !== f.sha256) {
    diffs.push(`${f.name} — ${f.bytes}B → ${o.bytes}B`);
    console.log(`  차이  ${f.name}  (${f.bytes} → ${o.bytes} bytes)`);
  } else {
    same++;
    console.log(`  동일  ${f.name}`);
  }
}
for (const f of after.files) {
  if (!before.files.some((b) => b.name === f.name)) {
    diffs.push(`${f.name} — 기준선에 없던 파일`);
    console.log(`  신규  ${f.name}`);
  }
}

console.log(`\n동일 ${same} / 차이 ${diffs.length}`);
if (diffs.length) {
  console.log('\n회귀 의심:');
  for (const d of diffs) console.log('  - ' + d);
  console.log(`\n두 폴더를 직접 열어 비교하세요:\n  ${REFS}\n  ${TMP}`);
  process.exit(1);
}
console.log('내보내기 결과가 기준선과 동일합니다.');
rmSync(TMP, { recursive: true, force: true });
