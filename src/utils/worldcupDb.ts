import { createClient } from "./supabase/client";
import { getSafeLocale } from "./storage";
import { stageRow, type DraftArtist, type Stage } from "./draftStage.ts";

const getSessionExpiredMessage = () => {
  const isEn = getSafeLocale() === "en";
  return isEn ? "Login session expired. Please log in again." : "로그인 세션이 만료되었어요. 다시 로그인해 주세요.";
};

// 초안은 사용자·모드(싱글/멀티)당 하나. (user_id, is_single_artist) 유니크 인덱스가 기준이다.
const DRAFT_KEY = "user_id,is_single_artist";

/**
 * **진행 중인 월드컵은 묻지 않고 덮지 않는다.**
 *
 * 초안은 계정·모드당 한 줄이라, 아티스트·곡 고르기 단계의 저장이 같은 줄을 upsert 하면
 * 진행 중이던 월드컵(progress)이 사라진다. `/explore` 에 바로 들어와 다른 아티스트를
 * 고르기만 해도 그랬다(UX-001). 게다가 몇 칸만 덮어서 "아티스트는 B, 곡은 A" 인
 * 섞인 줄이 남았다.
 *
 * 그래서 단계 저장은 두 가지로 나눈다.
 *
 *   saveStageDraft     **보호된 초안(진행 중 월드컵)이 있으면 건드리지 않고 "conflict"**
 *   replaceStageDraft  사용자가 "새로 시작" 을 고른 뒤에만. 줄 전체를 새 단계로 쓴다
 *
 * 보호 여부를 먼저 읽고 쓰면 그 사이에 다른 탭이 끼어들 수 있다. 그래서 DB 가 판단하게
 * 한다 — "보호되지 않은 줄만 update", 줄이 없으면 insert, insert 가 유니크 충돌이면
 * 그 사이 보호된 줄이 생긴 것이다. 새 스키마 없이 한 문장씩 원자적으로 끝난다.
 */
const PROTECTED_STATUSES = ["playing", "pre_tournament"] as const;

/** 진행 중인 월드컵이라 **확인 없이 덮으면 안 되는** 초안인가. 만료된 것은 보호하지 않는다. */
export const isProtectedDraft = (d: { status?: string; saved_at?: string | null; updated_at?: string } | null | undefined) =>
  !!d && (PROTECTED_STATUSES as readonly string[]).includes(d.status ?? "") && !isDraftExpired(d);

export type StageSaveResult = "saved" | "conflict" | "no-user" | "error";


/**
 * 네트워크가 끊기면 supabase-js 는 `{ error }` 대신 예외를 던질 수 있다. 어느 쪽이든
 * **"error" 한 가지**로 돌려준다 — 부르는 쪽이 성공으로 오해해 다음 화면으로 가지 않게.
 */
async function settle(label: string, run: () => Promise<StageSaveResult>): Promise<StageSaveResult> {
  try {
    return await run();
  } catch (e) {
    console.error(`[Supabase DB] ${label}:`, e instanceof Error ? e.message : e);
    return "error";
  }
}

/** 보호된 초안이 없을 때만 쓴다. 있으면 아무것도 바꾸지 않고 "conflict". */
const saveStageDraft = (stage: Stage, isSingle: boolean): Promise<StageSaveResult> =>
  settle("Error saving draft stage", async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "no-user";

    for (let attempt = 0; attempt < 2; attempt++) {
      // 칸을 모두 적는다 — UPDATE 는 빠진 칸에 기본값을 넣어 주지 않는다(draftStage.ts).
      const row = stageRow(user.id, isSingle, stage);
      const { data: updated, error: updateError } = await supabase
        .from('tournament_drafts')
        .update(row)
        .eq('user_id', user.id)
        .eq('is_single_artist', isSingle)
        .not('status', 'in', `(${PROTECTED_STATUSES.join(",")})`)
        .select('user_id');
      if (updateError) {
        console.error("[Supabase DB] Error saving draft stage:", updateError.message);
        return "error";
      }
      if (updated && updated.length > 0) return "saved";

      // 고칠 줄이 없다 — 줄이 아예 없거나, 보호된 줄이 있다.
      const { error: insertError } = await supabase.from('tournament_drafts').insert(row);
      if (!insertError) return "saved";
      if (insertError.code !== "23505") {
        console.error("[Supabase DB] Error saving draft stage:", insertError.message);
        return "error";
      }
      // 보호된 줄이 있다. 만료됐으면 loadActiveDraft 가 지우므로 한 번만 다시 해 본다.
      if (attempt > 0 || (await loadActiveDraft(isSingle)) !== null) return "conflict";
    }
    return "conflict";
  });

/** "새로 시작" 을 사용자가 고른 뒤에만. 이전 초안을 이 단계의 줄로 통째로 바꾼다. */
const replaceStageDraft = (stage: Stage, isSingle: boolean): Promise<StageSaveResult> =>
  settle("Error replacing draft", async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "no-user";
    const { error } = await supabase
      .from('tournament_drafts')
      .upsert(stageRow(user.id, isSingle, stage), { onConflict: DRAFT_KEY });
    if (error) {
      console.error("[Supabase DB] Error replacing draft:", error.message);
      return "error";
    }
    return "saved";
  });

const modeOf = (selectedArtists: DraftArtist[], isSingleArtist?: boolean) => isSingleArtist ?? (selectedArtists.length === 1);

// Stage 1: 아티스트 고르기. 진행 중인 월드컵이 있으면 "conflict" — 덮지 않는다.
export const saveArtistSelectionDraft = (selectedArtists: DraftArtist[], isSingleArtist?: boolean) =>
  saveStageDraft({ status: "artist_selection", selectedArtists }, modeOf(selectedArtists, isSingleArtist));

// Stage 2: 곡 고르기. 진행 중인 월드컵이 있으면 "conflict" — 덮지 않는다.
export const saveTrackSelectionDraft = (selectedArtists: DraftArtist[], selectedTracks: unknown[], isSingleArtist?: boolean) =>
  saveStageDraft({ status: "track_selection", selectedArtists, selectedTracks }, modeOf(selectedArtists, isSingleArtist));

// 곡 고르기에서 아티스트 고르기로 되돌아간다. 고른 곡을 비운다. 진행 중인 월드컵은 덮지 않는다.
export const downgradeDraftToArtistSelection = (selectedArtists: DraftArtist[], isSingleArtist?: boolean) =>
  saveStageDraft({ status: "artist_selection", selectedArtists }, modeOf(selectedArtists, isSingleArtist));

/** 사용자가 "새로 시작" 을 확인한 뒤에만 부른다. */
export const replaceDraftWithArtistSelection = (selectedArtists: DraftArtist[], isSingleArtist?: boolean) =>
  replaceStageDraft({ status: "artist_selection", selectedArtists }, modeOf(selectedArtists, isSingleArtist));

/** 사용자가 "새로 시작" 을 확인한 뒤에만 부른다. */
export const replaceDraftWithTrackSelection = (selectedArtists: DraftArtist[], selectedTracks: unknown[], isSingleArtist?: boolean) =>
  replaceStageDraft({ status: "track_selection", selectedArtists, selectedTracks }, modeOf(selectedArtists, isSingleArtist));

/* ------------------------------------------------------------------ */
/* Stage 3: 월드컵 진행 (docs/worldcup-draft-plan.md)                    */
/* ------------------------------------------------------------------ */

type TrackLike = { id: string; [k: string]: any };

/** 매치 하나의 선택: [라운드 크기, 이긴 곡, 진 곡]. 예선전은 라운드 크기를 음수로 둔다. */
export type DraftPick = [number, string, string];

/** DB `progress` 컬럼. 곡 객체는 `selected_tracks` 에만 두고 여기는 곡 ID 만 담는다. */
export type DraftProgress = {
  v: 1;
  matches: [string, string][];
  winners: string[];
  eliminated: string[];
  skipped: string[];
  picks: DraftPick[];
};

export type WorldcupState = {
  tracks: TrackLike[];
  phase: string;
  currentRoundName: string;
  currentMatchIndex: number;
  matches: TrackLike[][];
  winners: TrackLike[];
  eliminatedTracks: TrackLike[];
  skippedTracks: TrackLike[];
  picks: DraftPick[];
};

export const DRAFT_SAVED_TTL_MS = 24 * 3600_000;   // 임시저장(확정) 보관
export const DRAFT_BUFFER_TTL_MS = 3600_000;       // 자동저장(미확정) 보관

export const toCompact = (s: WorldcupState): DraftProgress => ({
  v: 1,
  matches: s.matches.map((m) => [m[0].id, m[1].id] as [string, string]),
  winners: s.winners.map((t) => t.id),
  eliminated: s.eliminatedTracks.map((t) => t.id),
  skipped: s.skippedTracks.map((t) => t.id),
  picks: s.picks,
});

/**
 * DB 초안 행 → 화면 상태. `selected_tracks` 로 ID 를 곡 객체로 되돌린다.
 * 곡이 하나라도 없으면(손상·옛 형식) null — 불러오지 않는다.
 */
export const hydrateDraft = (draft: any): Omit<WorldcupState, "phase"> | null => {
  const p = draft?.progress as DraftProgress | null | undefined;
  const tracks: TrackLike[] = Array.isArray(draft?.selected_tracks) ? draft.selected_tracks : [];
  if (!p || p.v !== 1 || tracks.length === 0) return null;

  const byId = new Map(tracks.map((t) => [t.id, t]));
  let missing = false;
  const pick = (id: string): TrackLike => {
    const t = byId.get(id);
    if (!t) missing = true;
    return t as TrackLike;
  };

  const out = {
    tracks,
    currentRoundName: draft.current_round_name || "",
    currentMatchIndex: draft.current_match_index || 0,
    matches: p.matches.map(([a, b]) => [pick(a), pick(b)]),
    winners: p.winners.map(pick),
    eliminatedTracks: p.eliminated.map(pick),
    skippedTracks: (p.skipped ?? []).map(pick),
    picks: p.picks ?? [],
  };
  return missing ? null : out;
};

/** 만료 시각(ms). 플레이 단계가 아니면 null (만료 없음). */
export const draftExpiresAt = (d: { status?: string; saved_at?: string | null; updated_at?: string }): number | null => {
  if (d.status !== "playing" && d.status !== "pre_tournament") return null;
  if (d.saved_at) return new Date(d.saved_at).getTime() + DRAFT_SAVED_TTL_MS;
  return new Date(d.updated_at ?? 0).getTime() + DRAFT_BUFFER_TTL_MS;
};

export const isDraftExpired = (d: Parameters<typeof draftExpiresAt>[0]) => {
  const at = draftExpiresAt(d);
  return at !== null && at <= Date.now();
};

/** 홈·취향 스페이스 카드에 붙일 남은 시간 문구. 플레이 단계가 아니면 "". */
export const formatDraftExpiry = (d: Parameters<typeof draftExpiresAt>[0] & { saved_at?: string | null }, locale: "ko" | "en") => {
  const at = draftExpiresAt(d);
  if (at === null) return "";
  const left = Math.max(0, at - Date.now());
  const h = Math.floor(left / 3600_000);
  const m = Math.ceil((left % 3600_000) / 60_000);
  const span = h >= 1 ? (locale === "en" ? `${h}h` : `${h}시간`) : (locale === "en" ? `${m}m` : `${m}분`);
  if (d.saved_at) return locale === "en" ? `saved · ${span} left` : `임시저장 · ${span} 남음`;
  return locale === "en" ? `auto-saved · gone in ${span}` : `자동저장 · ${span} 후 삭제`;
};

/**
 * 진행 상태 저장. `confirm` 이면 임시저장(확정)으로 `saved_at` 을 찍는다.
 * 자동저장은 `saved_at` 을 페이로드에서 빼서 upsert 가 건드리지 않게 한다.
 * `withTracks` 는 곡 객체(`selected_tracks`)까지 다시 쓴다 — 판 시작 시 한 번, 확정 시 한 번이면 된다.
 */
export const saveWorldcupDraft = async (
  state: WorldcupState,
  opts: { confirm?: boolean; withTracks?: boolean },
  selectedArtists: any[],
  isSingleArtist: boolean,
  title = "내 음악 월드컵"
): Promise<boolean> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: user.id,
    is_single_artist: isSingleArtist,
    title,
    status: 'playing',
    selected_artists: selectedArtists,
    phase: state.phase,
    current_round_name: state.currentRoundName,
    current_match_index: state.currentMatchIndex,
    progress: toCompact(state),
    updated_at: now,
  };
  if (opts.withTracks || opts.confirm) row.selected_tracks = state.tracks;
  if (opts.confirm) row.saved_at = now;

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert(row, { onConflict: DRAFT_KEY });

  if (error) {
    console.error("[Supabase DB] Error saving tournament progress:", error.message);
    return false;
  }
  return true;
};

/**
 * 초안 상세를 읽되 **못 읽은 것(throw)과 없는 것(null)을 가른다** — UX-011.
 * `loadActiveDraft` 는 오류를 null 로 삼켜 "초안 없음"과 구분이 안 된다. 충돌 시트처럼
 * "있다는 건 아는데 내용이 필요한" 자리에서는 이쪽을 쓴다. 만료 삭제는 하지 않는다(읽기만).
 */
export const fetchActiveDraftStrict = async (isSingleArtist: boolean) => {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return null;
  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_single_artist', isSingleArtist)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0] : null;
};

// Load active draft for one mode. 만료된 플레이 초안은 지우고 null.
export const loadActiveDraft = async (isSingleArtist: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_single_artist', isSingleArtist)
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  const draft = data[0];
  if (isDraftExpired(draft)) {
    await deleteActiveDraft(isSingleArtist);
    return null;
  }
  return draft;
};

/**
 * 고르기 단계에서 "저장하지 않고 나가기". 그 단계의 초안만 지운다 —
 * 진행 중인 월드컵 초안은 이 버튼의 대상이 아니다(묻지 않고 지우면 되돌릴 수 없다).
 */
export const deleteDraftUnlessProtected = async (isSingleArtist: boolean) => {
  if (isProtectedDraft(await loadActiveDraft(isSingleArtist))) return;
  await deleteActiveDraft(isSingleArtist);
};

// Delete active draft for one mode
export const deleteActiveDraft = async (isSingleArtist: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('tournament_drafts')
    .delete()
    .eq('user_id', user.id)
    .eq('is_single_artist', isSingleArtist);

  if (error) {
    console.error("[Supabase DB] Error deleting active draft:", error.message);
  }
};

// Save completed tournament results
/**
 * 임시저장을 지울지는 **부르는 쪽이 정한다.**
 *
 * 예전에는 결과를 저장하면 무조건 그 모드의 임시저장을 지웠다. 그런데 지우는 범위가
 * `user_id + is_single_artist` 뿐이라, **이 결과와 아무 상관 없는 임시저장까지** 지웠다.
 *
 *   계정에 예전 임시저장 X 가 있다
 *   로그아웃하고 게스트로 소트해 결과 Y 를 만든다
 *   로그인해서 Y 를 저장한다  ->  X 가 사라진다
 *
 * 같이 소트하기 결과를 남길 때도 같은 일이 났다 — 개인 월드컵 임시저장이 지워졌다.
 *
 * 지워도 되는 것은 **이 결과가 바로 그 임시저장에서 나온 경우뿐**이다. 그건 화면이
 * 안다(`worldcup_run_origin`). 기본은 지우지 않는다 — 잘못 지우면 되돌릴 수 없고,
 * 안 지우면 어차피 보관 기간이 지나 사라진다.
 */
export const saveCompletedResult = async (
  finalWinners: any[],
  eliminatedTracks: any[],
  title: string,
  options?: {
    isPublic?: boolean;
    isSingleArtist?: boolean;
    artistId?: string | null;
    artistName?: string | null;
    picks?: DraftPick[];
    /** 이 결과가 내 계정의 임시저장에서 이어 온 것일 때만 true. 기본은 지우지 않는다. */
    clearDraft?: boolean;
    /**
     * 이 결과의 id 를 부르는 쪽이 정한다. 같은 판을 두 번 넣으면 PK 가 막는다 —
     * 응답을 받기 전에 새로 고침돼 다시 저장해도 한 장만 남는다.
     */
    id?: string;
  }
) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: { message: getSessionExpiredMessage() } };

  const winner = finalWinners[0];
  const fullRanking = [winner, ...eliminatedTracks];

  let userNickname = "";
  let userProfileImage = "";
  if (typeof window !== "undefined") {
    // 서버 값이 기준, 캐시는 폴백. (DB 트리거가 profiles 의 닉네임으로 다시 덮어쓴다)
    userNickname = user.user_metadata?.nickname || "";
    if (!userNickname || userNickname.includes("@")) {
      userNickname = sessionStorage.getItem("userNickname") || localStorage.getItem("userNickname") || "";
    }
    if (!userNickname || userNickname.includes("@")) {
      userNickname = "음악팬";
    }
    userProfileImage = sessionStorage.getItem("userProfileImg") || localStorage.getItem("userProfileImg") || "/default-profile.png";
  }

  const resultData = {
    ...(options?.id ? { id: options.id } : {}),
    user_id: user.id,
    title,
    winner_track_id: winner.id,
    winner_track_title: winner.title,
    winner_track_artist: winner.artistName,
    winner_track_image: winner.albumImage || "",
    total_candidates: fullRanking.length,
    ranking: fullRanking,
    picks: options?.picks ?? [],
    is_public: options?.isPublic ?? true,
    is_single_artist: options?.isSingleArtist ?? false,
    artist_id: options?.artistId ?? null,
    artist_name: options?.artistName ?? null,
    user_nickname: userNickname,
    user_profile_image: userProfileImage
  };

  const { data, error: insertError } = await supabase
    .from('tournament_results')
    .insert(resultData)
    .select('id')
    .single();

  // 정해 준 id 가 이미 있다 = 이 판은 이미 저장됐다. 실패가 아니다.
  if (insertError && options?.id && insertError.code === "23505") {
    return { success: true, id: options.id };
  }
  if (insertError) {
    console.error("[Supabase DB] Error saving tournament results:", insertError);
    return { success: false, error: insertError };
  }

  // 이 결과가 내 임시저장에서 나온 것일 때만 그것을 정리한다.
  if (options?.clearDraft) await deleteActiveDraft(options?.isSingleArtist ?? false);
  return { success: true, id: data?.id };
};

// Fetch completed result for a specific artist (single artist mode check)
export const fetchCompletedResultByArtist = async (artistId: string) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tournament_results')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_single_artist', true)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("[Supabase DB] Error fetching artist result:", error.message);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
};

// Overwrite an existing completed result
export const overwriteCompletedResult = async (
  resultId: string,
  finalWinners: any[],
  eliminatedTracks: any[],
  title: string,
  options?: {
    isPublic?: boolean;
    isSingleArtist?: boolean;
    picks?: DraftPick[];
    /** 이 결과가 내 계정의 임시저장에서 이어 온 것일 때만 true. 기본은 지우지 않는다. */
    clearDraft?: boolean;
  }
) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: { message: getSessionExpiredMessage() } };

  const winner = finalWinners[0];
  const fullRanking = [winner, ...eliminatedTracks];

  let userNickname = "";
  let userProfileImage = "";
  if (typeof window !== "undefined") {
    // 서버 값이 기준, 캐시는 폴백. (DB 트리거가 profiles 의 닉네임으로 다시 덮어쓴다)
    userNickname = user.user_metadata?.nickname || "";
    if (!userNickname || userNickname.includes("@")) {
      userNickname = sessionStorage.getItem("userNickname") || localStorage.getItem("userNickname") || "";
    }
    if (!userNickname || userNickname.includes("@")) {
      userNickname = "음악팬";
    }
    userProfileImage = sessionStorage.getItem("userProfileImg") || localStorage.getItem("userProfileImg") || "/default-profile.png";
  }

  const updateData = {
    title,
    winner_track_id: winner.id,
    winner_track_title: winner.title,
    winner_track_artist: winner.artistName,
    winner_track_image: winner.albumImage || "",
    total_candidates: fullRanking.length,
    ranking: fullRanking,
    picks: options?.picks ?? [],
    is_public: options?.isPublic ?? true,
    user_nickname: userNickname,
    user_profile_image: userProfileImage,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('tournament_results')
    .update(updateData)
    .eq('id', resultId);

  if (error) {
    console.error("[Supabase DB] Error overwriting tournament result:", error);
    return { success: false, error };
  }

  if (options?.clearDraft) await deleteActiveDraft(options?.isSingleArtist ?? true);
  return { success: true, id: resultId };
};
