"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Compass, Disc, Search, Plus, X, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { getArtistAlbums, getAlbumTracks } from "@/utils/spotify";
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
  albumsLoaded?: boolean;
  totalReleases?: number;
}

const generateTracks = (albumId: string, count: number): Track[] =>
  Array.from({ length: count }).map((_, i) => ({
    id: `t_${albumId}_${i+1}`,
    title: `Track ${i+1}`,
    duration: `0${Math.floor(Math.random()*4)+2}:${String(Math.floor(Math.random()*60)).padStart(2, '0')}`
  }));

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalArtistId, setModalArtistId] = useState<string | null>(null);
  const [unreleasedForm, setUnreleasedForm] = useState({ title: '', videoUrl: '', date: '' });
  const [notification, setNotification] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchSpotifyData = async () => {
      let stored = sessionStorage.getItem('selectedArtists') || localStorage.getItem('selectedArtists');

      // Fallback to user_metadata from Supabase if not in storage but user is logged in
      if (!stored && user?.user_metadata?.selected_artists) {
        const artistsData = user.user_metadata.selected_artists;
        stored = JSON.stringify(artistsData);
        // Hydrate local storages
        sessionStorage.setItem('selectedArtists', stored);
        localStorage.setItem('selectedArtists', stored);
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
            albums: [], // Deferred loading
            albumsLoaded: false,
            totalReleases: 0
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

  const toggleArtistAccordion = async (artistId: string) => {
    if (expandedArtistId === artistId) {
      setExpandedArtistId(null);
    } else {
      setExpandedArtistId(artistId);

      // Lazy load albums for this artist
      const artist = artistData.find(a => a.id === artistId);
      if (artist && !artist.albumsLoaded) {
        setLoadingAlbums(prev => new Set(prev).add(`artist_${artistId}`));
        try {
          const albumsData = await getArtistAlbums(artistId);
          const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
            id: albumRaw.id,
            title: albumRaw.name,
            type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
            year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
            image: albumRaw.images?.[0]?.url || "https://picsum.photos/seed/default/300/300",
            tracks: [], // Lazy loaded later
            totalTracks: albumRaw.total_tracks || 0
          }));
          setArtistData(prev => prev.map(a => a.id === artistId ? { ...a, albums: mappedAlbums, albumsLoaded: true, totalReleases: albumsData.total } : a));
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
    // Only one artist open at a time is usually cleaner for UX.
    setExpandedAlbumId(null); // Reset album expansion when switching artists
  };

  const handleAlbumClick = async (albumId: string, artistId: string) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null);
      return;
    }
    setExpandedAlbumId(albumId);

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

  const toggleTrack = (trackId: string) => {
    const newSelected = new Set(selectedTrackIds);
    if (newSelected.has(trackId)) newSelected.delete(trackId);
    else newSelected.add(trackId);
    setSelectedTrackIds(newSelected);
  };

  const handleAddUnreleased = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unreleasedForm.title.trim() || !modalArtistId) return;

    const newTrackId = `t_unreleased_${Date.now()}`;
    const defaultCover = "https://picsum.photos/seed/default_record/300/300";

    setArtistData(prev => prev.map(artist => {
      if (artist.id === modalArtistId) {
        const newTrack: Track = { id: newTrackId, title: unreleasedForm.title, duration: "Live" };
        const unreleasedAlbumIndex = artist.albums.findIndex(a => a.title === "미발매곡");

        if (unreleasedAlbumIndex >= 0) {
          const updatedAlbums = [...artist.albums];
          updatedAlbums[unreleasedAlbumIndex] = {
            ...updatedAlbums[unreleasedAlbumIndex],
            tracks: [...updatedAlbums[unreleasedAlbumIndex].tracks, newTrack]
          };
          return { ...artist, albums: updatedAlbums };
        } else {
          const newAlbum: Album = {
            id: `al_unreleased_${Date.now()}`,
            title: "미발매곡",
            type: "Single",
            year: new Date().getFullYear().toString(),
            image: defaultCover,
            tracks: [newTrack]
          };
          return { ...artist, albums: [...artist.albums, newAlbum] };
        }
      }
      return artist;
    }));

    const newSelected = new Set(selectedTrackIds);
    newSelected.add(newTrackId);
    setSelectedTrackIds(newSelected);

    setIsModalOpen(false);
    setUnreleasedForm({ title: '', videoUrl: '', date: '' });

    setNotification("미발매곡 등록이 요청되었습니다. 공식 곡 승인 전이라도 월드컵에서 즉시 사용 가능합니다!");
    setTimeout(() => setNotification(null), 5000);
  };

  const handleStartWorldCup = async () => {
    // Gather full details for selected tracks
    const selectedTracksData: any[] = [];
    artistData.forEach(artist => {
      artist.albums.forEach(album => {
        album.tracks.forEach(track => {
          if (selectedTrackIds.has(track.id)) {
            selectedTracksData.push({
              ...track,
              artistName: artist.name,
              albumTitle: album.title,
              albumImage: album.image,
            });
          }
        });
      });
    });

    const tracksStr = JSON.stringify(selectedTracksData);
    sessionStorage.setItem("worldcup_tracks", tracksStr);
    localStorage.setItem("worldcup_tracks", tracksStr);

    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_progress");

    if (user) {
      try {
        await supabase.auth.updateUser({
          data: {
            worldcup_progress: null
          }
        });
      } catch (err) {
        console.error("Error clearing Supabase progress:", err);
      }
    }

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
            <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
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
            placeholder="트랙, 아티스트 검색..."
            className="w-full py-2.5 pl-11 pr-4 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
        </div>

        {/* Sorting Tags */}
        <div className="flex overflow-x-auto gap-2 scrollbar-none pb-2 px-6">
          {["추천순", "가나다순", "선택순"].map((sort) => (
            <button
              key={sort}
              onClick={() => {}} // implement sorting logic if needed
              className={`flex-shrink-0 px-4 py-1.5 rounded-full border-2 transition-all font-sans text-xs font-bold border-navy/10 text-charcoal/70 hover:border-navy/30 hover:bg-navy/5`}
            >
              {sort}
            </button>
          ))}
        </div>
      </div>

      {/* Artists Content */}
      <div className="py-6 pb-32 flex flex-col gap-4 px-3">
        {artistData.map(artist => {
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
                       <Image src={artist.image} alt={artist.name} fill sizes="56px" className="object-cover" />
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
                     <div className="mt-5 mb-2 h-px bg-navy/5 w-full hidden hidden-but-spacer-if-needed" />
                     {loadingAlbums.has(`artist_${artist.id}`) ? (
                        <div className="py-10 flex flex-col items-center justify-center text-navy/50 gap-3">
                           <Disc className="animate-spin text-point/70" size={28} />
                           <p className="font-sans text-sm">스포티파이에서 앨범을 불러오고 있어요...</p>
                        </div>
                     ) : (
                       <div className="grid grid-cols-2 gap-4 mt-6">
                          {artist.albums.map(album => {
                           const isExpanded = expandedAlbumId === album.id;

                           // Global transition for the elegant record-pulling feel
                           const smoothTransition = { type: "tween" as const, ease: "circOut" as const, duration: 0.45 };

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
                                           animate={{ x: '45%', opacity: 1, rotate: 0 }}
                                           exit={{ x: 0, opacity: 0, rotate: -45 }}
                                           transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                           className="absolute top-0 bottom-0 my-auto w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-[#111] shadow-[0_4px_15px_rgba(0,0,0,0.4)] z-0 flex items-center justify-center pointer-events-none"
                                           style={{
                                             background: 'radial-gradient(circle, #222 0%, #0a0a0a 100%)',
                                             boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.3)'
                                           }}
                                         >
                                            {/* Grooves */}
                                            <div className="absolute inset-[6px] border border-white/5 rounded-full" />
                                            <div className="absolute inset-[14px] border border-white/5 rounded-full" />
                                            <div className="absolute inset-[24px] border border-white/5 rounded-full" />
                                            <div className="absolute inset-[36px] border border-white/5 rounded-full" />
                                            {/* LP Label (Inner circle) */}
                                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full relative overflow-hidden border-2 border-[#111]">
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
                                       className={`relative aspect-square shrink-0 overflow-hidden z-10 ${isExpanded ? "w-32 sm:w-36 shadow-xl cursor-pointer" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer group hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}
                                       style={{ borderRadius: isExpanded ? '0.2rem' : '2rem' }}
                                     >
                                       <Image src={album.image} alt={album.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                       {!isExpanded && (
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                                       )}
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
                                                onClick={(e) => { e.stopPropagation(); toggleTrack(track.id); }}
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
                     )}
                     <button
                       onClick={(e) => { e.stopPropagation(); setModalArtistId(artist.id); setIsModalOpen(true); }}
                       className="w-full mt-4 py-3 rounded-2xl border border-dashed border-navy/30 text-navy/70 font-sans text-sm font-medium flex items-center justify-center gap-2 hover:bg-navy/5 hover:text-navy transition-colors"
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
                      커버 이미지를 첨부하지 않으면 기본 이미지가 적용됩니다.<br/>
                      공식 곡 승인 전이라도 <span className="font-bold text-point">월드컵에서 즉시 사용</span>할 수 있습니다.
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
    </main>
  );
}
