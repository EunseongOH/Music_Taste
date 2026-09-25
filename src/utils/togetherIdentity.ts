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

/** 관계 계산에 필요한 최소한. 화면마다 타입이 조금씩 달라 좁게 받는다. */
export interface EntryLike extends EntryIdentity {
  nickname: string | null;
  ranking: string[];
}

export interface SelfIdentity<T extends EntryIdentity> {
  /** 관계도에서 "나" 를 대표하는 기록. 없으면 아직 소트하지 않았다. */
  primary: T | null;
  /** 관계 계산에서 쓸 내 키. **기기 키가 아니라 대표 기록의 키다.** */
  primaryKey: string;
  /** 같은 사람으로 확인된 다른 기록의 id. 화면 계산에서 접는다. */
  aliasIds: Set<string>;
}

/**
 * 이 화면을 보는 사람의 신원을 한 번에 정한다.
 *
 * 예전에는 `mine` 은 `resolveMyEntry` 로 고르고, 관계 계산의 `myKey` 는 기기 키를
 * 그대로 썼다. 둘이 다른 기록을 가리키면 **내 기록이 "남" 쪽에 남아** 나와 내가
 * 100% 로 이어졌다("나" 와 "강강강" 이 따로 서던 일).
 *
 * 같은 사람이라고 볼 근거는 **신원**뿐이다.
 *   - 계정이 가진 기록
 *   - 이 기기의 참여 키
 *   - 참여 키가 내 계정 uuid 인 옛 기록
 *
 * 순위가 같다·닉네임이 같다·시각이 비슷하다는 **근거로 쓰지 않는다.** 서로 다른 두
 * 사람이 같은 순위를 만들 수 있고, 그걸 합치면 남의 기록을 지우는 것과 같다.
 */
export function resolveSelfIdentity<T extends EntryIdentity>(
  entries: T[] | null | undefined,
  opts: { ownedEntryId?: string | null; userId?: string | null }
): SelfIdentity<T> {
  const device = deviceParticipantKey();
  const list = entries ?? [];
  const mine: T[] = [];
  for (const e of list) {
    const isSelf =
      (opts.ownedEntryId && e.id === opts.ownedEntryId) ||
      e.participant_key === device ||
      (!!opts.userId && e.participant_key === opts.userId);
    if (isSelf) mine.push(e);
  }
  if (mine.length === 0) return { primary: null, primaryKey: device, aliasIds: new Set() };

  // 대표는 resolveMyEntry 와 같은 순서로 고른다(계정 → 기기 → 옛 방식).
  const primary = resolveMyEntry(mine, opts) ?? mine[0];
  const aliasIds = new Set(mine.filter((e) => e.id !== primary.id).map((e) => e.id));
  return { primary, primaryKey: primary.participant_key, aliasIds };
}

/**
 * 화면 계산에 넣을 목록. **같은 사람이 둘로 세어지지 않게** alias 를 걷어낸다.
 *
 * 노드만 숨기고 계산에는 남겨 두면 안 된다 — 참가자 수, 종합 일치율, 가장 닮은 조합이
 * 전부 나와 나의 100% 에 끌려간다. 그래서 목록 자체를 여기서 한 번 고른다.
 *
 * 8초마다 다시 읽어도 늘 이 층을 지나므로, 지웠다가 다시 생기는 일이 없다.
 */
export function normalizeEntriesForViewer<T extends EntryIdentity>(
  entries: T[] | null | undefined,
  self: SelfIdentity<T>
): T[] {
  if (!entries?.length || self.aliasIds.size === 0) return entries ?? [];
  return entries.filter((e) => !self.aliasIds.has(e.id));
}

/**
 * 로그인하면 붙여야 할 소유권을 적어 둔다.
 *
 * 로그인 성공 콜백과 실제로 세션이 서는 시점은 다르다(OAuth 팝업·토큰 갱신).
 * 그래서 "콜백이 불렸다" 가 아니라 **계정이 확인됐을 때** 붙인다. 그 사이를 잇는 쪽지다.
 *
 * 두 가지를 지킨다.
 *
 *   **성공하기 전에 지우지 않는다.** 예전에는 읽으면서 바로 지웠다(`takePendingClaim`).
 *   그래서 claim RPC 가 network·DB 오류로 실패하면 "계정에 남기겠다" 는 뜻이 함께
 *   사라졌고, 다시 시도할 길이 없었다.
 *
 *   **누구에게 붙이려던 것인지 적는다.** 처음 이 뜻을 집어 가는 계정을 쪽지에 먼저
 *   적는다. 그래야 A 가 집었다가 실패하고 로그아웃한 뒤 B 가 로그인해도, A 에게
 *   붙이려던 기록이 B 의 것이 되지 않는다(들어볼 곡 큐와 같은 원칙).
 */
const PENDING = "together_pending_claim";

export interface PendingClaim {
  challengeId: string;
  /** 이 뜻을 집어 간 계정. 아직 아무도 안 집었으면 null. */
  ownerUserId: string | null;
}

function readPending(): PendingClaim | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return null;
    // 이 칸이 생기기 전에는 방 id 문자열만 적었다. 그것도 읽는다.
    if (!raw.startsWith("{")) return { challengeId: raw, ownerUserId: null };
    const v = JSON.parse(raw) as Partial<PendingClaim>;
    return v?.challengeId ? { challengeId: v.challengeId, ownerUserId: v.ownerUserId ?? null } : null;
  } catch {
    return null;
  }
}

export function rememberPendingClaim(challengeId: string): void {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ challengeId, ownerUserId: null } satisfies PendingClaim));
  } catch {
    /* 저장 못 하면 이번 로그인에서는 못 붙인다. 화면은 기기 키로 계속 보인다. */
  }
}

/** 적어 둔 뜻. 지우지 않는다. */
export function getPendingClaim(): PendingClaim | null {
  return readPending();
}

/**
 * 이 계정이 그 뜻을 집어 간다. 집을 수 있으면 방 id 를, 아니면 null 을 돌려준다.
 *
 * 아직 주인이 없으면 **먼저 적고** 나서 돌려준다 — 적지 못하면 집지 않는다.
 * 적히기 전에 붙이기를 시작하면, 실패한 뒤 다른 계정이 그 뜻을 가져갈 수 있다.
 */
export function bindPendingClaim(userId: string): string | null {
  const p = readPending();
  if (!p) return null;
  if (p.ownerUserId === userId) return p.challengeId;
  if (p.ownerUserId !== null) return null;   // 다른 계정이 집어 간 뜻이다
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ challengeId: p.challengeId, ownerUserId: userId } satisfies PendingClaim));
  } catch {
    return null;
  }
  return p.challengeId;
}

/** 뜻이 이뤄졌다. **성공했을 때만** 부른다. 다른 방의 뜻은 건드리지 않는다. */
export function clearPendingClaim(challengeId: string): void {
  const p = readPending();
  if (!p || p.challengeId !== challengeId) return;
  try {
    sessionStorage.removeItem(PENDING);
  } catch {
    /* 못 지워도 다음에 이미 내 것임을 확인하면 그때 다시 지운다 */
  }
}
