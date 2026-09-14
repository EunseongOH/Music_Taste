import { request as httpsRequest } from 'node:https';

/**
 * 토스 서버에 사용자 식별키가 유효한지 확인한다.
 *
 * 문서: /documentation/common/authentication/hash-key ("식별키 검증하기")
 *   POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/users/anon-key/verify
 *   헤더 x-anon-key: <hash> / 본문 없음
 *   성공 { "resultType": "SUCCESS", "success": "true" }
 *   401  식별키가 없거나 매핑된 사용자를 찾을 수 없음
 *
 * 서버 간 통신이라 mTLS 클라이언트 인증서가 필요하다. Edge 런타임은 mTLS 를
 * 하지 못하므로 이 모듈을 쓰는 라우트는 Node 런타임이어야 한다.
 *
 * `fetch` 대신 node:https 를 쓰는 이유: Next 가 감싼 fetch 에 클라이언트
 * 인증서를 넘기는 경로가 런타임마다 다르다. node:https 는 어디서나 같다.
 */

const HOST = 'apps-in-toss-api.toss.im';
const PATH = '/api-partner/v1/apps-in-toss/users/anon-key/verify';
const TIMEOUT_MS = 5000;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_key' | 'no_cert' | 'upstream_error'; detail?: string };

/**
 * 인증서를 환경변수에서 읽는다. 발급 형태가 두 가지라 둘 다 받는다.
 *  - PKCS#12(.p12/.pfx) 한 덩어리  → TOSS_MTLS_PFX_BASE64 (+ 암호)
 *  - PEM 쌍(.crt/.pem + .key)      → TOSS_MTLS_CERT_BASE64 / TOSS_MTLS_KEY_BASE64
 * 줄바꿈이 많은 PEM 을 환경변수에 그대로 넣으면 깨지기 쉬워서 base64 로 받는다.
 */
function clientCredentials():
  | { pfx: Buffer; passphrase?: string }
  | { cert: Buffer; key: Buffer; passphrase?: string }
  | null {
  const passphrase = process.env.TOSS_MTLS_PASSPHRASE || undefined;

  const pfx = process.env.TOSS_MTLS_PFX_BASE64;
  if (pfx) return { pfx: Buffer.from(pfx, 'base64'), passphrase };

  const cert = process.env.TOSS_MTLS_CERT_BASE64;
  const key = process.env.TOSS_MTLS_KEY_BASE64;
  if (cert && key) {
    return {
      cert: Buffer.from(cert, 'base64'),
      key: Buffer.from(key, 'base64'),
      passphrase,
    };
  }
  return null;
}

export async function verifyAnonKey(hash: string): Promise<VerifyResult> {
  const creds = clientCredentials();
  if (!creds) return { ok: false, reason: 'no_cert' };

  return new Promise<VerifyResult>((resolve) => {
    const req = httpsRequest(
      {
        host: HOST,
        path: PATH,
        method: 'POST',
        headers: { accept: 'application/json', 'x-anon-key': hash, 'content-length': 0 },
        ...creds,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 401) {
            resolve({ ok: false, reason: 'invalid_key' });
            return;
          }
          if (res.statusCode !== 200) {
            resolve({
              ok: false,
              reason: 'upstream_error',
              detail: `HTTP ${res.statusCode} ${body.slice(0, 200)}`,
            });
            return;
          }
          try {
            // success 는 문자열 "true" 다(불리언이 아니다).
            const parsed = JSON.parse(body) as { success?: string };
            resolve(
              parsed.success === 'true'
                ? { ok: true }
                : { ok: false, reason: 'invalid_key', detail: body.slice(0, 200) }
            );
          } catch {
            resolve({ ok: false, reason: 'upstream_error', detail: `파싱 실패: ${body.slice(0, 200)}` });
          }
        });
      }
    );

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      resolve({ ok: false, reason: 'upstream_error', detail: `${TIMEOUT_MS}ms 초과` });
    });
    req.on('error', (err) =>
      resolve({ ok: false, reason: 'upstream_error', detail: err.message })
    );
    req.end();
  });
}
