import { createClient } from "./supabase/client";
import { getSafeLocale } from "./storage";

const getSessionExpiredMessage = () => {
  const isEn = getSafeLocale() === "en";
  return isEn ? "Login session expired. Please log in again." : "로그인 세션이 만료되었어요. 다시 로그인해 주세요.";
};

// 초안은 사용자·모드(싱글/멀티)당 하나. (user_id, is_single_artist) 유니크 인덱스가 기준이다.
const DRAFT_KEY = "user_id,is_single_artist";

// Stage 1: Save artist selection
export const saveArtistSelectionDraft = async (selectedArtists: any[], isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const isSingle = isSingleArtist ?? (selectedArtists.length === 1);
  const title = selectedArtists.length > 0
    ? `${selectedArtists.map((a: any) => a.name).slice(0, 2).join(", ")} 외 월드컵 초안`
    : "내 음악 월드컵";

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert({
      user_id: user.id,
      is_single_artist: isSingle,
      status: 'artist_selection',
      selected_artists: selectedArtists,
      title,
      progress: null,
      saved_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: DRAFT_KEY });

  if (error) {
    console.error("[Supabase DB] Error saving artist selection draft:", error.message);
  }
};

// Stage 2: Save track selection
export const saveTrackSelectionDraft = async (selectedArtists: any[], selectedTracks: any[], isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const isSingle = isSingleArtist ?? (selectedArtists.length === 1);

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert({
      user_id: user.id,
      is_single_artist: isSingle,
      status: 'track_selection',
      selected_artists: selectedArtists,
      selected_tracks: selectedTracks,
      progress: null,
      saved_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: DRAFT_KEY });

  if (error) {
    console.error("[Supabase DB] Error saving track selection draft:", error.message);
  }
};

// Downgrade active draft to Artist Selection and clear track selection
export const downgradeDraftToArtistSelection = async (selectedArtists: any[], isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const isSingle = isSingleArtist ?? (selectedArtists.length === 1);
  const title = selectedArtists.length > 0
    ? `${selectedArtists.map((a: any) => a.name).slice(0, 2).join(", ")} 외 월드컵 초안`
    : "내 음악 월드컵";

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert({
      user_id: user.id,
      is_single_artist: isSingle,
      status: 'artist_selection',
      selected_artists: selectedArtists,
      selected_tracks: null,
      phase: null,
      current_round_name: null,
      current_match_index: null,
      progress: null,
      saved_at: null,
      // NOT NULL 컬럼이라 비울 때는 [] 로. 빼먹으면 이전 월드컵의 뺀 곡이 다음 판으로 넘어간다.
      skipped_tracks: [],
      title,
      updated_at: new Date().toISOString()
    }, { onConflict: DRAFT_KEY });

  if (error) {
    console.error("[Supabase DB] Error downgrading draft status:", error.message);
  }
};

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
