import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 미니앱 설정 (SDK 3.x).
 *
 * 주의: 튜토리얼 문서의 예제는 2.x 표기다. 3.x 에서는 파일명이
 * granite.config.ts → apps-in-toss.config.ts 로, `outdir` → `webBundleDir`,
 * `webViewProps` → `webView` 로 바뀌었고 `web`(host/port/commands) 키는 없어졌다.
 * dev/build 커맨드는 package.json 의 dev:toss / build:toss 로 옮겨졌다.
 * 실제 스키마는 node_modules/@apps-in-toss/web-framework/dist/config.d.ts 로 검증했다.
 *
 * appName 은 콘솔에 등록한 값과 반드시 같아야 하며, 딥링크(intoss://<appName>)와
 * CORS Origin(https://<appName>.apps.tossmini.com)에도 쓰인다.
 */
export default defineConfig({
  appName: 'Sortify',

  brand: {
    // 서비스 포인트 컬러(globals.css 의 --color-point)
    primaryColor: '#E67E22',
  },

  // 실제로 SDK 를 호출하기 전까지는 비워 둔다. 쓰지 않는 권한을 선언하면
  // 사용자에게 불필요한 권한 안내가 노출되고 검수에서도 지적될 수 있다.
  // 이미지 저장(photos) · 링크 복사(clipboard) 는 어댑터 구현 시점에 추가한다.
  permissions: [],

  navigationBar: {
    // 앱인토스 네비게이션 바를 사용한다. 자체 뒤로가기(BackButton)와 동시에
    // 노출되면 검수에서 반려되므로, 토스 빌드에서는 BackButton 을 숨긴다.
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
    transparentBackground: false,
    theme: 'light',
  },

  webView: {
    // 비게임 출시 가이드: 제스처 확대·축소 비활성화, 라이트 모드.
    // pullToRefresh 를 끄면 사용자가 문서 전체를 리로드하는 주요 경로가 사라져
    // 딥 경로에서의 화이트스크린 위험도 함께 줄어든다.
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
    // /archive 의 YouTube 임베드를 전체화면 전환 없이 인라인 재생한다.
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: true,
  },

  webBundleDir: 'toss/app/dist',
});
