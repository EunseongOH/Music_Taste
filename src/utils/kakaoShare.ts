"use client";

/**
 * 카카오톡 공유 — **진짜 Kakao SDK**.
 *
 * 전에는 "카카오톡으로 공유" 버튼이 `navigator.share()` 를 불렀다. 그건 OS 공유
 * 시트라 카카오톡이 지정되지 않고, 데스크톱에는 `navigator.share` 가 없어 조용히
 * 링크 복사로 떨어졌다 — 카카오 버튼을 눌렀는데 카카오가 열리지 않았다.
 *
 * 키는 `NEXT_PUBLIC_KAKAO_JS_KEY`(JavaScript 키)다. 공개 키라 번들에 들어가는 것이
 * 정상이며, 실제 보호는 카카오 콘솔의 **플랫폼 도메인 등록**이 한다.
 * 키가 없으면 이 모듈은 조용히 `null` 을 돌려주고, 호출부가 예전 경로로 떨어진다 —
 * 키를 넣기 전에도 배포가 깨지지 않는다.
 *
 * 토스 빌드에서는 부르지 않는다(`platform.shareTargets` 에 'kakao' 가 없다).
 * 스크립트도 이 함수를 부를 때만 붙으므로 토스 번들에는 로드되지 않는다.
 */

const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
const SDK_INTEGRITY = "sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4";

interface KakaoSdk {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (settings: Record<string, unknown>) => void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loading: Promise<KakaoSdk | null> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      if (window.Kakao) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("kakao sdk load failed")), { once: true });
      return;
    }
    const el = document.createElement("script");
    el.src = SDK_SRC;
    el.integrity = SDK_INTEGRITY;
    el.crossOrigin = "anonymous";
    el.async = true;
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("kakao sdk load failed")), { once: true });
    document.head.appendChild(el);
  });
}

/** 준비된 SDK. 키가 없거나 로드에 실패하면 null — 호출부가 다른 경로로 간다. */
export function loadKakao(): Promise<KakaoSdk | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return Promise.resolve(null);
  if (loading) return loading;

  loading = (async () => {
    try {
      await injectScript();
      const sdk = window.Kakao;
      if (!sdk) return null;
      if (!sdk.isInitialized()) sdk.init(key);
      return sdk;
    } catch (err) {
      console.warn("[kakao] SDK 를 불러오지 못했어요. 다른 공유 경로로 갑니다.", err);
      // 다음 시도에서 다시 받아 보게 한다(일시적인 네트워크 오류일 수 있다).
      loading = null;
      return null;
    }
  })();
  return loading;
}

/**
 * 카카오톡 공유창을 연다. 보냈으면 true.
 *
 * `feed` 템플릿을 쓴다 — 제목·설명·이미지·버튼이 카드로 나간다. 이미지가 없으면
 * 카카오가 알아서 이미지 없는 카드로 그린다(그래서 없을 때 억지로 채우지 않는다).
 */
export async function shareToKakao(params: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  buttonLabel: string;
}): Promise<boolean> {
  const sdk = await loadKakao();
  if (!sdk) return false;
  try {
    sdk.Share.sendDefault({
      objectType: "feed",
      content: {
        title: params.title,
        description: params.description,
        ...(params.imageUrl ? { imageUrl: params.imageUrl } : {}),
        link: { webUrl: params.url, mobileWebUrl: params.url },
      },
      buttons: [
        { title: params.buttonLabel, link: { webUrl: params.url, mobileWebUrl: params.url } },
      ],
    });
    return true;
  } catch (err) {
    console.warn("[kakao] 공유창을 열지 못했어요.", err);
    return false;
  }
}
