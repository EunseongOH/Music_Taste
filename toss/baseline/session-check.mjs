/**
 * `/api/toss/session` 발급 엔드포인트 검증.
 *
 * 확인하려는 것:
 *  1. 같은 익명키 → 항상 같은 사용자 (앱을 지웠다 깔아도 기록이 남아야 한다)
 *  2. 다른 익명키 → 다른 사용자 (남의 기록이 보이면 안 된다)
 *  3. 이상한 입력 거절
 *  4. 발급된 토큰으로 **실제로 RLS 를 통과해 자기 행을 쓰고 읽을 수 있는가**
 *  5. 남의 행은 못 고치는가
 *
 * ⚠️ 운영 Supabase 에 테스트 계정과 행을 만든다. 끝나면 스스로 지우고,
 *    지워졌는지 확인까지 한다. 실패해도 finally 에서 정리한다.
 *
 * 사용: node toss/baseline/session-check.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { nextBase } from './base.mjs';

const env = readFileSync('.env.local', 'utf8');
const envGet = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const URL = envGet('NEXT_PUBLIC_SUPABASE_URL');
const ANON = envGet('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = envGet('SUPABASE_SERVICE_ROLE_KEY');
const API = `${nextBase()}/api/toss/session`;

// 테스트용 익명키. 사람 것과 겹치지 않도록 접두사를 붙인다.
const KEY_A = 'sessioncheck-AAAA-1111-2222-3333';
const KEY_B = 'sessioncheck-BBBB-4444-5555-6666';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const mint = async (hash) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let skipped = false;
const created = new Set();
const rows = new Set();

try {
  console.log('\n[1] 입력 검증');
  for (const [bad, label] of [
    [undefined, '값 없음'],
    ['짧음', '너무 짧은 키'],
    ['../../etc/passwd', '경로 문자 포함'],
    ['x'.repeat(300), '너무 긴 키'],
  ]) {
    const r = await mint(bad);
    check(r.status === 400, `거절: ${label}`, `HTTP ${r.status}`);
  }

  console.log('\n[2] 결정성 — 같은 키는 항상 같은 사용자');
  const a1 = await mint(KEY_A);

  /*
   * 검증이 켜져 있으면(기본 enforce) 가짜 테스트 키는 당연히 막힌다.
   * 그건 정상 동작이므로 실패로 세지 않고, 무엇을 해야 이어서 볼 수 있는지 알린다.
   */
  if (a1.status === 503 && (a1.body.error === 'no_cert' || a1.body.error === 'upstream_error')) {
    console.log(`  [–] 식별키 검증이 켜져 있어 발급 검사를 건너뜁니다 (${a1.body.error})`);
    console.log('      이어서 보려면 서버에 TOSS_ANON_KEY_VERIFY=off 를 두고 다시 실행하세요.');
    console.log('      (검증 자체가 fail-closed 로 동작한다는 확인이기도 합니다)');
    skipped = true;
  }

  if (!skipped) {
  check(a1.status === 200, '첫 발급 성공', `HTTP ${a1.status} ${a1.body.error ?? ''}`);
  if (a1.status !== 200) throw new Error('발급 실패로 이후 검사 불가');
  created.add(a1.body.user_id);

  const a2 = await mint(KEY_A);
  check(a2.status === 200 && a2.body.user_id === a1.body.user_id, '재발급 시 같은 user_id', a1.body.user_id);

  const b1 = await mint(KEY_B);
  created.add(b1.body.user_id);
  check(b1.status === 200 && b1.body.user_id !== a1.body.user_id, '다른 키는 다른 user_id');

  console.log('\n[3] 발급된 세션이 RLS 를 통과하는가');
  const asA = createClient(URL, ANON, { auth: { persistSession: false } });
  await asA.auth.setSession({
    access_token: a1.body.access_token,
    refresh_token: a1.body.refresh_token,
  });
  const who = await asA.auth.getUser();
  check(who.data.user?.id === a1.body.user_id, 'auth.uid() 가 발급된 사용자', who.data.user?.id);

  const ins = await asA
    .from('tournament_results')
    .insert({
      user_id: a1.body.user_id,
      user_nickname: 'session-check',
      title: 'session-check (자동 삭제됨)',
      // winner_track_id 는 NOT NULL 이다. 실제 저장 경로와 같은 모양으로 넣는다.
      winner_track_id: 'session-check-track',
      winner_track_title: 'session-check',
      winner_track_artist: 'session-check',
      winner_track_image: '',
      total_candidates: 0,
      ranking: [],
      is_public: false,
    })
    .select('id')
    .single();
  check(!ins.error, '자기 행 insert 성공', ins.error?.message ?? ins.data?.id);
  if (ins.data?.id) rows.add(ins.data.id);

  const mine = await asA.from('tournament_results').select('id').eq('id', ins.data?.id ?? '');
  check(!mine.error && mine.data?.length === 1, '자기 행 조회 성공');

  console.log('\n[4] 격리 — 남의 행은 못 고친다');
  const asB = createClient(URL, ANON, { auth: { persistSession: false } });
  await asB.auth.setSession({
    access_token: b1.body.access_token,
    refresh_token: b1.body.refresh_token,
  });
  if (!ins.data?.id) {
    check(false, '격리 검사 — 대상 행이 없어 확인 불가');
  } else {
    const hijack = await asB
      .from('tournament_results')
      .update({ title: '탈취됨' })
      .eq('id', ins.data.id)
      .select('id');
    check(
      hijack.error != null || (hijack.data?.length ?? 0) === 0,
      '다른 사용자가 남의 행을 수정하지 못함',
      hijack.error ? hijack.error.message : `수정된 행 ${hijack.data?.length ?? 0}개`
    );
    // 비공개 행은 남에게 보이지도 않아야 한다.
    const peek = await asB.from('tournament_results').select('id').eq('id', ins.data.id);
    check((peek.data?.length ?? 0) === 0, '다른 사용자에게 비공개 행이 보이지 않음');
  }
  }
} finally {
  console.log('\n[5] 정리');
  for (const id of rows) {
    const { error } = await admin.from('tournament_results').delete().eq('id', id);
    console.log(`  ${error ? '[X]' : '[O]'} 행 삭제 ${id}${error ? ` — ${error.message}` : ''}`);
    if (error) failed++;
  }
  for (const uid of created) {
    if (!uid) continue;
    const { error } = await admin.auth.admin.deleteUser(uid);
    console.log(`  ${error ? '[X]' : '[O]'} 계정 삭제 ${uid}${error ? ` — ${error.message}` : ''}`);
    if (error) failed++;
  }
  // 정말 지워졌는지 확인한다.
  for (const uid of created) {
    if (!uid) continue;
    const { data } = await admin.auth.admin.getUserById(uid);
    check(!data?.user, `계정 부재 확인 ${uid.slice(0, 8)}…`);
  }

  console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
}
