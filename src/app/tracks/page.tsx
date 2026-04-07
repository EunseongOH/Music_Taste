"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Compass, Disc } from "lucide-react";
import Image from "next/image";

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

const ARTIST_DATA: ArtistGroup[] = [
  {
    id: "a1", name: "The Beatles", image: "https://picsum.photos/seed/a1/300/300",
    albums: [
      { id: "al1_1", title: "Abbey Road", type: "Album", year: "1969", image: "https://picsum.photos/seed/al1_1/300/300", tracks: generateTracks("al1_1", 17) },
      { id: "al1_2", title: "Let It Be", type: "Album", year: "1970", image: "https://picsum.photos/seed/al1_2/300/300", tracks: generateTracks("al1_2", 12) },
      { id: "al1_3", title: "Hey Jude", type: "Single", year: "1968", image: "https://picsum.photos/seed/al1_3/300/300", tracks: generateTracks("al1_3", 2) },
    ]
  },
  {
    id: "a2", name: "Daft Punk", image: "https://picsum.photos/seed/a2/300/300",
    albums: [
      { id: "al2_1", title: "Discovery", type: "Album", year: "2001", image: "https://picsum.photos/seed/al2_1/300/300", tracks: generateTracks("al2_1", 14) },
      { id: "al2_2", title: "Random Access Memories", type: "Album", year: "2013", image: "https://picsum.photos/seed/al2_2/300/300", tracks: generateTracks("al2_2", 13) },
    ]
  },
  {
    id: "a3", name: "Radiohead", image: "https://picsum.photos/seed/a3/300/300",
    albums: [
      { id: "al3_1", title: "OK Computer", type: "Album", year: "1997", image: "https://picsum.photos/seed/al3_1/300/300", tracks: generateTracks("al3_1", 12) },
      { id: "al3_2", title: "In Rainbows", type: "Album", year: "2007", image: "https://picsum.photos/seed/al3_2/300/300", tracks: generateTracks("al3_2", 10) },
    ]
  }
];

export default function TracksPage() {
  const [activeTab, setActiveTab] = useState<string>(ARTIST_DATA[0].id);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Scroll spy interaction
  const scrollToArtist = (artistId: string) => {
    setActiveTab(artistId);
    const element = document.getElementById(`artist-section-${artistId}`);
    if (element) {
      // Offset for sticky header (h-approx 140px)
      const top = element.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const toggleTrack = (trackId: string) => {
    const newSelected = new Set(selectedTrackIds);
    if (newSelected.has(trackId)) newSelected.delete(trackId);
    else newSelected.add(trackId);
    setSelectedTrackIds(newSelected);
  };

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-10 overflow-hidden bg-[var(--app-bg)]">
      {/* Sticky Header with Toggles & Tabs */}
      <div className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md pt-6 pb-2 px-6 border-b border-navy/10 flex flex-col gap-4 mx-[-1.5rem] w-[calc(100%+3rem)] shadow-sm">
        <h1 className="font-serif text-2xl text-navy px-6 tracking-tight">트랙 디깅하기</h1>
        
        <p className="font-sans text-sm text-charcoal/80 px-6">
          앨범 커버를 탭해서 수록곡을 파헤쳐보세요
        </p>

        {/* Horizontal Artist Scroll */}
        <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-none px-6">
          {ARTIST_DATA.map(artist => (
            <button
              key={artist.id}
              onClick={() => scrollToArtist(artist.id)}
              className={`flex-shrink-0 flex items-center gap-2 h-10 px-1.5 pr-4 rounded-full border-2 transition-all font-sans text-sm font-medium ${activeTab === artist.id ? "border-point text-point bg-point/5 shadow-sm" : "border-navy/20 text-charcoal/80 hover:border-navy/50"}`}
            >
              <div className="relative w-7 h-7 rounded-full overflow-hidden border border-navy/10">
                <Image src={artist.image} alt={artist.name} fill sizes="28px" className="object-cover" />
              </div>
              {artist.name}
            </button>
          ))}
        </div>
      </div>

      {/* Artists & Albums Content */}
      <div className="py-6 pb-32 flex flex-col gap-14">
        {ARTIST_DATA.map(artist => (
          <section id={`artist-section-${artist.id}`} key={artist.id} className="scroll-m-40">
             {/* Artist Header */}
             <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-sm">
                   <Image src={artist.image} alt={artist.name} fill sizes="48px" className="object-cover" />
                </div>
                <div>
                   <h2 className="font-serif text-2xl text-navy">{artist.name}</h2>
                   <p className="font-sans text-xs text-charcoal/60">{artist.albums.length} Releases</p>
                </div>
             </div>

             {/* Artist Albums Grid */}
             <div className="grid grid-cols-2 gap-4">
                {artist.albums.map(album => {
                   const isExpanded = expandedAlbumId === album.id;
                   
                   return (
                     <motion.div
                       layout
                       key={album.id}
                       className={`flex flex-col relative transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isExpanded ? "col-span-2 bg-[#F1EADC] shadow-[0_4px_20px_rgba(26,42,108,0.08)] rounded-[2rem] p-4 border border-navy/5" : "col-span-1"}`}
                       onClick={() => {
                           if (!isExpanded) setExpandedAlbumId(album.id);
                       }}
                     >
                        {/* Cover & Info Row */}
                        <motion.div layout className={`flex ${isExpanded ? "flex-row gap-4 items-center mb-5" : "flex-col gap-2"}`}>
                           <motion.div 
                             layout
                             className={`relative aspect-square shrink-0 overflow-hidden ${isExpanded ? "w-20 shadow-md cursor-default pointer-events-none" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer group hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}
                             // Forcing exact border radius transition via style to override tailwind during Framer motion transition.
                             style={{ borderRadius: isExpanded ? '1rem' : '2rem' }}
                           >
                             <Image src={album.image} alt={album.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                             
                             {!isExpanded && (
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                             )}
                           </motion.div>
                           
                           <motion.div layout className={`flex flex-col justify-center ${isExpanded ? "flex-1" : "px-2 mt-1"}`}>
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
                               initial={{ opacity: 0, height: 0 }}
                               animate={{ opacity: 1, height: 'auto' }}
                               exit={{ opacity: 0, height: 0 }}
                               className="flex flex-col gap-1 overflow-hidden"
                             >
                                <div className="w-full h-px bg-navy/10 mb-2" />
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
          </section>
        ))}
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
