import { safeLocalStorage, safeSessionStorage } from "./storage.ts";

/**
 * **지금 이 탭에서 하고 있는 판(foreground run)** 과 **계정에 저장된 초안(background draft)** 을 가른다.
 *
 * 초안은 계정·모드당 한 줄이다. 예전 월드컵 화면은 "로그인돼 있다" 를 곧 "그 초안이 지금 판이다"
 * 로 읽었다.
 *
 *   게스트로 판 Y 를 하다 로그인   -> 계정의 옛 초안 X 가 화면을 갈아치웠고
 *                                     (고른 아티스트는 Y 그대로라) 섞인 줄이 자동저장됐다 (UX-004)
 *   Y 를 끝내거나 버리면           -> 상관없는 X 를 지웠다
 *
 * 그래서 판마다 **이 판이 계정 초안에 붙어 있는지(attachedUserId)** 를 적어 둔다.
 * 붙어 있을 때만 DB 에 저장하고, 끝내거나 버릴 때 초안을 지운다.
 *
 *   계정 초안을 불러와 시작한 판       붙어 있다
 *   게스트로 시작한 판                 붙어 있지 않다. 로그인했을 때 계정에 진행 중인 판이
 *                                     없으면 그때 붙인다 — 있으면 붙이지 않는다(둘 다 지킨다)
 *
 * 탭마다 따로인 sessionStorage 에 둔다. localStorage 는 탭·계정이 같이 쓰므로 "지금 이 판" 의
 * 근거가 될 수 없다.
 */
const RUN_KEY = "worldcup_active_run_v1";

export interface ActiveRun {
  runId: string;
  /** 최애 곡 소트(싱글)인가. 초안은 모드마다 따로다. */
  single: boolean;
  /** 이 판이 붙어 있는 계정. null 이면 이 기기에만 있는 판이다. */
  attachedUserId: string | null;
}

/** 이 탭에서 이 모드로 하고 있는 판. 없으면 null. */
export function getActiveRun(single: boolean): ActiveRun | null {
  try {
    const raw = safeSessionStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as ActiveRun;
    if (!run?.runId || run.single !== single) return null;
    return { ...run, attachedUserId: typeof run.attachedUserId === "string" ? run.attachedUserId : null };
  } catch {
    return null;
  }
}

/** 새 판을 시작하거나 계정 초안을 불러왔다. */
export function beginRun(single: boolean, attachedUserId: string | null): ActiveRun {
  const run = { runId: crypto.randomUUID(), single, attachedUserId };
  try {
    safeSessionStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* 못 적으면 새로 고침 때 이 판을 "지금 판" 으로 알아보지 못한다. 계정 초안은 건드리지 않는다 */
  }
  return run;
}

/** 이 판을 계정 초안에 붙인다. 계정에 진행 중인 다른 판이 없거나, 사용자가 바꾸기로 했을 때만. */
export function attachRun(single: boolean, userId: string): void {
  const run = getActiveRun(single);
  if (!run) return;
  try {
    safeSessionStorage.setItem(RUN_KEY, JSON.stringify({ ...run, attachedUserId: userId }));
  } catch {
    /* 위와 같다 */
  }
}

export function clearActiveRun(): void {
  try {
    safeSessionStorage.removeItem(RUN_KEY);
  } catch {
    /* 없어도 된다 */
  }
}

/* ── 계정 초안으로 돌아가기. 홈·프로필·아티스트 고르기가 같은 기준을 쓴다 ── */

interface DraftLike {
  status?: string;
  is_single_artist?: boolean;
  selected_artists?: unknown[] | null;
  selected_tracks?: unknown[] | null;
}

/** 초안의 단계에 맞는 화면. 모드를 붙여야 같은 모드의 초안을 읽는다. */
export function draftResumePath(draft: DraftLike): string {
  const qs = draft.is_single_artist ? "?mode=single" : "";
  if (draft.status === "artist_selection") return `/explore${qs}`;
  if (draft.status === "track_selection") return `/tracks${qs}`;
  return `/worldcup${qs}`;
}

/**
 * 초안을 이어 하기 전에 이 기기의 상태를 그 초안에 맞춘다.
 * 진행 상태는 월드컵 화면이 DB 초안(progress)에서 직접 복원한다 — 로컬의 오래된 진행이
 * DB 를 가리지 않게 지우고, 이 탭의 판 표시도 지운다(그래야 월드컵 화면이 계정 초안을 읽는다).
 */
export function restoreDraftToStorage(draft: DraftLike): void {
  const both = (k: string, v: string | null) => {
    for (const s of [safeSessionStorage, safeLocalStorage]) {
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    }
  };
  if (draft.selected_artists && draft.selected_artists.length > 0) both("selectedArtists", JSON.stringify(draft.selected_artists));
  if (draft.selected_tracks && draft.selected_tracks.length > 0) both("worldcup_tracks", JSON.stringify(draft.selected_tracks));
  both("worldcup_progress", null);
  both("worldcup_is_single_artist", draft.is_single_artist ? "true" : "false");
  clearActiveRun();
}
