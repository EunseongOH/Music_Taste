"use client";

/**
 * Google Analytics 4 커스텀 이벤트 전송 유틸리티
 * @param action 이벤트 이름
 * @param params 전송할 추가 파라미터 객체
 */
export const trackEvent = (action: string, params?: Record<string, any>) => {
  if (typeof window !== "undefined") {
    // 개발 모드일 경우 콘솔에 항상 이벤트를 출력하여 디버깅을 돕습니다.
    if (process.env.NODE_ENV === "development") {
      console.log(`🔥 [GA4 Event] ${action}`, params);
    }
    
    const gtag = (window as any).gtag;
    if (typeof gtag === "function") {
      gtag("event", action, params);
    } else if (process.env.NODE_ENV !== "development") {
      // 개발 모드가 아니고 gtag가 없을 때만 폴백 로그를 출력합니다.
      console.log(`[GA4 Event Mock] ${action}`, params);
    }
  }
};
