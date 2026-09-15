import { SafeArea } from '@apps-in-toss/web-framework';

/**
 * 기기의 Safe Area 를 CSS 변수로 내보낸다.
 *
 * `index.html` 의 `viewport-fit=cover` 때문에 WebView 가 노치·홈 인디케이터
 * 영역까지 덮는다. 그대로 두면 화면 아래 고정된 버튼이 홈 인디케이터에 가린다.
 *
 * `env(safe-area-inset-*)` 도 보통 동작하지만, 앱인토스는 `SafeArea` 를 통해
 * 값을 주는 것을 문서에 명시한다. 그래서 SDK 값을 우선 쓰고, 값이 없을 때만
 * `env()` 로 떨어지도록 CSS 쪽에서 폴백을 둔다(toss.css 참고).
 *
 * 토스 앱 밖(개발 중 브라우저)에서는 SDK 가 throw 하므로 조용히 넘어간다.
 * 그때는 변수가 없어 `env()` → `0px` 순으로 폴백된다.
 */
export function startSafeArea(): () => void {
  const apply = (insets: { top: number; right: number; bottom: number; left: number }) => {
    const s = document.documentElement.style;
    s.setProperty('--sai-top', `${insets.top}px`);
    s.setProperty('--sai-right', `${insets.right}px`);
    s.setProperty('--sai-bottom', `${insets.bottom}px`);
    s.setProperty('--sai-left', `${insets.left}px`);
  };

  try {
    apply(SafeArea.get());
    // 회전·키보드 등으로 값이 바뀌면 다시 반영한다.
    return SafeArea.subscribe({ onEvent: apply });
  } catch {
    // 토스 앱 밖. CSS 폴백에 맡긴다.
    return () => {};
  }
}
