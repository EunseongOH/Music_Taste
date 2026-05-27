"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Compass, Disc, Search, Plus, X, Info, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { getArtistAlbums, getAlbumTracks } from "@/utils/spotify";
import { saveTrackSelectionDraft, loadActiveDraft, deleteActiveDraft, downgradeDraftToArtistSelection } from "@/utils/worldcupDb";
import { submitUnreleasedTrack, fetchUnreleasedTracksForArtist } from "@/utils/unreleasedDb";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";

// --- DUMMY DATA STRUCTURE ---
interface Track {
  id: string;
  title: string;
  duration: string;
}

interface Album {
  id: string;
  title: string;
  type: "Album" | "Single" | "EP";
  year: string;
  image: string;
  tracks: Track[];
  totalTracks?: number;
}

interface ArtistGroup {
  id: string;
  name: string;
  image: string;
  albums: Album[];
  unreleasedAlbums?: Album[]; // decoupled virtual single albums
  albumsLoaded?: boolean;
  totalReleases?: number;
  albumsPage?: number; // 0-based page index
}

const getYouTubeVideoId = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function TracksPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [artistData, setArtistData] = useState<ArtistGroup[]>([]);
  const [expandedArtistId, setExpandedArtistId] = useState<string | null>(null);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  
  // Advanced Selection Metadata Cache & Debounced Search States
  const [selectedTracksMetadata, setSelectedTracksMetadata] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalArtistId, setModalArtistId] = useState<string | null>(null);
  const [unreleasedForm, setUnreleasedForm] = useState({ title: '', videoUrl: '', date: '' });
  const [notification, setNotification] = useState<string | null>(null);

  const [exitWizardStep, setExitWizardStep] = useState<'main' | 'exit_confirm' | null>(null);
  const [customAlert, setCustomAlert] = useState<string | null>(null);

  // Reload prevention for unsaved changes
  React.useEffect(() => {
    if (selectedTrackIds.size === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedTrackIds.size]);

  // Back button interception
  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedTrackIds.size > 0) {
      setExitWizardStep('main');
    } else {
      router.push("/explore");
    }
  };

  const handleReturnToArtists = async () => {
    setExitWizardStep(null);
    
    // Clear track selections locally
    localStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_tracks");
    setSelectedTrackIds(new Set());
    setSelectedTracksMetadata({});

    // Update draft to artist_selection status and wipe selected_tracks in Supabase
    if (user) {
      try {
        const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
        await downgradeDraftToArtistSelection(selectedArtists);
      } catch (err) {
        console.error("Error downgrading draft state to artist_selection:", err);
      }
    }
    
    router.push("/explore");
  };

  const handleConfirmSaveExit = async () => {
    setExitWizardStep(null);
    
    // Build full tracks data using metadata cache and fallback search
    const selectedTracksData: any[] = [];
    selectedTrackIds.forEach(id => {
      if (selectedTracksMetadata[id]) {
        selectedTracksData.push(selectedTracksMetadata[id]);
      } else {
        artistData.forEach(artist => {
          artist.albums.forEach(album => {
            const track = album.tracks.find(t => t.id === id);
            if (track) {
              selectedTracksData.push({
                ...track,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              });
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
          }
        });
      }
    });

    const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
    if (storedTracksStr) {
      try {
        const previouslyLoadedTracks = JSON.parse(storedTracksStr);
        previouslyLoadedTracks.forEach((t: any) => {
          if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
            selectedTracksData.push(t);
          }
        });
      } catch (e) {}
    }

    const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
    await saveTrackSelectionDraft(selectedArtists, selectedTracksData);
    router.push("/");
  };

  const handleDiscardExit = async () => {
    setExitWizardStep(null);
    if (user) {
      await deleteActiveDraft();
    }
    localStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_tracks");
    router.push("/");
  };

  // Load selection draft & initial artists
  React.useEffect(() => {
    const fetchSpotifyData = async () => {
      let stored = sessionStorage.getItem('selectedArtists') || localStorage.getItem('selectedArtists');

      // Load from active draft in Supabase if user is logged in
      if (user) {
        try {
          const draft = await loadActiveDraft();
          if (draft) {
            if (draft.selected_artists && draft.selected_artists.length > 0) {
              stored = JSON.stringify(draft.selected_artists);
              sessionStorage.setItem('selectedArtists', stored);
              localStorage.setItem('selectedArtists', stored);
            }
            if (draft.selected_tracks && draft.selected_tracks.length > 0) {
              // Hydrate local storages with full track metadata
              const tracksStr = JSON.stringify(draft.selected_tracks);
              sessionStorage.setItem("worldcup_tracks", tracksStr);
              localStorage.setItem("worldcup_tracks", tracksStr);

              // Set selected track IDs
              const loadedTrackIds = draft.selected_tracks.map((t: any) => typeof t === 'string' ? t : t.id);
              setSelectedTrackIds(new Set(loadedTrackIds));

              // Load metadata cache
              const metadataMap: Record<string, any> = {};
              draft.selected_tracks.forEach((t: any) => {
                if (typeof t === 'object' && t !== null) {
                  metadataMap[t.id] = t;
                }
              });
              setSelectedTracksMetadata(metadataMap);
            }
          }
        } catch (err) {
          console.error("Error loading active draft from Supabase:", err);
        }
      }

      // Fallback to user_metadata from Supabase
      if (!stored && user?.user_metadata?.selected_artists) {
        const artistsData = user.user_metadata.selected_artists;
        stored = JSON.stringify(artistsData);
        sessionStorage.setItem('selectedArtists', stored);
        localStorage.setItem('selectedArtists', stored);
      }

      // Sync metadata cache from storage fallbacks
      const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      if (storedTracksStr) {
        try {
          const previouslyLoadedTracks = JSON.parse(storedTracksStr);
          const metadataMap: Record<string, any> = {};
          const loadedTrackIds: string[] = [];
          previouslyLoadedTracks.forEach((t: any) => {
            metadataMap[t.id] = t;
            loadedTrackIds.push(t.id);
          });
          setSelectedTracksMetadata(prev => ({ ...prev, ...metadataMap }));
          if (selectedTrackIds.size === 0 && loadedTrackIds.length > 0) {
            setSelectedTrackIds(new Set(loadedTrackIds));
          }
        } catch (e) {}
      }

      if (!stored) {
         setIsLoaded(true);
         return;
      }
      try {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) {
          const initialData = parsed.map((a: any) => ({
            id: a.id,
            name: a.name,
            image: a.image,
            albums: [], 
            unreleasedAlbums: [],
            albumsLoaded: false,
            totalReleases: 0,
            albumsPage: 0
          }));
          setArtistData(initialData);
        }
      } catch (e) {
        console.error("Failed to parse spotify data", e);
      }
      setIsLoaded(true);
    };

    fetchSpotifyData();
  }, [user]);

  // Save selected tracks to Supabase in the background
  React.useEffect(() => {
    if (!user || artistData.length === 0) return;
    const saveTrackDraft = async () => {
      const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
      
      const selectedTracksData: any[] = [];
      selectedTrackIds.forEach(id => {
        if (selectedTracksMetadata[id]) {
          selectedTracksData.push(selectedTracksMetadata[id]);
        } else {
          artistData.forEach(artist => {
            artist.albums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
            if (artist.unreleasedAlbums) {
              artist.unreleasedAlbums.forEach(album => {
                const track = album.tracks.find(t => t.id === id);
                if (track) {
                  selectedTracksData.push({
                    ...track,
                    artistName: artist.name,
                    albumTitle: album.title,
                    albumImage: album.image,
                    albumId: album.id
                  });
                }
              });
            }
          });
        }
      });

      const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      if (storedTracksStr) {
        try {
          const previouslyLoadedTracks = JSON.parse(storedTracksStr);
          previouslyLoadedTracks.forEach((t: any) => {
            if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
              selectedTracksData.push(t);
            }
          });
        } catch (e) {}
      }

      await saveTrackSelectionDraft(selectedArtists, selectedTracksData);
      
      sessionStorage.setItem("worldcup_tracks", JSON.stringify(selectedTracksData));
      localStorage.setItem("worldcup_tracks", JSON.stringify(selectedTracksData));
    };
    
    const timer = setTimeout(() => {
      saveTrackDraft();
    }, 1500); 
    return () => clearTimeout(timer);
  }, [selectedTrackIds, artistData, user, selectedTracksMetadata]);

  // Debounced search effect
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const artistIds = artistData.map(a => a.id).join(",");
        const artistNames = artistData.map(a => a.name).join(",");
        
        const response = await fetch(`/api/spotify-search?q=${encodeURIComponent(searchQuery)}&artistIds=${artistIds}&artistNames=${artistNames}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("Search fetch failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, artistData]);

  const toggleArtistAccordion = async (artistId: string) => {
    if (expandedArtistId === artistId) {
      setExpandedArtistId(null);
    } else {
      setExpandedArtistId(artistId);

      // Lazy load page 1 of albums for this artist
      const artist = artistData.find(a => a.id === artistId);
      if (artist && !artist.albumsLoaded) {
        setLoadingAlbums(prev => new Set(prev).add(`artist_${artistId}`));
        try {
          const albumsData = await getArtistAlbums(artistId, 0, 10);
          const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
            id: albumRaw.id,
            title: albumRaw.name,
            type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
            year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
            image: albumRaw.images?.[0]?.url || "https://picsum.photos/seed/default/300/300",
            tracks: [], 
            totalTracks: albumRaw.total_tracks || 0
          }));

          // Fetch unreleased tracks from Supabase and map them to custom virtual Single albums
          let unreleasedAlbumsList: Album[] = [];
          try {
            const dbUnreleased = await fetchUnreleasedTracksForArtist(artistId);
            if (dbUnreleased && dbUnreleased.length > 0) {
              unreleasedAlbumsList = dbUnreleased.map((t: any) => {
                const youtubeId = getYouTubeVideoId(t.videoUrl || t.video_url || "");
                const coverImage = youtubeId 
                  ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
                  : `https://picsum.photos/seed/${t.id}/300/300`;
                
                const trackYear = t.releaseDate 
                  ? t.releaseDate.substring(0, 4) 
                  : t.release_date 
                    ? t.release_date.substring(0, 4) 
                    : new Date().getFullYear().toString();

                return {
                  id: `al_unreleased_${t.id}`,
                  title: t.title, // album title matches track name perfectly
                  type: "Single" as const,
                  year: trackYear,
                  image: coverImage,
                  tracks: [
                    {
                      id: t.id,
                      title: t.title,
                      duration: "Live"
                    }
                  ],
                  totalTracks: 1
                };
              });
            }
          } catch (err) {
            console.error("Failed to fetch unreleased tracks from Supabase:", err);
          }

          setArtistData(prev => prev.map(a => 
            a.id === artistId 
              ? { 
                  ...a, 
                  albums: mappedAlbums, 
                  unreleasedAlbums: unreleasedAlbumsList,
                  albumsLoaded: true, 
                  totalReleases: albumsData.total,
                  albumsPage: 0
                } 
              : a
          ));
        } catch (e) {
          console.error("Failed to load albums for artist", e);
        } finally {
          setLoadingAlbums(prev => {
            const next = new Set(prev);
            next.delete(`artist_${artistId}`);
            return next;
          });
        }
      }
    }
    setExpandedAlbumId(null); 
  };

  // Change album pagination page (server-side getArtistAlbums limit=10)
  const handleArtistAlbumsPageChange = async (artistId: string, targetPage: number) => {
    const artist = artistData.find(a => a.id === artistId);
    if (!artist) return;

    setLoadingAlbums(prev => new Set(prev).add(`artist_${artistId}`));
    try {
      const offset = targetPage * 10;
      const albumsData = await getArtistAlbums(artistId, offset, 10);
      
      const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
        id: albumRaw.id,
        title: albumRaw.name,
        type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
        year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
        image: albumRaw.images?.[0]?.url || "https://picsum.photos/seed/default/300/300",
        tracks: [],
        totalTracks: albumRaw.total_tracks || 0
      }));

      setArtistData(prev => prev.map(a => 
        a.id === artistId 
          ? { 
              ...a, 
              albums: mappedAlbums, 
              albumsPage: targetPage,
              totalReleases: albumsData.total
            } 
          : a
      ));
      
      setExpandedAlbumId(null);
    } catch (e) {
      console.error("Failed to change album page:", e);
    } finally {
      setLoadingAlbums(prev => {
        const next = new Set(prev);
        next.delete(`artist_${artistId}`);
        return next;
      });
    }
  };

  const handleAlbumClick = async (albumId: string, artistId: string) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null);
      return;
    }
    setExpandedAlbumId(albumId);

    // If it's a virtual unreleased album, it already has the track inside its properties
    if (albumId.startsWith("al_unreleased_")) return;

    // Check if we already have tracks for this album
    const isLoaded = artistData.some(artist =>
      artist.albums.some(album => album.id === albumId && album.tracks && album.tracks.length > 0)
    );
    if (isLoaded) return;
    if (loadingAlbums.has(albumId)) return;

    setLoadingAlbums(prev => new Set(prev).add(albumId));
    try {
      const tracksRaw = await getAlbumTracks(albumId);
      const tracks = tracksRaw.map((t: any) => {
        const totalSeconds = Math.floor(t.duration_ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = String(totalSeconds % 60).padStart(2, '0');
        return {
          id: t.id,
          title: t.name,
          duration: `${mins}:${secs}`,
          previewUrl: t.preview_url
        };
      });

      setArtistData(prev => prev.map(artist => {
        if (artist.id === artistId) {
          return {
            ...artist,
            albums: artist.albums.map(album =>
              album.id === albumId ? { ...album, tracks } : album
            )
          };
        }
        return artist;
      }));
    } catch (e) {
      console.error("Failed to load tracks", e);
    } finally {
      setLoadingAlbums(prev => {
        const next = new Set(prev);
        next.delete(albumId);
        return next;
      });
    }
  };

  const toggleTrack = (trackId: string, metadata?: {
    id: string;
    title: string;
    duration: string;
    artistName: string;
    albumTitle: string;
    albumImage: string;
    albumId?: string;
  }) => {
    const newSelected = new Set(selectedTrackIds);
    const newMetadata = { ...selectedTracksMetadata };

    if (newSelected.has(trackId)) {
      newSelected.delete(trackId);
      delete newMetadata[trackId];
    } else {
      newSelected.add(trackId);
      if (metadata) {
        newMetadata[trackId] = metadata;
      } else {
        // Fallback: Populate metadata from state arrays if not supplied
        let found = false;
        artistData.forEach(artist => {
          if (found) return;
          artist.albums.forEach(album => {
            if (found) return;
            const t = album.tracks.find(x => x.id === trackId);
            if (t) {
              newMetadata[trackId] = {
                id: t.id,
                title: t.title,
                duration: t.duration,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              };
              found = true;
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              if (found) return;
              const t = album.tracks.find(x => x.id === trackId);
              if (t) {
                newMetadata[trackId] = {
                  id: t.id,
                  title: t.title,
                  duration: t.duration,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                };
                found = true;
              }
            });
          }
        });
      }
    }
    setSelectedTrackIds(newSelected);
    setSelectedTracksMetadata(newMetadata);
  };

  const handleAddUnreleased = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unreleasedForm.title.trim() || !modalArtistId) return;

    const newTrackId = `t_unreleased_${Date.now()}`;
    const youtubeId = getYouTubeVideoId(unreleasedForm.videoUrl);
    const coverImage = youtubeId 
      ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
      : `https://picsum.photos/seed/${newTrackId}/300/300`;
    
    const trackYear = unreleasedForm.date 
      ? unreleasedForm.date.substring(0, 4) 
      : new Date().getFullYear().toString();

    const targetArtist = artistData.find(a => a.id === modalArtistId);
    const artistName = targetArtist ? targetArtist.name : "Unknown Artist";

    // 1. Persist to DB if user is logged in
    let persistSuccess = false;
    if (user) {
      try {
        await submitUnreleasedTrack({
          id: newTrackId,
          title: unreleasedForm.title,
          artistId: modalArtistId,
          artistName: artistName,
          videoUrl: unreleasedForm.videoUrl || undefined,
          releaseDate: unreleasedForm.date || undefined
        });
        persistSuccess = true;
      } catch (err) {
        console.error("Failed to save unreleased track to Supabase:", err);
      }
    }

    const newTrack: Track = { id: newTrackId, title: unreleasedForm.title, duration: "Live" };
    const newUnreleasedAlbum: Album = {
      id: `al_unreleased_${newTrackId}`,
      title: unreleasedForm.title, // 곡명이랑 앨범명 완벽 매칭
      type: "Single" as const,
      year: trackYear,
      image: coverImage,
      tracks: [newTrack],
      totalTracks: 1
    };

    // 2. Optimistic UI update - Add to local artistData state
    setArtistData(prev => prev.map(artist => {
      if (artist.id === modalArtistId) {
        const currentUnreleased = artist.unreleasedAlbums || [];
        return {
          ...artist,
          unreleasedAlbums: [newUnreleasedAlbum, ...currentUnreleased]
        };
      }
      return artist;
    }));

    // 3. Add to selection immediately with metadata
    toggleTrack(newTrackId, {
      id: newTrackId,
      title: unreleasedForm.title,
      duration: "Live",
      artistName: artistName,
      albumTitle: unreleasedForm.title,
      albumImage: coverImage,
      albumId: `al_unreleased_${newTrackId}`
    });

    setIsModalOpen(false);
    setUnreleasedForm({ title: '', videoUrl: '', date: '' });

    // 4. Custom notification based on login state
    if (user) {
      if (persistSuccess) {
        setNotification("미발매곡 등록이 요청되었습니다. 승인 대기 중이라도 월드컵 대진에는 즉시 사용 가능합니다!");
      } else {
        setNotification("DB 저장에 실패했으나, 임시 추가되어 현재 세션에서 즉시 사용 가능합니다!");
      }
    } else {
      setNotification("로그인하지 않은 상태입니다. 임시 추가되어 즉시 사용 가능하지만, 브라우저 종료 시 유실될 수 있습니다.");
    }
    setTimeout(() => setNotification(null), 5000);
  };

  const handleStartWorldCup = async () => {
    // Gather full details for selected tracks
    const selectedTracksData: any[] = [];
    selectedTrackIds.forEach(id => {
      if (selectedTracksMetadata[id]) {
        selectedTracksData.push(selectedTracksMetadata[id]);
      } else {
        artistData.forEach(artist => {
          artist.albums.forEach(album => {
            const track = album.tracks.find(t => t.id === id);
            if (track) {
              selectedTracksData.push({
                ...track,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              });
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
          }
        });
      }
    });

    // Merge with legacy track list inside sessionStorage
    const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
    if (storedTracksStr) {
      try {
        const previouslyLoadedTracks = JSON.parse(storedTracksStr);
        previouslyLoadedTracks.forEach((t: any) => {
          if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
            selectedTracksData.push(t);
          }
        });
      } catch (e) {}
    }

    if (selectedTracksData.length < 4) {
      setCustomAlert("최소 4개의 트랙이 필요합니다.");
      return;
    }

    const tracksStr = JSON.stringify(selectedTracksData);
    sessionStorage.setItem("worldcup_tracks", tracksStr);
    localStorage.setItem("worldcup_tracks", tracksStr);

    // Save as track selection draft before pushing
    if (user) {
      try {
        const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
        await saveTrackSelectionDraft(selectedArtists, selectedTracksData);
      } catch (err) {
        console.error("Error saving draft before tournament:", err);
      }
    }

    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_progress");

    router.push("/worldcup");
  };

  if (!isLoaded) {
    return (
      <main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="mb-8 relative w-20 h-20 flex items-center justify-center text-point opacity-80"
        >
          <Disc size={80} strokeWidth={1} />
        </motion.div>
        <h1 className="font-serif text-2xl text-navy font-bold tracking-tight">트랙 정리 중...</h1>
        <p className="font-sans text-sm text-charcoal/70 mt-2 font-medium">아티스트의 발매곡 정보를 받아오고 있어요</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-10 overflow-hidden bg-[var(--app-bg)]">
      {/* Sticky Header with Toggles & Tabs */}
      <div className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md pt-6 pb-2 px-6 border-b border-navy/10 flex flex-col gap-4 mx-[-1.5rem] w-[calc(100%+3rem)] shadow-sm">
        <div className="flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BackButton onClick={handleBackClick} className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
            <h1 className="font-serif text-2xl text-navy tracking-tight">트랙 디깅하기</h1>
          </div>
          <ProfileHeader className="" />
        </div>

        <p className="font-sans text-sm text-charcoal/80 px-6">
          앨범 커버를 탭해서 수록곡을 파헤쳐보세요
        </p>

        {/* Search Bar */}
        <div className="relative w-full px-6 mt-1 mb-1">
          <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
            <Search className="text-navy/50" size={18} strokeWidth={2} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="선택한 아티스트의 곡 제목 검색..."
            className="w-full py-2.5 pl-11 pr-10 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-10 flex items-center text-navy/40 hover:text-navy transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {searchQuery.trim() !== "" ? (
        <div className="py-6 pb-32 px-3 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="font-serif text-xl text-navy">검색 결과 ({searchResults.length})</h2>
          </div>
          {isSearching ? (
            <div className="py-20 flex flex-col items-center justify-center text-navy/50 gap-3">
              <Disc className="animate-spin text-point/70" size={28} />
              <p className="font-sans text-sm">트랙을 검색하는 중...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-20 text-center font-sans text-charcoal/50 text-sm">
              선택하신 아티스트 범위 내에 일치하는 트랙이 없습니다. 🔍
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {searchResults.map((result) => {
                const isSelected = selectedTrackIds.has(result.trackId);
                return (
                  <div
                    key={result.trackId}
                    onClick={() => {
                      toggleTrack(result.trackId, {
                        id: result.trackId,
                        title: result.title,
                        duration: result.duration,
                        artistName: result.artistName,
                        albumTitle: result.albumTitle,
                        albumImage: result.albumImage,
                        albumId: result.albumId
                      });
                    }}
                    className={`flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all active:scale-[0.98] border ${
                      isSelected 
                        ? "bg-[#F1EADC] border-point/30 shadow-[0_4px_15px_rgba(26,42,108,0.06)]" 
                        : "bg-white/60 border-navy/5 hover:border-navy/10 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm shrink-0">
                        <Image src={result.albumImage} alt={result.albumTitle} fill className="object-cover" />
                      </div>
                      <div className="text-left max-w-[200px] sm:max-w-[400px]">
                        <h4 className={`font-sans text-sm font-bold line-clamp-1 ${isSelected ? "text-point" : "text-navy"}`}>
                          {result.title}
                        </h4>
                        <p className="font-sans text-xs text-charcoal/60 mt-0.5 line-clamp-1">
                          {result.artistName} • {result.albumTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-charcoal/40 font-sans mr-1">{result.duration}</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "border-point bg-point text-white" : "border-navy/20"
                      }`}>
                        {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Standard Accordion Content */
        <div className="py-6 pb-32 flex flex-col gap-4 px-3">
          {artistData.map((artist, idx) => {
            const isArtistExpanded = expandedArtistId === artist.id;
            return (
              <section id={`artist-section-${artist.id}`} key={artist.id} className="scroll-m-40 flex flex-col border border-navy/10 rounded-[2rem] bg-white/60 p-5 shadow-sm transition-all hover:border-navy/20">
                 {/* Artist Header (Accordion Toggle) */}
                 <div
                    className="flex items-center justify-between cursor-pointer w-full group"
                    onClick={() => toggleArtistAccordion(artist.id)}
                 >
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                         <Image src={artist.image} alt={artist.name} fill sizes="56px" priority={idx === 0} className="object-cover" />
                      </div>
                      <div className="text-left">
                         <h2 className="font-serif text-xl text-navy">{artist.name}</h2>
                         <p className="font-sans text-xs text-charcoal/60 mt-0.5">
                           {loadingAlbums.has(`artist_${artist.id}`)
                             ? "앨범 로딩 중..."
                             : artist.albumsLoaded
                               ? `${artist.albums.reduce((acc, a) => acc + (a.totalTracks || a.tracks.length), 0)} Tracks • ${artist.totalReleases || artist.albums.length} Releases`
                               : "앨범 및 트랙 목록 열기"}
                         </p>
                      </div>
                    </div>
                 </div>

                 {/* Artist Albums Grid (Accordion Content) */}
                 <AnimatePresence>
                   {isArtistExpanded && (
                     <motion.div
                       initial={{ height: 0, opacity: 0 }}
                       animate={{ height: "auto", opacity: 1 }}
                       exit={{ height: 0, opacity: 0 }}
                       className="overflow-hidden"
                     >
                       <div className="mt-5 mb-2 h-px bg-navy/5 w-full hidden" />
                       {loadingAlbums.has(`artist_${artist.id}`) && artist.albums.length === 0 ? (
                          <div className="py-10 flex flex-col items-center justify-center text-navy/50 gap-3">
                             <Disc className="animate-spin text-point/70" size={28} />
                             <p className="font-sans text-sm">스포티파이에서 앨범을 불러오고 있어요...</p>
                          </div>
                       ) : (
                         <>
                           {/* Released Albums Grid */}
                           <div className="grid grid-cols-2 gap-4 mt-6">
                              {artist.albums.map(album => {
                               const isExpanded = expandedAlbumId === album.id;
                               const smoothTransition = { type: "tween" as const, ease: "circOut" as const, duration: 0.45 };
                               
                               // Calculate selected count dynamically
                               const selectedCount = album.tracks.filter(t => selectedTrackIds.has(t.id)).length;

                               return (
                                 <motion.div
                                   layout
                                   transition={smoothTransition}
                                   key={album.id}
                                   className={`flex flex-col relative ${isExpanded ? "col-span-2 bg-[#F1EADC] shadow-[0_4px_20px_rgba(26,42,108,0.08)] rounded-[2rem] p-4 border border-navy/5 z-10" : "col-span-1"}`}
                                   onClick={() => {
                                     if (!isExpanded) {
                                       handleAlbumClick(album.id, artist.id);
                                     }
                                   }}
                                 >
                                    {/* Cover & Info Row */}
                                    <motion.div layout transition={smoothTransition} className={`flex ${isExpanded ? "flex-col items-center mb-5 z-20 relative bg-[#F1EADC]" : "flex-col gap-2"}`}>
                                       <div className={`relative flex justify-center items-center ${isExpanded ? "w-full mb-3 mt-4" : "w-full"}`}>

                                         {/* LP Record (slides out when expanded) */}
                                         <AnimatePresence>
                                           {isExpanded && (
                                             <motion.div
                                               initial={{ x: 0, opacity: 0, rotate: -45 }}
                                               animate={{ x: '40%', opacity: 1, rotate: 0 }}
                                               exit={{ x: 0, opacity: 0, rotate: -45 }}
                                               transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                               className="absolute top-0 bottom-0 my-auto w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-[#111] shadow-[0_4px_15px_rgba(0,0,0,0.4)] z-0 flex items-center justify-center pointer-events-none"
                                               style={{
                                                 background: 'radial-gradient(circle, #222 0%, #0a0a0a 100%)',
                                                 boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.3)'
                                               }}
                                             >
                                                {/* Grooves */}
                                                <div className="absolute inset-[3px] sm:inset-[5px] border border-white/5 rounded-full" />
                                                <div className="absolute inset-[7px] sm:inset-[11px] border border-white/5 rounded-full" />
                                                <div className="absolute inset-[12px] sm:inset-[19px] border border-white/5 rounded-full" />
                                                <div className="absolute inset-[18px] sm:inset-[29px] border border-white/5 rounded-full" />
                                                {/* LP Label (Inner circle) */}
                                                <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full relative overflow-hidden border-2 border-[#111]">
                                                  <Image src={album.image} alt={album.title} fill className="object-cover" />
                                                </div>
                                                {/* Center hole */}
                                                <div className="absolute w-1.5 h-1.5 bg-[#F1EADC] rounded-full z-10" />
                                             </motion.div>
                                           )}
                                         </AnimatePresence>

                                         {/* Album Cover */}
                                         <motion.div
                                           layout
                                           transition={smoothTransition}
                                           onClick={(e) => {
                                             if (isExpanded) {
                                               e.stopPropagation();
                                               handleAlbumClick(album.id, artist.id);
                                             }
                                           }}
                                           className={`relative aspect-square shrink-0 overflow-hidden z-10 ${isExpanded ? "w-20 sm:w-28 md:w-32 shadow-xl cursor-pointer" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer group hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}
                                           style={{ borderRadius: isExpanded ? '0.2rem' : '2rem' }}
                                         >
                                           <Image src={album.image} alt={album.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                           {!isExpanded && (
                                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                                           )}
                                           
                                           {/* Dynamic spring-loaded selection count badge */}
                                           <AnimatePresence>
                                             {selectedCount > 0 && (
                                               <motion.div
                                                 initial={{ scale: 0, opacity: 0 }}
                                                 animate={{ scale: 1, opacity: 1 }}
                                                 exit={{ scale: 0, opacity: 0 }}
                                                 transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                 }}
                                                 className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-point text-white font-sans text-xs font-bold flex items-center justify-center shadow-md select-none pointer-events-auto"
                                               >
                                                 {selectedCount}
                                               </motion.div>
                                             )}
                                           </AnimatePresence>
                                         </motion.div>
                                       </div>

                                       {/* Info */}
                                       <motion.div
                                           layout
                                           transition={smoothTransition}
                                           onClick={(e) => {
                                             if (isExpanded) {
                                               e.stopPropagation();
                                               handleAlbumClick(album.id, artist.id);
                                             }
                                           }}
                                           className={`flex flex-col justify-center text-center ${isExpanded ? "w-full mt-2 cursor-pointer" : "px-2 mt-1 text-left"}`}
                                        >
                                          <p className="font-sans font-bold text-sm text-navy line-clamp-1">{album.title}</p>
                                          <div className={`flex items-center gap-1 font-sans text-xs text-charcoal/60 mt-0.5 ${isExpanded ? "justify-center" : "justify-start"}`}>
                                             {isExpanded && <Disc size={10} />}
                                             <span className="line-clamp-1">{album.type} • {album.year}</span>
                                          </div>
                                       </motion.div>
                                    </motion.div>

                                    {/* Expandable Tracks List */}
                                    <AnimatePresence>
                                      {isExpanded && (
                                         <motion.div
                                           initial={{ opacity: 0, height: 0, y: -15 }}
                                           animate={{ opacity: 1, height: 'auto', y: 0 }}
                                           exit={{ opacity: 0, height: 0, y: -15, transition: { duration: 0.3 } }}
                                           transition={smoothTransition}
                                           onClick={(e) => e.stopPropagation()}
                                           className="flex flex-col gap-1 overflow-hidden relative pt-2 -mt-2 shadow-[inset_0_12px_12px_-12px_rgba(0,0,0,0.06)] rounded-b-[1.5rem]"
                                         >
                                            <div className="w-full h-px bg-navy/10 mb-2 mt-2" />

                                            {loadingAlbums.has(album.id) ? (
                                              <div className="py-6 flex flex-col items-center justify-center text-navy/50 font-sans text-sm gap-2">
                                                <Disc className="animate-spin text-point/70" size={20} />
                                                <span>트랙을 불러오는 중...</span>
                                              </div>
                                            ) : (
                                              album.tracks.map((track, idx) => {
                                                const isSelected = selectedTrackIds.has(track.id);
                                                return (
                                                  <div
                                                    key={track.id}
                                                    onClick={(e) => { 
                                                      e.stopPropagation(); 
                                                      toggleTrack(track.id, {
                                                        id: track.id,
                                                        title: track.title,
                                                        duration: track.duration,
                                                        artistName: artist.name,
                                                        albumTitle: album.title,
                                                        albumImage: album.image,
                                                        albumId: album.id
                                                      }); 
                                                    }}
                                                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors active:scale-[0.98] ${isSelected ? "bg-point/10" : "hover:bg-navy/5"}`}
                                                  >
                                                     <div className="flex items-center gap-3">
                                                        <span className="text-xs font-serif text-navy/40 w-4 text-right">{idx + 1}</span>
                                                        <span className={`font-sans text-sm line-clamp-1 ${isSelected ? "text-point font-bold" : "text-charcoal"}`}>{track.title}</span>
                                                     </div>
                                                     {isSelected ? (
                                                        <Check size={18} className="text-point" strokeWidth={3} />
                                                     ) : (
                                                        <span className="text-xs text-charcoal/40 font-sans">{track.duration}</span>
                                                     )}
                                                  </div>
                                                )
                                              })
                                            )}

                                            <button
                                              onClick={(e) => { e.stopPropagation(); setExpandedAlbumId(null); }}
                                              className="mt-4 py-3 w-full text-center text-sm font-sans font-medium text-navy/70 bg-navy/5 rounded-full hover:bg-navy/10 transition-colors"
                                            >
                                              닫기
                                            </button>
                                         </motion.div>
                                      )}
                                    </AnimatePresence>
                                 </motion.div>
                               );
                              })}
                           </div>

                           {/* Spotify Released Albums Pagination Bar */}
                           {artist.totalReleases && artist.totalReleases > 10 && (
                             <div className="flex items-center justify-center gap-4 mt-6 py-2 border-t border-b border-navy/5 font-sans">
                               <button
                                 disabled={(artist.albumsPage || 0) === 0}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleArtistAlbumsPageChange(artist.id, (artist.albumsPage || 0) - 1);
                                 }}
                                 className="px-3 py-1.5 rounded-lg border border-navy/10 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                               >
                                 이전
                               </button>
                               <span className="text-xs font-medium text-navy/70">
                                 {(artist.albumsPage || 0) + 1} / {Math.ceil(artist.totalReleases / 10)}
                               </span>
                               <button
                                 disabled={(artist.albumsPage || 0) >= Math.ceil(artist.totalReleases / 10) - 1}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleArtistAlbumsPageChange(artist.id, (artist.albumsPage || 0) + 1);
                                 }}
                                 className="px-3 py-1.5 rounded-lg border border-navy/10 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                               >
                                 다음
                               </button>
                             </div>
                           )}

                           {/* Decoupled Unreleased Section - Renders individual virtual Single albums */}
                           {artist.unreleasedAlbums && artist.unreleasedAlbums.length > 0 && (
                             <div className="mt-8 pt-6 border-t border-dashed border-navy/10 text-left">
                               <h3 className="font-serif text-lg text-navy mb-4 flex items-center gap-2">
                                 <Compass size={18} className="text-point shrink-0" />
                                 미발매곡
                               </h3>
                               <div className="grid grid-cols-2 gap-4">
                                  {artist.unreleasedAlbums.map(album => {
                                    const isExpanded = expandedAlbumId === album.id;
                                    const smoothTransition = { type: "tween" as const, ease: "circOut" as const, duration: 0.45 };
                                    
                                    // Calculate selected count inside virtual single album (always max 1 track)
                                    const selectedCount = album.tracks.filter(t => selectedTrackIds.has(t.id)).length;

                                    return (
                                      <motion.div
                                        layout
                                        transition={smoothTransition}
                                        key={album.id}
                                        className={`flex flex-col relative ${isExpanded ? "col-span-2 bg-[#F1EADC] shadow-[0_4px_20px_rgba(26,42,108,0.08)] rounded-[2rem] p-4 border border-navy/5 z-10" : "col-span-1"}`}
                                        onClick={() => {
                                          if (!isExpanded) {
                                            handleAlbumClick(album.id, artist.id);
                                          }
                                        }}
                                      >
                                         {/* Cover & Info Row */}
                                         <motion.div layout transition={smoothTransition} className={`flex ${isExpanded ? "flex-col items-center mb-5 z-20 relative bg-[#F1EADC]" : "flex-col gap-2"}`}>
                                            <div className={`relative flex justify-center items-center ${isExpanded ? "w-full mb-3 mt-4" : "w-full"}`}>

                                              {/* LP Record (slides out when expanded) */}
                                              <AnimatePresence>
                                                {isExpanded && (
                                                  <motion.div
                                                    initial={{ x: 0, opacity: 0, rotate: -45 }}
                                                    animate={{ x: '40%', opacity: 1, rotate: 0 }}
                                                    exit={{ x: 0, opacity: 0, rotate: -45 }}
                                                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                                    className="absolute top-0 bottom-0 my-auto w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-[#111] shadow-[0_4px_15px_rgba(0,0,0,0.4)] z-0 flex items-center justify-center pointer-events-none"
                                                    style={{
                                                      background: 'radial-gradient(circle, #222 0%, #0a0a0a 100%)',
                                                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.3)'
                                                    }}
                                                  >
                                                     {/* Grooves */}
                                                     <div className="absolute inset-[3px] sm:inset-[5px] border border-white/5 rounded-full" />
                                                     <div className="absolute inset-[7px] sm:inset-[11px] border border-white/5 rounded-full" />
                                                     <div className="absolute inset-[12px] sm:inset-[19px] border border-white/5 rounded-full" />
                                                     <div className="absolute inset-[18px] sm:inset-[29px] border border-white/5 rounded-full" />
                                                     {/* LP Label */}
                                                     <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full relative overflow-hidden border-2 border-[#111]">
                                                       <Image src={album.image} alt={album.title} fill className="object-cover" />
                                                     </div>
                                                     {/* Center hole */}
                                                     <div className="absolute w-1.5 h-1.5 bg-[#F1EADC] rounded-full z-10" />
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>

                                              {/* Album Cover */}
                                              <motion.div
                                                layout
                                                transition={smoothTransition}
                                                onClick={(e) => {
                                                  if (isExpanded) {
                                                    e.stopPropagation();
                                                    handleAlbumClick(album.id, artist.id);
                                                  }
                                                }}
                                                className={`relative aspect-square shrink-0 overflow-hidden z-10 ${isExpanded ? "w-20 sm:w-28 md:w-32 shadow-xl cursor-pointer" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer group hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}
                                                style={{ borderRadius: isExpanded ? '0.2rem' : '2rem' }}
                                              >
                                                <Image src={album.image} alt={album.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                                {!isExpanded && (
                                                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                                                )}
                                                
                                                {/* Selected count spring-badge */}
                                                <AnimatePresence>
                                                  {selectedCount > 0 && (
                                                    <motion.div
                                                      initial={{ scale: 0, opacity: 0 }}
                                                      animate={{ scale: 1, opacity: 1 }}
                                                      exit={{ scale: 0, opacity: 0 }}
                                                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                      }}
                                                      className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-point text-white font-sans text-xs font-bold flex items-center justify-center shadow-md select-none pointer-events-auto"
                                                    >
                                                      {selectedCount}
                                                    </motion.div>
                                                  )}
                                                </AnimatePresence>
                                              </motion.div>
                                            </div>

                                            {/* Info */}
                                            <motion.div
                                                layout
                                                transition={smoothTransition}
                                                onClick={(e) => {
                                                  if (isExpanded) {
                                                    e.stopPropagation();
                                                    handleAlbumClick(album.id, artist.id);
                                                  }
                                                }}
                                                className={`flex flex-col justify-center text-center ${isExpanded ? "w-full mt-2 cursor-pointer" : "px-2 mt-1 text-left"}`}
                                             >
                                               <p className="font-sans font-bold text-sm text-navy line-clamp-1">{album.title}</p>
                                               <div className={`flex items-center gap-1 font-sans text-xs text-charcoal/60 mt-0.5 ${isExpanded ? "justify-center" : "justify-start"}`}>
                                                  {isExpanded && <Disc size={10} />}
                                                  <span className="line-clamp-1">{album.type} • {album.year}</span>
                                               </div>
                                            </motion.div>
                                         </motion.div>

                                         {/* Expandable Tracks List */}
                                         <AnimatePresence>
                                           {isExpanded && (
                                              <motion.div
                                                initial={{ opacity: 0, height: 0, y: -15 }}
                                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                                exit={{ opacity: 0, height: 0, y: -15, transition: { duration: 0.3 } }}
                                                transition={smoothTransition}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex flex-col gap-1 overflow-hidden relative pt-2 -mt-2 shadow-[inset_0_12px_12px_-12px_rgba(0,0,0,0.06)] rounded-b-[1.5rem]"
                                              >
                                                 <div className="w-full h-px bg-navy/10 mb-2 mt-2" />

                                                 {album.tracks.map((track, idx) => {
                                                   const isSelected = selectedTrackIds.has(track.id);
                                                   return (
                                                     <div
                                                       key={track.id}
                                                       onClick={(e) => { 
                                                         e.stopPropagation(); 
                                                         toggleTrack(track.id, {
                                                           id: track.id,
                                                           title: track.title,
                                                           duration: track.duration,
                                                           artistName: artist.name,
                                                           albumTitle: album.title, // identical to track title
                                                           albumImage: album.image,
                                                           albumId: album.id
                                                         }); 
                                                       }}
                                                       className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors active:scale-[0.98] ${isSelected ? "bg-point/10" : "hover:bg-navy/5"}`}
                                                     >
                                                        <div className="flex items-center gap-3">
                                                           <span className="text-xs font-serif text-navy/40 w-4 text-right">{idx + 1}</span>
                                                           <span className={`font-sans text-sm line-clamp-1 ${isSelected ? "text-point font-bold" : "text-charcoal"}`}>{track.title}</span>
                                                        </div>
                                                        {isSelected ? (
                                                           <Check size={18} className="text-point" strokeWidth={3} />
                                                        ) : (
                                                           <span className="text-xs text-charcoal/40 font-sans">{track.duration}</span>
                                                        )}
                                                     </div>
                                                   )
                                                 })}

                                                 <button
                                                   onClick={(e) => { e.stopPropagation(); setExpandedAlbumId(null); }}
                                                   className="mt-4 py-3 w-full text-center text-sm font-sans font-medium text-navy/70 bg-navy/5 rounded-full hover:bg-navy/10 transition-colors"
                                                 >
                                                   닫기
                                                 </button>
                                              </motion.div>
                                           )}
                                         </AnimatePresence>
                                      </motion.div>
                                    );
                                  })}
                               </div>
                             </div>
                           )}
                         </>
                       )}
                       
                       <button
                         onClick={(e) => { e.stopPropagation(); setModalArtistId(artist.id); setIsModalOpen(true); }}
                         className="w-full mt-6 py-3 rounded-2xl border border-dashed border-navy/30 text-navy/70 font-sans text-sm font-medium flex items-center justify-center gap-2 hover:bg-navy/5 hover:text-navy transition-colors"
                       >
                         <Plus size={16} />
                         미발매곡 추가
                       </button>
                     </motion.div>
                   )}
                 </AnimatePresence>
              </section>
            )
          })}
        </div>
      )}

      {/* FAB Bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 flex justify-center pointer-events-none">
        <div className="w-full max-w-[380px] pointer-events-auto">
          <AnimatePresence>
            {selectedTrackIds.size >= 4 && (
              <motion.button
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                onClick={handleStartWorldCup}
                className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-[0_10px_30px_rgba(26,42,108,0.3)] border border-navy/20 flex items-center justify-center gap-2 hover:bg-navy/90 transition-all active:scale-[0.98]"
              >
                <Compass size={20} className="mr-1" />
                월드컵 대진 생성중
                <span className="ml-2 bg-point text-white text-xs px-2.5 py-1 rounded-full font-bold">{selectedTrackIds.size}</span>
              </motion.button>
            )}

            {/* Minimal counter when < 4 tracks */}
            {selectedTrackIds.size > 0 && selectedTrackIds.size < 4 && (
               <motion.div
                 initial={{ y: 50, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 exit={{ y: 50, opacity: 0 }}
                 className="mx-auto w-max px-6 py-3 rounded-full bg-cream/90 backdrop-blur-md text-navy font-sans font-bold text-sm shadow-[0_4px_15px_rgba(0,0,0,0.1)] border border-navy/20 flex items-center justify-center"
               >
                 최소 {4 - selectedTrackIds.size}곡을 더 골라주세요 🔥
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Unreleased Track Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              className="bg-[#F5F2ED] w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 overflow-hidden border border-navy/10 flex flex-col"
            >
              <div className="p-6 pb-4 border-b border-navy/5 flex items-center justify-between">
                <h3 className="font-serif text-xl text-navy">미발매곡 추가</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 -mr-2 text-navy/50 hover:text-navy hover:bg-navy/5 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddUnreleased} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy/70 ml-1">곡 제목 <span className="text-point">*</span></label>
                  <input required value={unreleasedForm.title} onChange={e => setUnreleasedForm({...unreleasedForm, title: e.target.value})} type="text" placeholder="예: 미공개 자작곡 1번" className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none font-sans text-sm text-navy placeholder:text-navy/30" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy/70 ml-1">공연 영상 링크 <span className="text-point">*</span></label>
                  <input required value={unreleasedForm.videoUrl} onChange={e => setUnreleasedForm({...unreleasedForm, videoUrl: e.target.value})} type="url" placeholder="유튜브 링크 등" className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none font-sans text-sm text-navy placeholder:text-navy/30" />
                  {unreleasedForm.videoUrl && getYouTubeVideoId(unreleasedForm.videoUrl) && (
                    <div className="mt-2 w-full rounded-xl overflow-hidden border border-navy/10 relative aspect-video bg-navy/5 flex items-center justify-center">
                      <Image
                        src={`https://img.youtube.com/vi/${getYouTubeVideoId(unreleasedForm.videoUrl)}/hqdefault.jpg`}
                        alt="YouTube Thumbnail Preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy/70 ml-1">공연 날짜</label>
                  <input value={unreleasedForm.date} onChange={e => setUnreleasedForm({...unreleasedForm, date: e.target.value})} type="date" className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none font-sans text-sm text-navy" />
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex items-start gap-2 bg-navy/5 p-3 rounded-xl">
                    <Info size={16} className="text-navy/60 shrink-0 mt-0.5" />
                    <p className="font-sans text-[11px] leading-relaxed text-charcoal/70">
                      공연 영상 등록 시 유튜브 썸네일이 고유 앨범 아트로 자동 적용됩니다.<br/>
                      공식 승인 전이라도 <span className="font-bold text-point">월드컵 대진에 즉시 포함</span>할 수 있습니다.
                    </p>
                  </div>
                </div>
                <button type="submit" className="mt-2 w-full py-3.5 bg-navy text-cream font-sans font-medium rounded-xl shadow-md hover:bg-navy/90 active:scale-[0.98] transition-all">
                  추가하기
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <div className="fixed top-20 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
            <motion.div
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
              className="bg-navy text-cream px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 max-w-md w-full pointer-events-auto border border-white/10"
            >
              <Check size={18} className="text-point shrink-0" strokeWidth={3} />
              <p className="font-sans text-sm leading-snug">{notification}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* 2-Step Exit Wizard Modal */}
      <AnimatePresence>
        {exitWizardStep !== null && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExitWizardStep(null)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-[340px] rounded-[2.5rem] border-[4px] border-navy p-7 shadow-[0_20px_50px_rgba(26,42,108,0.3)] relative pointer-events-auto flex flex-col items-center text-center overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                layout
              >
                {/* Decorative LP Record Graphic */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                  className="w-16 h-16 bg-navy rounded-full flex items-center justify-center mb-5 shadow-lg border-2 border-point relative shrink-0"
                >
                  <Disc className="text-cream" size={32} />
                  <div className="absolute w-4 h-4 bg-cream rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-navy" />
                </motion.div>

                {exitWizardStep === 'main' ? (
                  <>
                    <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">테스트를 이동할까요?</h2>
                    <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                      이전 단계로 돌아가 아티스트를 다시 선택하거나, 지금 테스트를 종료하고 나갈 수 있습니다.
                    </p>
                    
                    <div className="flex flex-col gap-2.5 w-full">
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleReturnToArtists}
                        className="w-full py-3.5 bg-navy text-cream font-bold rounded-2xl hover:bg-navy/90 transition-all shadow-md text-sm cursor-pointer"
                      >
                        아티스트 다시 고르기
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setExitWizardStep('exit_confirm')}
                        className="w-full py-3.5 bg-white border-2 border-navy/15 text-navy font-bold rounded-2xl hover:bg-navy/5 transition-all text-sm cursor-pointer"
                      >
                        테스트 종료하고 나가기
                      </motion.button>
                      
                      <button 
                        onClick={() => setExitWizardStep(null)}
                        className="text-xs text-charcoal/50 hover:text-navy transition-colors font-medium mt-2.5 cursor-pointer hover:underline"
                      >
                        이대로 계속하기 (취소)
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">진행 내역을 보관할까요?</h2>
                    <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                      선택한 수록곡 목록이 있습니다. 진행 내역을 보관하고 나갈까요?<br/>
                      <span className="text-point font-medium">(보관한 내역은 프로필의 내 아카이브에서 이어할 수 있습니다.)</span>
                    </p>
                    
                    <div className="flex flex-col gap-2.5 w-full">
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleConfirmSaveExit}
                        className="w-full py-3.5 bg-navy text-cream font-bold rounded-2xl hover:bg-navy/90 transition-all shadow-md text-sm cursor-pointer"
                      >
                        보관하고 종료하기
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleDiscardExit}
                        className="w-full py-3.5 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50/50 font-bold rounded-2xl transition-all text-sm cursor-pointer"
                      >
                        보관 안 함 (진행 삭제)
                      </motion.button>
                      
                      <button 
                        onClick={() => setExitWizardStep('main')}
                        className="text-xs text-charcoal/50 hover:text-navy transition-colors font-medium mt-2.5 cursor-pointer hover:underline"
                      >
                        이전 선택지로 돌아가기
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {customAlert && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCustomAlert(null)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-[320px] rounded-[2.5rem] border-[4px] border-navy p-7 shadow-[0_20px_50px_rgba(26,42,108,0.3)] relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
              >
                {/* Warning Icon Graphic */}
                <div className="w-16 h-16 bg-point/10 rounded-full flex items-center justify-center mb-4 border-2 border-point shrink-0">
                  <AlertCircle className="text-point animate-pulse" size={32} />
                </div>

                <h3 className="font-serif text-xl font-bold text-navy mb-2 tracking-tight">앗, 확인해 주세요!</h3>
                <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  {customAlert}
                </p>
                
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCustomAlert(null)}
                  className="w-full py-3.5 bg-navy text-cream font-bold rounded-2xl hover:bg-navy/90 transition-all shadow-md text-sm cursor-pointer"
                >
                  확인
                </motion.button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
