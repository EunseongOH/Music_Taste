import { safeSessionStorage } from "./storage.ts";

/**
 * 같이 소트하기 — **이 방에서 방금 끝낸 판** 을 결과 화면에 건네는 쪽지.
 *
 * 예전에는 결과 화면이 혼자 소트하기와 같이 쓰는 `worldcup_ranking` 을 읽고, 방의 곡과
 * 겹치기만 하면 내 참여 기록으로 저장했다. 그 순위가 어디서 왔는지는 묻지 않았다.
 *
 *   방 A 를 끝낸 뒤 방 B 결과를 열기만 해도   방 A 의 순위가 방 B 에 내 기록으로 섰다
 *   로그아웃하고 같은 기기에서 열면           새 익명 참여자가 하나 더 생겼다(유령)
 *   16곡 이상 방 결과를 열 때마다             개인 취향표가 한 장씩 늘었다
 *
 * 결과 화면을 **여는 것은 읽기**다. 쓰기는 이 쪽지가 있을 때만 한다.
 *
 *   시작(방 화면)     run 을 만든다            { challengeId, code, runId }
 *   끝(월드컵)        run -> completion 으로   + 순위·뺀 곡 수·누가 끝냈나
 *   결과(결과 화면)   challengeId 가 이 방이고 끝낸 사람이 지금 사람일 때만 저장,
 *                     단계마다 끝났다고 적고, 다 끝나면 쪽지를 지운다
 *
 * 곡이 겹치는지로 판단하지 않는다 — 두 방의 곡이 같을 수도 있다. 출처는 challengeId 다.
 * `runId` 는 한 판의 이름이다. 같은 방을 다시 소트하면 새 run 이다.
 *
 * 탭마다 따로인 sessionStorage 에 둔다. 다른 탭·다음 방문으로 새지 않는다.
 */

const RUN_KEY = "together_run_v1";
const COMPLETION_KEY = "together_completion_v1";

export interface TogetherRun {
  challengeId: string;
  code: string;
  runId: string;
}

export interface TogetherCompletion extends TogetherRun {
  /** 순위(곡 id). 1위부터. */
  ranking: string[];
  /** "모르는 곡" 으로 뺀 수. 16곡 기준을 셀 때 더한다. */
  skipped: number;
  /**
   * **어떤 곡을** 몰랐는가. 순위가 아니다 — `ranking` 에 섞지 않는다.
   *
   * 옛 쪽지에는 이 칸이 없다. 없으면 빈 배열로 읽는다 — 어느 곡인지 모르는 것과
   * "없다" 는 다르므로, 없는 것을 추측해 채우지 않는다.
   */
  skippedTrackIds: string[];
  /** 판을 끝낸 계정. 게스트면 null. 다른 계정의 판을 저장하지 않으려고 적는다. */
  ownerUserId: string | null;
  completedAt: string;
  /** 참여 기록을 저장했다. */
  entrySaved: boolean;
  /** 개인 취향표를 처리했다(저장했거나, 저장할 조건이 아니었다). */
  tasteDone: boolean;
  /**
   * 이 판의 개인 취향표 id. **미리 정해 둔다** — 저장 요청이 서버에 닿은 뒤 응답 전에
   * 새로 고침돼도 같은 id 로 다시 넣으면 PK 가 막아 두 장이 되지 않는다.
   */
  tasteResultId: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = safeSessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    safeSessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 방 화면에서 "소트 시작" 할 때. 이전 판의 run 은 덮어쓴다. */
export function startTogetherRun(challenge: { id: string; code: string }): TogetherRun {
  const run = { challengeId: challenge.id, code: challenge.code, runId: crypto.randomUUID() };
  writeJson(RUN_KEY, run);
  return run;
}

/**
 * 같이 소트하기로 연 월드컵이 끝났을 때. 시작한 run 이 없으면 아무것도 적지 않는다 —
 * 어느 방의 판인지 모르는 순위는 어디에도 저장하지 않는다.
 *
 * run 은 여기서 쓴다(지운다). 한 run 은 한 번만 끝난다.
 */
export function recordTogetherCompletion(input: {
  ranking: readonly string[];
  skippedTrackIds: readonly string[];
  ownerUserId: string | null;
}): TogetherCompletion | null {
  const run = readJson<TogetherRun>(RUN_KEY);
  if (!run?.challengeId || !run.runId) return null;
  const completion: TogetherCompletion = {
    challengeId: run.challengeId,
    code: run.code,
    runId: run.runId,
    ranking: [...input.ranking],
    // 개수는 목록에서 센다. 둘이 어긋날 길을 만들지 않는다.
    skipped: input.skippedTrackIds.length,
    skippedTrackIds: [...input.skippedTrackIds],
    ownerUserId: input.ownerUserId,
    completedAt: new Date().toISOString(),
    entrySaved: false,
    tasteDone: false,
    tasteResultId: crypto.randomUUID(),
  };
  if (!writeJson(COMPLETION_KEY, completion)) return null;
  try {
    safeSessionStorage.removeItem(RUN_KEY);
  } catch {
    /* run 이 남아도 다음 시작이 덮어쓴다 */
  }
  return completion;
}

/**
 * 이 방·이 사람의 끝낸 판이 있으면 돌려준다. 아니면 null — 그때 결과 화면은 읽기만 한다.
 *
 * 끝낸 사람과 지금 사람:
 *   같다                        저장한다
 *   게스트로 끝내고 지금 로그인   저장한다(자기 판에 로그인한 것이다. 소유권은 claim 이 붙인다)
 *   그 밖(A 가 끝냈는데 게스트·B)  저장하지 않는다. 쪽지는 남긴다 — A 가 돌아오면 이어서 한다
 */
export function completionFor(challengeId: string, userId: string | null): TogetherCompletion | null {
  const c = readJson<TogetherCompletion>(COMPLETION_KEY);
  if (!c || c.challengeId !== challengeId || !Array.isArray(c.ranking) || !c.runId) return null;
  const owner = c.ownerUserId ?? null;
  if (owner !== null && owner !== userId) return null;
  // 이 칸이 없던 때의 쪽지도 읽는다. 없으면 빈 배열 — 모르는 곡을 추측하지 않는다.
  return { ...c, skippedTrackIds: Array.isArray(c.skippedTrackIds) ? c.skippedTrackIds : [] };
}

/**
 * 한 단계가 끝났다고 적는다. **같은 run 일 때만** — 그 사이 새 판이 끝나 쪽지가 바뀌었으면
 * 새 판의 상태를 건드리지 않는다. 두 단계가 다 끝나면 쪽지를 지운다.
 */
export function markCompletion(runId: string, patch: Partial<Pick<TogetherCompletion, "entrySaved" | "tasteDone">>): void {
  const c = readJson<TogetherCompletion>(COMPLETION_KEY);
  if (!c || c.runId !== runId) return;
  const next = { ...c, ...patch };
  if (next.entrySaved && next.tasteDone) {
    try {
      safeSessionStorage.removeItem(COMPLETION_KEY);
      return;
    } catch {
      /* 못 지우면 아래에서 "다 끝났다" 로 적는다. 다시 쓰지 않는다 */
    }
  }
  writeJson(COMPLETION_KEY, next);
}
