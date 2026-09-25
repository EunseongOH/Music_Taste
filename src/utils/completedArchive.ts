import type { MyChallenge } from "./togetherDb.ts";

/**
 * 프로필의 **완료한 취향표** 한 목록.
 *
 * 혼자 한 취향표(`tournament_results`)와 같이 소트한 방(`sort_challenge_entries`)은
 * 저장되는 곳이 다르다. 모달은 좁아서 자리를 둘로 나누면 둘 다 조금씩만 보인다.
 * 그래서 **한 목록으로 최신순으로 섞는다.**
 *
 * 다만 **종류를 지운 채로 섞지 않는다.** 같이 소트한 방을 취향표처럼 꾸며 가짜 1위를
 * 만들면, 누르는 곳도 보여 줄 것도 달라 결국 거짓이 된다. 종류를 들고 다니다가
 * 그릴 때 갈라 쓴다(`kind`).
 *
 * 종류별로 정렬한 뒤 이어 붙이지 않는다 — 그러면 9/26 방 · 9/24 방 · 9/25 취향표 처럼
 * 시간이 뒤죽박죽으로 보인다. **하나의 시각**으로 정규화해 한 번에 정렬한다.
 */

/** 혼자 한 취향표의 한 줄. 화면이 쓰는 값만 추린다. */
export interface CompletedResultLike {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

export type CompletedArchiveItem =
  | {
      kind: "result";
      /** 정렬에 쓰는 시각(ISO). */
      at: string;
      /** 상세 화면이 그대로 쓰는 원본 행. */
      result: CompletedResultLike;
    }
  | {
      kind: "together";
      at: string;
      room: MyChallenge;
    };

/** 정렬 기준 시각. 읽을 수 없으면 맨 뒤로 보낸다(순서를 흔들지 않는다). */
function time(at: string): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * 두 출처를 하나의 최신순 목록으로.
 *
 * 같이 소트한 방은 **이 계정이 가진 것만** 넘겨야 한다(`accountOnly`). 기기 키로 찾은
 * 방까지 섞으면 같은 기기에서 A 가 남긴 방이 B 의 보관함에 뜬다. 그 경계는 부르는
 * 쪽에서 지킨다 — 여기서는 받은 것을 그대로 쓴다.
 *
 * **합치면서 지우지 않는다.** 제목·아티스트·날짜가 비슷하다는 이유로 두 줄을 하나로
 * 묶지 않는다. 그건 같은 활동이라는 증거가 아니라 닮았다는 것뿐이고, 실제로 다른
 * 활동을 지울 수 있다.
 */
export function buildCompletedArchiveItems(
  results: readonly CompletedResultLike[] | null | undefined,
  rooms: readonly MyChallenge[] | null | undefined
): CompletedArchiveItem[] {
  const items: CompletedArchiveItem[] = [];
  for (const r of results ?? []) {
    if (r?.id) items.push({ kind: "result", at: r.created_at, result: r });
  }
  for (const room of rooms ?? []) {
    if (room?.code) items.push({ kind: "together", at: room.sortedAt, room });
  }
  return items.sort((a, b) => time(b.at) - time(a.at));
}
