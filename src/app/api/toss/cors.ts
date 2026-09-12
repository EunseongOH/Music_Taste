/**
 * 앱인토스 미니앱(WebView)에서 오는 교차 출처 요청을 위한 CORS 헬퍼.
 *
 * 미니앱 번들은 토스가 호스팅하는 별도 origin에서 서빙되므로, 이 서버로 오는
 * 요청은 교차 출처가 된다. SDK 3.x 문서와 FAQ의 표기가 상충해서(3.x 표에는
 * `*.web.tossmini.com`, FAQ에는 2026-08-25 이후 업로드분부터 `*.apps.tossmini.com`)
 * 네 가지를 모두 허용한다.
 *
 * 주의: CORS는 보안 경계가 아니다(브라우저 밖에서는 무시된다). 인증이 필요한
 * 엔드포인트는 별도의 검증을 반드시 갖춰야 한다.
 */
const APP_NAME = 'sortify';

const ALLOWED_ORIGINS = new Set([
  `https://${APP_NAME}.apps.tossmini.com`, // 실서비스
  `https://${APP_NAME}.private-apps.tossmini.com`, // 콘솔 QR 테스트
  `https://${APP_NAME}.web.tossmini.com`, // 예비(문서 표기 상충)
  `https://${APP_NAME}.private-web.tossmini.com`, // 예비
]);

/** 허용된 origin일 때만 CORS 헤더를 만든다. 그 외에는 빈 객체. */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** preflight 응답. 허용 origin이 아니면 헤더 없이 204만 돌려준다. */
export function preflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}
