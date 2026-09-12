/**
 * `@/utils/gtag` 대체.
 *
 * 원본은 `window.gtag` 로 GA4 이벤트를 보낸다. 토스 빌드에는 GA 스크립트가
 * 없으므로(@next/third-parties 는 Next 전용) 아무 데도 보내지 않는다.
 *
 * 앱인토스 쪽 대응은 `Analytics.log({ log_name, log_type, params })` 인데,
 * `log_type` 의 유효값이 문서에 없다. 추측해서 넣으면 지표가 조용히 잘못
 * 쌓이므로, 값을 확인한 뒤 Phase 9.5(주요 기능·핵심 지표 등록)에서 잇는다.
 * 그때까지는 호출해도 아무 일이 없다 — 개발 중에만 콘솔로 확인한다.
 */
export const trackEvent = (action: string, params?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[toss] trackEvent(미연결) ${action}`, params);
  }
};
