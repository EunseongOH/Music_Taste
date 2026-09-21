"use client";

import * as platform from "@/utils/platform";

/**
 * Spotify 로 돌아가는 링크. 약관상 의무다.
 *
 * Developer Policy II.4 —
 *   "If you display any Spotify Content you must clearly attribute the content as being
 *    supplied and made available by Spotify, by using the Spotify Marks."
 *   "Metadata, cover art and Audio Preview Clips must be accompanied by a link back to
 *    the applicable album, content or playlist on the Spotify Service."
 *
 * 카드마다 붙이지 않는다. 디자인 가이드가 묶음 단위를 인정한다 —
 *   "At the end of each content set, a link to the Spotify app should allow listeners
 *    to keep exploring."
 * 그래서 화면(콘텐츠 묶음)마다 하나만 둔다.
 *
 * 로고 규칙 (같은 문서):
 *   - 아이콘 최소 21px. 풀로고를 놓을 자리가 없을 때 아이콘만 써도 된다
 *   - 초록은 검정·흰 배경에서만. 그 밖에는 모노크롬 (밝은 배경엔 검정)
 *     sortify 는 크림색 바탕이라 초록을 쓰면 위반이다. 검정을 쓴다
 *   - 여백은 아이콘 높이의 절반
 *   - 회전·늘이기·문장 속 사용 금지. 그래서 공식 SVG 를 <img> 로 그대로 쓴다
 *     (경로를 직접 그리면 형태가 틀어질 수 있다)
 *
 * 토스 미니앱에서도 열린다 — platform.openExternal 이 웹은 window.open,
 * 토스는 Device.openURL 로 갈린다. 앱인토스는 "자사 사이트"로 나가는 것만 막고,
 * "서비스 이용에 꼭 필요한 외부 링크"는 열리게 하라고 요구한다.
 */
export default function SpotifyLink({
  href,
  label,
  className = "",
}: {
  /** 이 묶음에 해당하는 Spotify 주소 (아티스트·앨범·트랙) */
  href: string;
  /** 없으면 아이콘만 (자리가 좁을 때) */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label ?? "Spotify에서 보기"}
      onClick={(e) => {
        e.stopPropagation();
        platform.openExternal(href);
      }}
      // p-[11px] 가 아이콘 높이(21px)의 절반 여백이다
      className={`inline-flex items-center gap-2 shrink-0 cursor-pointer rounded-full hover:bg-navy/5 active:scale-95 transition-all ${label ? "px-3 py-1.5" : "p-[11px]"} ${className}`}
    >
      {/* 공식 에셋을 그대로 쓴다. 색·비율을 바꾸지 않는다 */}
      <img src="/spotify-icon-black.svg" alt="Spotify" width={21} height={21} className="shrink-0" />
      {label && <span className="font-sans text-xs font-bold text-navy/70">{label}</span>}
    </button>
  );
}
