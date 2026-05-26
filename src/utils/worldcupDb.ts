import { createClient } from "./supabase/client";

// Stage 1: Save artist selection
export const saveArtistSelectionDraft = async (selectedArtists: any[]) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const title = selectedArtists.length > 0 
    ? `${selectedArtists.map((a: any) => a.name).slice(0, 2).join(", ")} 외 월드컵 초안`
    : "내 음악 월드컵";

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert({
      user_id: user.id,
      status: 'artist_selection',
      selected_artists: selectedArtists,
      title,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    console.error("[Supabase DB] Error saving artist selection draft:", error.message);
  }
};

// Stage 2: Save track selection
export const saveTrackSelectionDraft = async (selectedArtists: any[], selectedTracks: any[]) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('tournament_drafts')
    .upsert({
      user_id: user.id,
      status: 'track_selection',
      selected_artists: selectedArtists,
      selected_tracks: selectedTracks,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    console.error("[Supabase DB] Error saving track selection draft:", error.message);
  }
};

// Stage 3 & 4: Save active tournament playing state
export const saveTournamentProgress = async (progressState: any, selectedArtists: any[], selectedTracks: any[], title: string) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const draftData = {
    user_id: user.id,
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
    .upsert(draftData, { onConflict: 'user_id' });

  if (error) {
    console.error("[Supabase DB] Error saving tournament progress:", error.message);
  }
};

// Load active draft journey
export const loadActiveDraft = async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) {
    // If not found, it is expected if there is no active draft
    return null;
  }

  return data;
};

// Delete active draft
export const deleteActiveDraft = async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('tournament_drafts')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error("[Supabase DB] Error deleting active draft:", error.message);
  }
};

// Save completed tournament results
export const saveCompletedResult = async (finalWinners: any[], eliminatedTracks: any[], title: string) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const winner = finalWinners[0];
  const fullRanking = [winner, ...eliminatedTracks];

  const resultData = {
    user_id: user.id,
    title,
    winner_track_id: winner.id,
    winner_track_title: winner.title,
    winner_track_artist: winner.artistName,
    winner_track_image: winner.albumImage,
    total_candidates: fullRanking.length,
    ranking: fullRanking,
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
