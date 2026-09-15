/**
 * `@/components/LoginModal` 대체.
 *
 * 토스 빌드는 익명 식별키(User.getAnonymousKey)로만 사용자를 식별한다.
 * 자체 로그인 UI 를 띄우지 않으므로 아무것도 그리지 않는다.
 *
 * 원본도 닫힌 상태(`isOpen=false`)에서는 아무것도 그리지 않으므로,
 * 이 shim 으로 바꿔도 화면은 달라지지 않는다. 대신 이메일/구글/카카오
 * OAuth 팝업 경로(window.open + opener.postMessage)가 번들에서 통째로
 * 빠진다 — WebView 에는 window.opener 가 없어 어차피 동작하지 않는다.
 */
export default function LoginModal(_props: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locale?: 'ko' | 'en';
}) {
  return null;
}
