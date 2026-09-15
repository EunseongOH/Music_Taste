import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/utils/supabase/admin';
import { corsHeaders, preflight } from '../cors';
import { verifyAnonKey } from '../verifyAnonKey';

/**
 * 토스 익명 식별키 → Supabase 세션 발급.
 *
 * 기존 RLS 정책이 전부 `auth.uid()` 기반이라, 토스 사용자도 **진짜 Supabase
 * 세션**이 있어야 자기 취향표를 저장하고 다시 볼 수 있다. 익명키(hash)로부터
 * 이메일·비밀번호를 **결정적으로** 유도해서, 같은 사람이 다시 들어오면 항상
 * 같은 `auth.users` 행으로 로그인되게 한다.
 *
 * DB·RLS·스키마는 한 줄도 바꾸지 않는다. 발급된 사용자는 평범한 `auth.users`
 * 행이고 `auth.uid()` 가 실제 UUID 라서 기존 정책이 그대로 적용된다.
 *
 * 닉네임은 여기서 만들지 않는다. `AuthProvider` 가 닉네임이 없는 사용자를
 * 자가 치유하므로(components/AuthProvider.tsx), 웹 사용자와 같은 경로를 탄다.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 보안: hash 는 bearer credential 이다. 남의 hash 를 아는 사람은 그 계정으로
 * 로그인할 수 있고, CORS 는 보안 경계가 아니다(브라우저 밖에서는 무시된다).
 * 그래서 두 겹으로 막는다.
 *
 *  1. `TOSS_USER_PEPPER` 가 없으면 503. 운영에 이 값을 넣기 전까지는 배포돼
 *     있어도 아무도 쓸 수 없다.
 *  2. `TOSS_ANON_KEY_VERIFY` 로 토스 서버 검증을 건다. **기본값이 enforce** 라
 *     인증서를 설정하지 않으면 발급이 막힌다(fail-closed). 조용히 열린 채로
 *     남는 것보다 눈에 띄게 막히는 편이 낫다.
 *
 * ⚠️ 샌드박스는 mock 식별키를 주므로 검증에 실패한다(문서 명시).
 *    샌드박스에서 볼 때는 `TOSS_ANON_KEY_VERIFY=off`, 실제 확인은 QR 로 한다.
 *
 * Edge 런타임은 mTLS 를 못 하므로 Node 런타임을 유지해야 한다.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const runtime = 'nodejs';

const EMAIL_DOMAIN = 'toss.sortify.kr';

/** 익명키에서 결정적으로 유도한 계정 정보. 서버 밖으로 나가지 않는다. */
function deriveCredentials(hash: string, pepper: string) {
  const id = createHash('sha256').update(hash).digest('hex').slice(0, 32);
  return {
    email: `toss_${id}@${EMAIL_DOMAIN}`,
    password: createHmac('sha256', pepper).update(hash).digest('hex'),
  };
}

/*
 * 사용자 *생성* 에만 거는 속도 제한. 기존 사용자의 재로그인은 제한하지 않는다
 * (콜드스타트마다 일어나는 정상 동작이다).
 *
 * ponytail: 인스턴스 메모리라 서버가 여러 대면 각자 센다. 익명키 검증이
 * 들어오면 이 방어는 부차적인 것이 되므로, 그때 필요하면 공용 저장소로 옮긴다.
 */
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_LIMIT = 20;
const createLog = new Map<string, number[]>();

function allowCreate(ip: string): boolean {
  const now = Date.now();
  const recent = (createLog.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS);
  if (recent.length >= CREATE_LIMIT) {
    createLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  createLog.set(ip, recent);
  // 오래된 항목 정리 — 메모리가 무한정 늘지 않게 한다.
  if (createLog.size > 5000) {
    for (const [k, v] of createLog) {
      if (v.every((t) => now - t >= CREATE_WINDOW_MS)) createLog.delete(k);
    }
  }
  return true;
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));
  const pepper = process.env.TOSS_USER_PEPPER;

  if (!pepper) {
    // 기본값은 꺼짐. 익명키 검증이 들어오기 전에는 켜지 않는다.
    return NextResponse.json({ error: 'not_enabled' }, { status: 503, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers });
  }

  const { hash } = (body ?? {}) as { hash?: unknown };
  // 토스 익명키는 불투명한 문자열이다. 길이·문자만 확인해 이상한 입력을 막는다.
  if (typeof hash !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(hash)) {
    return NextResponse.json({ error: 'invalid_hash' }, { status: 400, headers });
  }

  /*
   * 토스 서버에 식별키를 확인한다.
   *  enforce(기본) — 통과하지 못하면 발급하지 않는다
   *  log           — 결과를 남기되 발급은 허용한다. 인증서 설정 직후 전환용
   *  off           — 호출하지 않는다. 샌드박스처럼 mock 키를 쓰는 환경 전용
   *
   * 토스 서버 장애로 확인이 안 될 때도 발급하지 않는다. 로그인이 잠시 막히는
   * 쪽이, 확인되지 않은 키로 남의 계정에 들어가는 것보다 낫다.
   */
  const mode = process.env.TOSS_ANON_KEY_VERIFY ?? 'enforce';
  if (mode !== 'off') {
    const verified = await verifyAnonKey(hash);
    if (!verified.ok) {
      console.error(
        `[api/toss/session] 식별키 검증 실패 (${mode}): ${verified.reason}`,
        verified.detail ?? ''
      );
      if (mode !== 'log') {
        const status = verified.reason === 'invalid_key' ? 403 : 503;
        return NextResponse.json({ error: verified.reason }, { status, headers });
      }
    }
  }

  const { email, password } = deriveCredentials(hash, pepper);

  // 세션 발급에는 anon key 클라이언트를 쓴다. admin 클라이언트는 세션을
  // 만들지 않으므로(persistSession:false), 사용자 생성에만 쓴다.
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const signIn = async () => auth.auth.signInWithPassword({ email, password });

  let { data, error } = await signIn();

  if (error) {
    // 처음 들어온 사용자다. 만들고 다시 로그인한다.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    if (!allowCreate(ip)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers });
    }

    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { provider: 'toss' },
    });

    if (created.error) {
      console.error('[api/toss/session] 사용자 생성 실패:', created.error.message);
      return NextResponse.json({ error: 'create_failed' }, { status: 502, headers });
    }

    ({ data, error } = await signIn());
  }

  if (error || !data?.session) {
    console.error('[api/toss/session] 로그인 실패:', error?.message);
    return NextResponse.json({ error: 'signin_failed' }, { status: 502, headers });
  }

  return NextResponse.json(
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.session.user.id,
    },
    { headers }
  );
}
