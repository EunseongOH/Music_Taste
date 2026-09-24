"use client";

import { safeLocalStorage } from "@/utils/storage";

/**
 * 같이 소트하기의 **참여 신원**.
 *
 * 전에는 `participantKey(userId)` 가 로그인하면 계정 uuid 를, 아니면 기기 키를
 * 돌려줬다. 그래서 익명으로 소트한 뒤 로그인하면 신원이 갈려 자기 기록을 못 찾고
 * "아직 소트하지 않았어요" 가 떴다. 저장 effect 가 새 키로 한 번 더 돌아
 * 참가자가 한 명 늘기까지 했다.
 *
 * 로그인은 **새 참여자가 되는 일이 아니라** 이미 만든 기록에 계정을 붙이는 일이다.
 * 그래서 이 키는 로그인·로그아웃과 무관하게 이 기기에서 늘 같다.
 *
 *   participant_key   참여 신원(여기)
 *   user_id           계정 소유권(서버가 auth.uid() 로 정한다)
 *   claim secret      익명 기록을 계정에 붙일 때 쓰는 증명
 */

/** 예전부터 쓰던 이름. 바꾸면 기존 사용자의 신원이 초기화된다. */
const KEY = "together_participant";
const SECRET = "together_claim_secret";

/**
 * 이 기기의 참여 키. **로그인해도 바뀌지 않는다.**
 *
 * 예전 `participantKey(userId)` 와 달리 인자를 받지 않는다 — 인자가 있으면
 * 언젠가 다시 계정 id 를 넣게 된다.
 */
export function deviceParticipantKey(): string {
  const saved = safeLocalStorage.getItem(KEY);
  if (saved) return saved;
  const made = `anon_${crypto.randomUUID()}`;
  safeLocalStorage.setItem(KEY, made);
  return made;
}

/**
 * 이 기기가 만든 기록임을 증명하는 값.
 *
 * `participant_key` 는 관계도 때문에 누구나 읽을 수 있어 응답에 그대로 실린다.
 * 그 값만으로 "내 것" 이라고 말할 수 있게 두면 남의 기록을 가져갈 수 있다.
 * 그래서 따로 둔다 — **원문은 이 브라우저에만 있고**, 서버에는 sha-256 만 남는다.
 */
export function deviceClaimSecret(): string {
  const saved = safeLocalStorage.getItem(SECRET);
  if (saved) return saved;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const made = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  safeLocalStorage.setItem(SECRET, made);
  return made;
}

/** 참여 기록 한 줄에서 "내 것인지" 판정하는 데 필요한 것만. */
export interface EntryIdentity {
  id: string;
  participant_key: string;
}

/**
 * 여러 기록 중 **내 것**을 찾는다.
 *
 * 순서가 중요하다.
 *   1) 계정이 가진 기록 — 다른 기기에서 로그인해도 찾힌다
 *   2) 이 기기의 참여 키 — 로그인 직후 소유권이 붙기 전에도 계속 찾힌다
 *   3) 옛 기록 — 로그인 사용자의 키가 계정 uuid 그 자체이던 시절
 *
 * 2번이 없으면 로그인과 소유권 연결 사이 몇 백 ms 동안 "아직 소트하지 않았어요" 가
 * 깜빡인다. 그 깜빡임을 막는 것이 이 순서의 목적이다.
 */
export function resolveMyEntry<T extends EntryIdentity>(
  entries: T[] | null | undefined,
  opts: { ownedEntryId?: string | null; userId?: string | null }
): T | null {
  if (!entries?.length) return null;
  const { ownedEntryId, userId } = opts;
  if (ownedEntryId) {
    const owned = entries.find((e) => e.id === ownedEntryId);
    if (owned) return owned;
  }
  const device = deviceParticipantKey();
  const byDevice = entries.find((e) => e.participant_key === device);
  if (byDevice) return byDevice;
  if (userId) {
    const legacy = entries.find((e) => e.participant_key === userId);
    if (legacy) return legacy;
  }
  return null;
}

/**
 * 로그인하면 붙여야 할 소유권을 적어 둔다.
 *
 * 로그인 성공 콜백과 실제로 세션이 서는 시점은 다르다(OAuth 팝업·토큰 갱신).
 * 그래서 "콜백이 불렸다" 가 아니라 **계정이 확인됐을 때** 붙인다. 그 사이를 잇는 쪽지다.
 */
const PENDING = "together_pending_claim";

export function rememberPendingClaim(challengeId: string): void {
  try {
    sessionStorage.setItem(PENDING, challengeId);
  } catch {
    /* 저장 못 하면 이번 로그인에서는 못 붙인다. 화면은 기기 키로 계속 보인다. */
  }
}

export function takePendingClaim(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING);
    if (v) sessionStorage.removeItem(PENDING);
    return v;
  } catch {
    return null;
  }
}
