"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Compass, Disc, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";

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
}

interface ArtistGroup {
  id: string;
  name: string;
  image: string;
  albums: Album[];
}

const generateTracks = (albumId: string, count: number): Track[] => 
  Array.from({ length: count }).map((_, i) => ({
    id: `t_${albumId}_${i+1}`,
    title: `Track ${i+1}`,
    duration: `0${Math.floor(Math.random()*4)+2}:${String(Math.floor(Math.random()*60)).padStart(2, '0')}`
  }));

const FALLBACK_ARTISTS: ArtistGroup[] = [
  {
    id: "a1", name: "The Beatles", image: "https://picsum.photos/seed/a1/300/300",
    albums: [
      { id: "al1_1", title: "Abbey Road", type: "Album", year: "1969", image: "https://picsum.photos/seed/al1_1/300/300", tracks: generateTracks("al1_1", 17) },
      { id: "al1_2", title: "Let It Be", type: "Album", year: "1970", image: "https://picsum.photos/seed/al1_2/300/300", tracks: generateTracks("al1_2", 12) },
    ]
  }
];

export default function TracksPage() {
  const router = useRouter();
  const [artistData, setArtistData] = useState<ArtistGroup[]>(FALLBACK_ARTISTS);
  const [expandedArtistId, setExpandedArtistId] = useState<string | null>(FALLBACK_ARTISTS[0].id);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  React.useEffect(() => {
    const stored = sessionStorage.getItem('selectedArtists');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) {
          const dynamicData = parsed.map((a: any) => ({
            id: a.id,
            name: a.name,
            image: a.image,
            albums: [
              { id: `al_${a.id}_1`, title: `${a.name} Greatest Hits`, type: "Album", year: "2024", image: `https://picsum.photos/seed/${a.id}_c1/300/300`, tracks: generateTracks(`al_${a.id}_1`, 12) },
              { id: `al_${a.id}_2`, title: `Essential EP`, type: "EP", year: "2022", image: `https://picsum.photos/seed/${a.id}_c2/300/300`, tracks: generateTracks(`al_${a.id}_2`, 6) },
            ]
          }));
          setArtistData(dynamicData);
          setExpandedArtistId(dynamicData[0].id);
        }
      } catch (e) {
        console.error("Failed to parse stored artists");
      }
    }
    setIsLoaded(true);
  }, []);

  const toggleArtistAccordion = (artistId: string) => {
    if (expandedArtistId === artistId) {
      setExpandedArtistId(null);
    } else {
      setExpandedArtistId(artistId);
    }
    // Only one artist open at a time is usually cleaner for UX.
    setExpandedAlbumId(null); // Reset album expansion when switching artists
  };

  const toggleTrack = (trackId: string) => {
    const newSelected = new Set(selectedTrackIds);
    if (newSelected.has(trackId)) newSelected.delete(trackId);
    else newSelected.add(trackId);
    setSelectedTrackIds(newSelected);
  };

  const handleStartWorldCup = () => {
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

    sessionStorage.setItem("worldcup_tracks", JSON.stringify(selectedTracksData));
    sessionStorage.removeItem("worldcup_progress");
    router.push("/worldcup");
  };

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
                       <p className="font-sans text-xs text-charcoal/60 mt-0.5">{artist.albums.reduce((acc, a) => acc + a.tracks.length, 0)} Tracks • {artist.albums.length} Releases</p>
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
                                   if (!isExpanded) setExpandedAlbumId(album.id);
                               }}
                             >
                                {/* Cover & Info Row */}
                                <motion.div layout transition={smoothTransition} className={`flex ${isExpanded ? "flex-row gap-4 items-center mb-5 z-20 relative bg-[#F1EADC]" : "flex-col gap-2"}`}>
                                   <motion.div 
                                     layout
                                     transition={smoothTransition}
                                     className={`relative aspect-square shrink-0 overflow-hidden ${isExpanded ? "w-20 shadow-md cursor-default pointer-events-none" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer group hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}
                                     // Forcing exact border radius transition via style to override tailwind during Framer motion transition.
                                     style={{ borderRadius: isExpanded ? '1rem' : '2rem' }}
                                   >
                                     <Image src={album.image} alt={album.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                     
                                     {!isExpanded && (
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                                     )}
                                   </motion.div>
                                   
                                   <motion.div layout transition={smoothTransition} className={`flex flex-col justify-center ${isExpanded ? "flex-1" : "px-2 mt-1"}`}>
                                      <p className="font-sans font-bold text-sm text-navy line-clamp-1">{album.title}</p>
                                      <div className="flex items-center gap-1 font-sans text-xs text-charcoal/60 mt-0.5">
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
                                       className="flex flex-col gap-1 overflow-hidden relative pt-2 -mt-2 shadow-[inset_0_12px_12px_-12px_rgba(0,0,0,0.06)] rounded-b-[1.5rem]"
                                     >
                                        <div className="w-full h-px bg-navy/10 mb-2 mt-2" />
                                        {album.tracks.map((track, idx) => {
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
                           )
                        })}
                     </div>
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
    </main>
  );
}
