/**
 * 초대 문구. 세 자리가 같은 말을 하도록 여기 한 곳에서만 만든다.
 *
 *  1. 링크 미리보기 — `app/together/[code]/layout.tsx` 의 og:description·twitter
 *  2. 링크 보내기 — `app/together/[code]/page.tsx` 의 platform.share
 *  3. 초대 화면 — 사진 아래 둘째 줄
 *
 * 세 자리가 따로 적혀 있으면 한 곳만 고쳐지고, 받는 사람은 미리보기에서 본 말과
 * 열어서 본 말이 달라진다. 링크를 보내는 사람도 자기가 무슨 말을 보냈는지 모른다.
 *
 * "Sortify" 는 본문에 넣지 않는다. og:title 뒤의 " - Sortify" 와 미리보기 그림이
 * 이미 브랜드를 말한다 — 본문에서 한 번 더 말하면 광고문처럼 읽힌다.
 * 영어 문구는 아직 없다(이 화면은 한국어 전용이다).
 */

/** 아티스트를 모르는 방은 방 제목을 따옴표로 묶어 그 자리에 쓴다. */
function subject(artist: string | null, roomTitle: string): string {
  return artist || `'${roomTitle}'`;
}

/** 미리보기 제목이자 초대 화면 첫 줄. 느낌표는 서비스 전체에서 여기 하나만 쓴다. */
export function inviteTitle(artist: string | null, roomTitle: string): string {
  return `${subject(artist, roomTitle)} 소트에 초대받았어요!`;
}

/**
 * 미리보기 설명이자 초대 화면 둘째 줄, 그리고 링크 보낼 때의 본문.
 *
 * @param creator 방을 만든 사람의 이름. 없으면 앞부분을 통째로 뺀다 —
 *                "리스너님이" 같은 가짜 이름을 지어내지 않는다.
 * @param trackCount 방에 담긴 곡 수(`challenge.tracks.length`)
 */
export function inviteDesc(
  artist: string | null,
  roomTitle: string,
  creator: string | null,
  trackCount: number
): string {
  const who = creator ? `${creator}님이 고른 ` : "";
  return `${who}${subject(artist, roomTitle)} ${trackCount}곡, 같이 소트하고 서로의 취향을 더 깊이 알아봐요.`;
}
