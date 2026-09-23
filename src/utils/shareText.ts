import type { RankedTrack } from "@/utils/ranking";

/**
 * 공유 문구 — **모든 공유 경로가 여기 하나를 지난다.**
 *
 * 전에는 X·링크 복사·공유 시트만 이 규칙을 쓰고 카카오만 따로
 * `"{아티스트} 취향표"` 를 보냈다. 한 곳만 고쳐지면 문구가 서서히 갈라진다.
 *
 * ⚠️ 여기에 sortify.kr 주소를 넣지 말 것. 앱인토스는 "공유하기 링크가 자사
 * 웹사이트로 랜딩되는 경우"를 제한한다 — 링크는 어댑터(`platform.shareUrl`)가
 * 플랫폼에 맞게 따로 만들고, 호출부가 본문 뒤에 붙인다.
 */

type ShareTrack = Pick<RankedTrack, "title" | "artistName">;

/** 곡이 여러 아티스트에서 왔으면 믹스 매치다. 화면의 isSingleArtistMode 는 믹스도 true 라 못 쓴다. */
const isMixed = (winners: ShareTrack[]): boolean =>
  new Set(winners.map((t) => t.artistName)).size > 1;

/** 링크 바로 위에 붙는 참여 유도 문구. 주소는 넣지 않는다. */
export const shareCta = (locale: "ko" | "en" = "ko"): string =>
  locale === "en" ? "What would your No.1 be? Sort it yourself" : "내 1위는 뭘까? 직접 골라 보기";

/** 제목 줄만. 카카오 카드처럼 본문을 따로 받는 곳에서 쓴다. */
export function shareTitle(winners: ShareTrack[], nickname?: string | null, locale: "ko" | "en" = "ko"): string {
  const mixed = isMixed(winners);
  if (locale === "en") {
    const subject = mixed ? "Mix match" : winners[0]?.artistName || "";
    return `${nickname ? `${nickname}'s ` : ""}${subject} taste card TOP 10`.replace(/\s+/g, " ").trim();
  }
  const subject = mixed ? "믹스 매치" : winners[0]?.artistName || "";
  return `${nickname ? `${nickname}님의 ` : ""}${subject} 취향표 TOP 10`;
}

/** TOP 10 목록만. */
export function shareRanking(winners: ShareTrack[]): string {
  const mixed = isMixed(winners);
  return winners
    .slice(0, 10)
    .map((t, i) => `${i + 1}. ${t.title}${mixed ? ` - ${t.artistName}` : ""}`)
    .join("\n");
}

/**
 * 공유 본문. 링크는 붙이지 않는다 — 호출부가 `\n` 뒤에 붙인다.
 *
 *   {닉네임}님의 {아티스트} 취향표 TOP 10
 *
 *   1. …
 *   10. …
 *
 *   내 1위는 뭘까? 직접 골라 보기
 */
export function shareBody(winners: ShareTrack[], nickname?: string | null, locale: "ko" | "en" = "ko"): string {
  return `${shareTitle(winners, nickname, locale)}\n\n${shareRanking(winners)}\n\n${shareCta(locale)}`;
}
