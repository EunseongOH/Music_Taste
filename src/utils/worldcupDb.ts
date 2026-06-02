import { createClient } from "./supabase/client";

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
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,is_single_artist' });

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
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,is_single_artist' });

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
      tracks: null,
      matches: null,
      winners: null,
      eliminated_tracks: null,
      selected_byes: null,
      title,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,is_single_artist' });

  if (error) {
    console.error("[Supabase DB] Error downgrading draft status:", error.message);
  }
};


// Stage 3 & 4: Save active tournament playing state
export const saveTournamentProgress = async (progressState: any, selectedArtists: any[], selectedTracks: any[], title: string, isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const isSingle = isSingleArtist ?? (selectedArtists.length === 1);

  const draftData = {
    user_id: user.id,
    is_single_artist: isSingle,
    title,
    status: progressState.phase === 'pre-tournament' ? 'pre_tournament' : 'playing',
    selected_artists: selectedArtists,
    selected_tracks: selectedTracks,
    phase: progressState.phase,
    current_round_name: progressState.currentRoundName,
    current_match_index: progressState.currentMatchIndex,
    bye_count: progressState.byeCount,
    tracks: progressState.tracks,
    matches: progressState.matches,
    winners: progressState.winners,
    eliminated_tracks: progressState.eliminatedTracks,
    selected_byes: Array.from(progressState.selectedByes || []),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert(draftData, { onConflict: 'user_id,is_single_artist' });

  if (error) {
    console.error("[Supabase DB] Error saving tournament progress:", error.message);
  }
};

// Load active draft journey
export const loadActiveDraft = async (isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const query = supabase
    .from('tournament_drafts')
    .select('*')
    .eq('user_id', user.id);

  if (isSingleArtist !== undefined) {
    query.eq('is_single_artist', isSingleArtist);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
};

// Delete active draft
export const deleteActiveDraft = async (isSingleArtist?: boolean) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const query = supabase
    .from('tournament_drafts')
    .delete()
    .eq('user_id', user.id);

  if (isSingleArtist !== undefined) {
    query.eq('is_single_artist', isSingleArtist);
  }

  const { error } = await query;
  if (error) {
    console.error("[Supabase DB] Error deleting active draft:", error.message);
  }
};

// Save completed tournament results
export const saveCompletedResult = async (
  finalWinners: any[], 
  eliminatedTracks: any[], 
  title: string,
  options?: {
    isPublic?: boolean;
    isSingleArtist?: boolean;
    artistId?: string | null;
    artistName?: string | null;
  }
) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const winner = finalWinners[0];
  const fullRanking = [winner, ...eliminatedTracks];

  let userNickname = "";
  let userProfileImage = "";
  if (typeof window !== "undefined") {
    userNickname = sessionStorage.getItem("userNickname") || localStorage.getItem("userNickname") || "";
    if (!userNickname || userNickname.includes("@")) {
      userNickname = user.user_metadata?.nickname || "";
    }
    if (!userNickname || userNickname.includes("@")) {
      userNickname = "음악팬";
    }
    userProfileImage = sessionStorage.getItem("userProfileImg") || localStorage.getItem("userProfileImg") || "https://picsum.photos/seed/user/100/100";
  }

  const resultData = {
    user_id: user.id,
    title,
    winner_track_id: winner.id,
    winner_track_title: winner.title,
    winner_track_artist: winner.artistName,
    winner_track_image: winner.albumImage,
    total_candidates: fullRanking.length,
    ranking: fullRanking,
    is_public: options?.isPublic ?? true,
    is_single_artist: options?.isSingleArtist ?? false,
    artist_id: options?.artistId ?? null,
    artist_name: options?.artistName ?? null,
    user_nickname: userNickname,
    user_profile_image: userProfileImage
  };

  const { error: insertError } = await supabase
    .from('tournament_results')
    .insert(resultData);

  if (insertError) {
    console.error("[Supabase DB] Error saving tournament results:", insertError.message);
    return false;
  }

  // Once saved successfully, clear the draft
  await deleteActiveDraft();
  return true;
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
  options?: { isPublic?: boolean }
) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const winner = finalWinners[0];
  const fullRanking = [winner, ...eliminatedTracks];

  let userNickname = "";
  let userProfileImage = "";
  if (typeof window !== "undefined") {
    userNickname = sessionStorage.getItem("userNickname") || localStorage.getItem("userNickname") || "";
    if (!userNickname || userNickname.includes("@")) {
      userNickname = user.user_metadata?.nickname || "";
    }
    if (!userNickname || userNickname.includes("@")) {
      userNickname = "음악팬";
    }
    userProfileImage = sessionStorage.getItem("userProfileImg") || localStorage.getItem("userProfileImg") || "https://picsum.photos/seed/user/100/100";
  }

  const updateData = {
    title,
    winner_track_id: winner.id,
    winner_track_title: winner.title,
    winner_track_artist: winner.artistName,
    winner_track_image: winner.albumImage,
    total_candidates: fullRanking.length,
    ranking: fullRanking,
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
    console.error("[Supabase DB] Error overwriting tournament result:", error.message);
    return false;
  }

  // Once saved successfully, clear the draft
  await deleteActiveDraft();
  return true;
};
