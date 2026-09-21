// 앨범 요약(digest) 을 만드는 규칙. 수집 스크립트와 화면이 같은 함수를 써야 판단이 어긋나지 않는다.
//
// 왜 요약이 필요한가: 앨범 목록을 만들 때 곡 수를 세고 중복을 가리려면 트랙 제목이 필요한데,
// 그러려고 트랙 행을 전부 읽으면 앨범이 수백 장인 아티스트에서 한 번에 1.6MB 가 오간다.
// 짧은 해시 배열만 읽으면 같은 판단을 열 배 적은 전송량으로 할 수 있다.

import { songTitleBase } from "./songKey";

/** 곡 제목용: 문장부호·공백만 정리한다 (버전 표기는 남긴다) */
export const normTrack = (s: string) =>
  (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** 판 표기를 뗀 제목. 출처마다 "지킬 (Jekyll)" 로도 "지킬 Jekyll" 로도 적는다 */
export const cmpTrack = (s: string) => normTrack(songTitleBase(s)) || normTrack(s);

/** 짧은 해시 (FNV-1a 32비트). 비교에만 쓰므로 8자면 충분하다 */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface Digest {
  n_distinct: number;
  h_raw: string[];
  h_base: string[];
  /** 판 표기를 뗀 제목의 앞 10글자 해시. 뒤쪽 오타·표기 차이를 견딘다 */
  h_pre: string[];
  durs: number[];
}

/**
 * 한 발매판(또는 Deezer 앨범)의 요약을 만든다.
 * tracks 는 자리순으로 정렬돼 있어야 한다 (durs 를 자리별로 비교하기 때문이다).
 */
export function buildDigest(tracks: { title: string; ms: number }[]): Digest {
  const rawSeen = new Set<string>();
  const h_raw: string[] = [];
  const h_base: string[] = [];
  const h_pre: string[] = [];
  const durs: number[] = [];
  for (const t of tracks) {
    const raw = normTrack(t.title);
    if (!raw) continue;                       // 제목이 기호뿐인 곡은 화면에서도 빠진다
    durs.push(Math.round((t.ms || 0) / 1000));
    if (rawSeen.has(raw)) continue;           // 같은 제목은 화면에서 한 번만 보인다
    rawSeen.add(raw);
    const base = cmpTrack(t.title);
    h_raw.push(shortHash(raw));
    h_base.push(shortHash(base));
    h_pre.push(shortHash(base.slice(0, 10)));
  }
  return { n_distinct: rawSeen.size, h_raw, h_base, h_pre, durs };
}
