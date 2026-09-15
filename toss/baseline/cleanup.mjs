/**
 * 기준선 캡처 중 자동저장으로 생긴 tournament_results 행을 지운다.
 *
 *   node toss/baseline/cleanup.mjs <id> [<id> ...]
 *   node toss/baseline/cleanup.mjs --from-manifest
 *
 * 지우기 전에 행 내용을 먼저 보여주고 --yes 가 없으면 아무것도 지우지 않는다.
 * 운영 DB 를 건드리므로 의도적으로 두 단계로 나눠 두었다.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// .env.local 을 직접 읽는다(별도 플래그 없이 실행할 수 있도록).
const env = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('.env.local 에서 SUPABASE URL / SERVICE_ROLE_KEY 를 찾지 못했습니다.');
  process.exit(2);
}

const args = process.argv.slice(2);
const yes = args.includes('--yes');
let ids = args.filter((a) => !a.startsWith('--'));

if (args.includes('--from-manifest')) {
  for (const dir of ['refs-auth']) {
    const p = join(HERE, dir, 'manifest.json');
    if (existsSync(p)) {
      const id = JSON.parse(readFileSync(p, 'utf8')).savedId;
      if (id) ids.push(id);
    }
  }
}
ids = [...new Set(ids)];

if (!ids.length) {
  console.error('지울 id 가 없습니다. id 를 인자로 주거나 --from-manifest 를 쓰세요.');
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await supabase
  .from('tournament_results')
  .select('id, title, user_id, user_nickname, total_candidates, is_public, created_at')
  .in('id', ids);

if (error) {
  console.error('조회 실패:', error.message);
  process.exit(1);
}
if (!data?.length) {
  console.log('해당 id 의 행이 없습니다 (이미 삭제되었을 수 있음).');
  process.exit(0);
}

console.log(`대상 ${data.length}건:`);
for (const r of data) {
  console.log(`  ${r.id}`);
  console.log(`    제목=${r.title}  곡수=${r.total_candidates}  공개=${r.is_public}`);
  console.log(`    작성=${r.user_nickname} (${r.user_id})  생성=${r.created_at}`);
}

if (!yes) {
  console.log('\n확인만 했습니다. 실제로 지우려면 --yes 를 붙여 다시 실행하세요.');
  process.exit(0);
}

const { error: delErr } = await supabase.from('tournament_results').delete().in('id', ids);
if (delErr) {
  console.error('삭제 실패:', delErr.message);
  process.exit(1);
}
console.log(`\n${data.length}건 삭제 완료.`);
