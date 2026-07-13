import { createClient } from "@/utils/supabase/client";

// 1. Submit Unreleased Track
export const submitUnreleasedTrack = async (track: {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  videoUrl?: string;
  releaseDate?: string;
}) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("unreleased_tracks")
    .insert({
      id: track.id,
      title: track.title,
      artist_id: track.artistId,
      artist_name: track.artistName,
      video_url: track.videoUrl || null,
      release_date: track.releaseDate || null,
      is_approved: false, // Pending by default
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase DB] Error inserting unreleased track:", error.message);
    throw error;
  }

  return data;
};

// 2. Fetch Unreleased Tracks for Artist (Approved tracks + Submitter's own pending tracks)
export const fetchUnreleasedTracksForArtist = async (artistId: string) => {
  const supabase = createClient();
  
  // RLS handles visibility:
  // - Anyone can read approved tracks
  // - Submitters can read their own pending tracks
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .select("*")
    .eq("artist_id", artistId)
    .eq("is_released", false);

  if (error) {
    console.error("[Supabase DB] Error fetching unreleased tracks for artist:", error.message);
    return [];
  }

  return data || [];
};

// 3. Fetch Pending Unreleased Tracks (Admin only - RLS protected)
export const fetchPendingUnreleasedTracks = async () => {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .select("*")
    .eq("is_approved", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Supabase DB] Error fetching pending unreleased tracks:", error.message);
    throw error;
  }

  return data || [];
};

// 4. Approve Unreleased Track (Admin only - RLS protected)
export const approveUnreleasedTrack = async (trackId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("unreleased_tracks")
    .update({ is_approved: true })
    .eq("id", trackId)
    .select()
    .single();

  if (error) {
    console.error("[Supabase DB] Error approving unreleased track:", error.message);
    throw error;
  }

  return data;
};

// 5. Reject/Delete Unreleased Track (Admin only - RLS protected)
export const rejectUnreleasedTrack = async (trackId: string) => {
  const supabase = createClient();

  const { error } = await supabase
    .from("unreleased_tracks")
    .delete()
    .eq("id", trackId);

  if (error) {
    console.error("[Supabase DB] Error deleting unreleased track:", error.message);
    throw error;
  }
};

// 6. Fetch All Approved Unreleased Tracks (Not yet officially released)
export const fetchAllApprovedUnreleasedTracks = async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .select("*")
    .eq("is_approved", true)
    .eq("is_released", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase DB] Error fetching approved unreleased tracks:", error.message);
    throw error;
  }

  return data || [];
};

// 7. Submit Lyric Suggestion
export const submitLyricSuggestion = async (
  trackId: string,
  lyrics: string | null,
  lyricsFanchant: string | null,
  userNickname: string
) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");

  if (!lyrics && !lyricsFanchant) {
    throw new Error("Lyrics content cannot be empty");
  }

  const { data, error } = await supabase
    .from("unreleased_lyric_suggestions")
    .insert({
      track_id: trackId,
      lyrics: lyrics || null,
      lyrics_fanchant: lyricsFanchant || null,
      user_id: user.id,
      user_nickname: userNickname,
      is_approved: false
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase DB] Error submitting lyric suggestion:", error.message);
    throw error;
  }

  return data;
};

// 8. Fetch Pending Lyric Suggestions (Admin only)
export const fetchPendingLyricSuggestions = async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("unreleased_lyric_suggestions")
    .select("*, unreleased_tracks(title, artist_name, lyrics, lyrics_fanchant)")
    .eq("is_approved", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Supabase DB] Error fetching pending lyric suggestions:", error.message);
    throw error;
  }

  return data || [];
};

// 9. Approve Lyric Suggestion (Admin only)
export const approveLyricSuggestion = async (
  suggestionId: string,
  trackId: string,
  lyrics: string | null,
  lyricsFanchant: string | null
) => {
  const supabase = createClient();

  // Prepare fields to update on the track
  const updateFields: any = {};
  if (lyrics !== undefined && lyrics !== null) {
    updateFields.lyrics = lyrics;
  }
  if (lyricsFanchant !== undefined && lyricsFanchant !== null) {
    updateFields.lyrics_fanchant = lyricsFanchant;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: trackError } = await supabase
      .from("unreleased_tracks")
      .update(updateFields)
      .eq("id", trackId);

    if (trackError) {
      console.error("[Supabase DB] Error updating track lyrics on approval:", trackError.message);
      throw trackError;
    }
  }

  // Mark suggestion as approved
  const { data, error: suggestionError } = await supabase
    .from("unreleased_lyric_suggestions")
    .update({ is_approved: true })
    .eq("id", suggestionId)
    .select()
    .single();

  if (suggestionError) {
    console.error("[Supabase DB] Error marking suggestion as approved:", suggestionError.message);
    throw suggestionError;
  }

  return data;
};

// 10. Reject Lyric Suggestion (Admin only)
export const rejectLyricSuggestion = async (suggestionId: string) => {
  const supabase = createClient();

  const { error } = await supabase
    .from("unreleased_lyric_suggestions")
    .delete()
    .eq("id", suggestionId);

  if (error) {
    console.error("[Supabase DB] Error deleting lyric suggestion:", error.message);
    throw error;
  }
};

// 11. Report Official Release (User action)
export const reportTrackReleased = async (trackId: string) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("report_track_released", { track_id: trackId });

  if (error) {
    console.error("[Supabase DB] Error reporting track release:", error.message);
    throw error;
  }

  return data;
};

// 12. Fetch Approved Unreleased Tracks for Admin Management
export const fetchApprovedUnreleasedTracksForAdmin = async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .select("*")
    .eq("is_approved", true)
    .eq("is_released", false)
    .order("release_reported", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase DB] Error fetching approved tracks for admin:", error.message);
    throw error;
  }

  return data || [];
};

// 13. Mark Track as Officially Released (Admin only)
export const markTrackReleased = async (trackId: string) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .update({ is_released: true })
    .eq("id", trackId)
    .select()
    .single();

  if (error) {
    console.error("[Supabase DB] Error marking track as released:", error.message);
    throw error;
  }

  return data;
};

// 14. Fetch All Previously Unreleased, Now Officially Released Tracks (For History archiving)
export const fetchAllReleasedUnreleasedTracks = async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("unreleased_tracks")
    .select("*")
    .eq("is_approved", true)
    .eq("is_released", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase DB] Error fetching released tracks archive:", error.message);
    throw error;
  }

  return data || [];
};

