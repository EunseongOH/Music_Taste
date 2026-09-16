"use client";

import * as htmlToImage from "html-to-image";

/**
 * 플랫폼별로 구현이 갈리는 동작만 모아 둔 어댑터 — **웹 구현**.
 *
 * 이 파일의 내용은 `app/taste/page.tsx` 에 인라인으로 있던 코드를 그대로
 * 옮긴 것이다. 새로 쓴 로직이 아니므로 웹 동작은 달라지지 않는다
 * (`npm run baseline:verify` 로 내보내기 결과를 바이트 비교해 확인한다).
 *
 * 토스 미니앱 빌드는 빌드 시점에 `toss/app/src/platform.toss.ts` 로 치환된다.
 * WebView 에는 `<a download>` · `window.open` · `navigator.share` 가 없거나
 * 막혀 있어서, 같은 일을 앱인토스 SDK 로 해야 하기 때문이다.
 *
 * 여기 담는 것은 "플랫폼이 다르면 달라지는 것" 뿐이다. CSV 를 만드는 규칙,
 * 파일 이름, 여러 장 내보내기 확인창, 토스트, 분석 이벤트 같은 **제품 로직은
 * 페이지에 그대로 남긴다** — 그래야 두 빌드의 동작이 갈라지지 않는다.
 */

/**
 * `native` = 플랫폼이 제공하는 공유 시트(설치된 앱 목록)를 여는 수단.
 * 유니온은 토스 구현(`toss/app/src/platform.toss.ts`)과 같아야 한다 —
 * 한쪽만 고치면 토스 빌드의 타입 검사가 바로 잡는다.
 */
export type ShareTarget = "native" | "link" | "image" | "x" | "instagram" | "kakao";

/**
 * 사용자에게 그대로 보여도 되는 오류.
 *
 * 어댑터가 실패하는 이유는 플랫폼마다 다르고(권한 거부, 구버전 앱 등),
 * "다시 시도해 주세요" 한 줄로는 사용자가 할 수 있는 일이 없다. 이 타입으로
 * 던진 메시지만 화면에 그대로 띄운다 — 내부 오류 문구가 새지 않는다.
 */
export class PlatformError extends Error {}

/**
 * 이 플랫폼에서 노출할 공유 수단. 페이지가 이 목록으로 버튼을 가른다.
 *
 * 웹은 각 SNS 버튼을 직접 두므로 `native`(공유 시트)를 넣지 않는다.
 * 카카오 버튼이 이미 `navigator.share` 를 부르고 있어 중복이다.
 */
export const shareTargets: ShareTarget[] = ["link", "image", "x", "instagram", "kakao"];

/**
 * 공유·복사에 쓸 링크. 저장된 취향표가 있으면 그 주소, 없으면 현재 주소.
 *
 * `ogImageUrl` 은 토스 구현에서만 쓴다(공유 링크의 미리보기 이미지).
 * 웹은 `taste/[id]/layout.tsx` 의 generateMetadata 가 같은 일을 이미 하므로
 * 받기만 하고 쓰지 않는다 — 시그니처를 맞춰 호출부를 하나로 유지한다.
 */
export async function shareUrl(savedId: string | null, ogImageUrl?: string): Promise<string> {
  void ogImageUrl;
  return savedId ? `${window.location.origin}/taste/${savedId}` : window.location.href;
}

/** 화면 요소를 PNG 로 만들어 사용자에게 저장시킨다. */
export async function saveImage(el: HTMLElement, fileName: string): Promise<void> {
  // cacheBust 는 쓰지 않는다. 카드 안 커버는 useInlinedCovers 가 미리 data URL 로
  // 바꿔 두므로 저장 시점에 다시 받을 이유가 없고, 재요청은 누락 위험만 늘린다.
  const dataUrl = await htmlToImage.toPng(el, {
    pixelRatio: 5,
  });
  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

/** CSV 본문(`data:` URI 로 인코딩되기 전 문자열)을 파일로 저장시킨다. */
export async function saveCsv(csvContent: string, fileName: string): Promise<void> {
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 클립보드에 텍스트를 넣는다.
 *
 * 돌려주는 값은 실제로 한 일이다. 웹은 항상 `'copied'` 지만, 토스 구현은
 * 클립보드가 막히면 공유 시트를 대신 열고 `'sheet'` 를 돌려준다.
 */
export async function copyText(text: string): Promise<"copied" | "sheet"> {
  navigator.clipboard.writeText(text);
  return "copied";
}

/**
 * 시스템 공유 시트를 연다. 지원하지 않으면 `false` 를 돌려주므로
 * 호출부가 링크 복사로 넘어갈 수 있다(기존 동작 그대로).
 */
export async function share(params: {
  title: string;
  text: string;
  url: string;
}): Promise<boolean> {
  if (!navigator.share) return false;
  navigator.share(params).catch(() => {});
  return true;
}

/** 외부 주소를 연다. */
export async function openExternal(url: string): Promise<void> {
  window.open(url, "_blank");
}
