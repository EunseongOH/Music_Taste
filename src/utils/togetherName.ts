/**
 * 같이 소트하기에서 사람을 어떻게 부를지.
 *
 * 내 자리에는 늘 "나" 를 쓴다. 자기 닉네임을 3인칭으로 읽으면 남 얘기처럼 보인다 —
 * 방장이 자기 링크에서 "Crongcrong님이 소트를 끝냈어요" 를 보면 누가 새로 들어온 줄 안다.
 *
 * 문장 안에서는 "나" 가 안 맞는 자리가 있다("나님이"). 그런 자리는 같은 뜻의 다른
 * 말로 바꿔 쓴다(`내가`·`내` 등) — 이 함수는 **이름이 들어갈 자리**에만 쓴다.
 */
export const ANON = "익명 리스너";

export function personName(nickname: string | null | undefined, isMe = false): string {
  if (isMe) return "나";
  return nickname?.trim() || ANON;
}
