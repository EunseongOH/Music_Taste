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
    .eq("artist_id", artistId);

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
