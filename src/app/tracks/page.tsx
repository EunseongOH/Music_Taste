"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Compass, Plus } from "lucide-react";
import Image from "next/image";

// Dummy Artists from previous phase
const SELECTED_ARTISTS = [
  { id: "a1", name: "The Beatles", image: "https://picsum.photos/seed/a1/300/300" },
  { id: "a2", name: "Daft Punk", image: "https://picsum.photos/seed/a2/300/300" },
  { id: "a3", name: "Radiohead", image: "https://picsum.photos/seed/a3/300/300" },
];

// Dummy Tracks
const generateTracks = (artistId: string, artistName: string) => {
  return Array.from({ length: 12 }).map((_, i) => ({
    id: `t_${artistId}_${i}`,
    artistId,
    artistName,
    title: `${artistName} Hit Song ${i + 1}`,
    image: `https://picsum.photos/seed/album_${artistId}_${i}/300/300`,
  }));
};

const ALL_TRACKS = [
  ...generateTracks("a1", "The Beatles"),
  ...generateTracks("a2", "Daft Punk"),
  ...generateTracks("a3", "Radiohead"),
];

export default function TracksPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"popular" | "album">("popular");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  const displayedTracks = activeTab === "all" 
    ? ALL_TRACKS 
    : ALL_TRACKS.filter(t => t.artistId === activeTab);

  const toggleTrack = (id: string) => {
    const newSelected = new Set(selectedTrackIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedTrackIds(newSelected);
  };

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-10 overflow-hidden">
      {/* Sticky Header with Toggles & Tabs */}
      <div className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md pt-6 pb-2 px-6 border-b border-navy/10 flex flex-col gap-4 mx-[-1.5rem] w-[calc(100%+3rem)]">
        <h1 className="font-serif text-2xl text-navy px-6 tracking-tight">월드컵 후보곡 선택</h1>
        
        {/* Sorting controls */}
        <div className="flex items-center justify-between px-6">
          <p className="font-sans text-sm text-charcoal/80">
            취향에 맞는 곡을 골라보세요
          </p>
          <div className="flex items-center bg-navy/5 rounded-full p-1 text-xs font-semibold">
            <button 
              onClick={() => setSortOrder("popular")}
              className={`px-3 py-1.5 rounded-full transition-all ${sortOrder === "popular" ? "bg-navy text-cream shadow-sm" : "text-navy/60 hover:text-navy"}`}
            >
              인기순
            </button>
            <button 
              onClick={() => setSortOrder("album")}
              className={`px-3 py-1.5 rounded-full transition-all ${sortOrder === "album" ? "bg-navy text-cream shadow-sm" : "text-navy/60 hover:text-navy"}`}
            >
              앨범순
            </button>
          </div>
        </div>

        {/* Horizontal Artist Scroll */}
        <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-none px-6">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-shrink-0 flex items-center justify-center h-10 px-4 rounded-full border-2 transition-all font-sans text-sm font-medium ${activeTab === "all" ? "border-point text-point bg-point/5 shadow-sm" : "border-navy/20 text-charcoal/80 hover:border-navy/50"}`}
          >
            전체 보기
          </button>
          {SELECTED_ARTISTS.map(artist => (
            <button
              key={artist.id}
              onClick={() => setActiveTab(artist.id)}
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

      {/* Grid Content */}
      <div className="py-6 pb-32 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
        <AnimatePresence>
          {displayedTracks.map(track => {
            const isSelected = selectedTrackIds.has(track.id);
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                key={track.id}
                onClick={() => toggleTrack(track.id)}
                className="flex flex-col gap-2 cursor-pointer group"
              >
                <div className={`relative w-full aspect-square rounded-[2rem] overflow-hidden transition-all duration-300 ${isSelected ? "border-[3px] border-point shadow-[0_8px_20px_rgba(230,126,34,0.25)] scale-[0.96]" : "shadow-[0_4px_12px_rgba(0,0,0,0.08)] group-hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"}`}>
                  <Image src={track.image} alt={track.title} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
                  
                  {/* Selection Overlay */}
                  <div className={`absolute inset-0 transition-all duration-300 ${isSelected ? "bg-point/10" : "bg-black/0 group-hover:bg-black/5"}`} />
                  
                  {/* Checkmark */}
                  {isSelected && (
                    <motion.div 
                      className="absolute top-3 right-3 w-7 h-7 bg-point rounded-full flex items-center justify-center text-white border-[2px] border-cream shadow-sm"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <Check size={16} strokeWidth={3} />
                    </motion.div>
                  )}
                </div>
                
                <div className="px-2 mt-1">
                  <p className={`font-sans font-bold text-sm line-clamp-1 transition-colors ${isSelected? 'text-point' : 'text-navy'} `}>{track.title}</p>
                  <p className="font-sans text-xs text-charcoal/60 line-clamp-1">{track.artistName}</p>
                </div>
              </motion.div>
            );
          })}
          
          {/* Custom Track Add Button */}
          <motion.div layout className="flex flex-col gap-2">
             <button className="w-full aspect-square rounded-[2rem] border-2 border-dashed border-navy/30 bg-navy/5 flex flex-col items-center justify-center gap-3 hover:bg-navy/10 hover:border-navy/50 transition-colors text-navy/70 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-cream border-2 border-navy flex items-center justify-center text-navy shadow-sm">
                  <Plus size={24} />
                </div>
                <span className="font-sans text-sm font-semibold">직접 추가하기</span>
             </button>
             <div className="px-1 invisible"><p className="text-sm">placeholder</p></div>
          </motion.div>
        </AnimatePresence>
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
                 className="mx-auto w-max px-6 py-3 rounded-full bg-cream/90 backdrop-blur-md text-navy font-sans font-bold text-sm shadow-[0_4px_15px_rgba(0,0,0,0.1)] border-2 border-navy/20 flex items-center justify-center"
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
