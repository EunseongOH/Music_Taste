"use client";

/**
 * Google Analytics 4 커스텀 이벤트 전송 유틸리티
 * @param action 이벤트 이름
 * @param params 전송할 추가 파라미터 객체
 */
export const trackEvent = (action: string, params?: Record<string, any>) => {
  if (typeof window !== "undefined") {
    const gtag = (window as any).gtag;
    if (typeof gtag === "function") {
      gtag("event", action, params);
    } else {
      console.log(`[GA4 Event Mock] ${action}`, params);
    }
  }
};
