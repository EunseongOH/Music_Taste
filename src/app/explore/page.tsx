"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";

interface Artist {
  id: string;
  name: string;
  image: string;
  type: "main" | "similar";
  parentId?: string;
}

// Dummy data padded to 30 items for infinite scrolling feel
const BASE_NAMES = ["The Beatles", "Daft Punk", "Radiohead", "Kendrick Lamar", "Tame Impala", "Frank Ocean", "Arctic Monkeys", "Gorillaz", "The Strokes", "Mac Miller"];
const MAIN_ARTISTS: Artist[] = Array.from({ length: 30 }).map((_, i) => ({
  id: `a${i + 1}`,
  name: BASE_NAMES[i % BASE_NAMES.length] + (i >= BASE_NAMES.length ? ` ${Math.floor(i / BASE_NAMES.length) + 1}` : ""),
  image: `https://picsum.photos/seed/art${i + 1}/300/300`,
  type: "main",
}));

export default function ExplorePage() {
  const [artists, setArtists] = useState<Artist[]>(MAIN_ARTISTS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleArtistClick = (artist: Artist) => {
    // If it's a similar artist, just toggle selection without spawning more
    if (artist.type === "similar") {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(artist.id)) newSelected.delete(artist.id);
      else newSelected.add(artist.id);
      setSelectedIds(newSelected);
      return;
    }

    if (selectedIds.has(artist.id)) {
      // Collapse / Deselect for main artists
      const newSelected = new Set(selectedIds);
      newSelected.delete(artist.id);
      setSelectedIds(newSelected);
      // Remove the generated similar items for this artist
      setArtists(prev => prev.filter(a => a.parentId !== artist.id));
    } else {
      // Expand / Select for main artists
      const newSelected = new Set(selectedIds);
      newSelected.add(artist.id);
      setSelectedIds(newSelected);

      setArtists(prev => {
        const index = prev.findIndex(a => a.id === artist.id);
        if (index === -1) return prev;
        
        const similar: Artist[] = [1, 2, 3].map(n => ({
          id: `s-${artist.id}-${n}`,
          name: `추천 ${n}`,
          image: `https://picsum.photos/seed/sim-${artist.id}-${n}/300/300`,
          type: "similar" as const,
          parentId: artist.id
        }));

        return [
          ...prev.slice(0, index + 1),
          ...similar,
          ...prev.slice(index + 1)
        ];
      });
    }
  };

  const [sortOrder, setSortOrder] = useState<"추천순" | "가나다순" | "선택순">("추천순");

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-20 bg-[var(--app-bg)]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-[#F5F2ED]/95 backdrop-blur-md pt-6 pb-3 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-9 h-9 shadow-none m-0 p-0 relative top-auto left-auto md:top-auto md:left-auto right-auto font-bold" />
          <ProfileHeader className="!relative !top-auto !right-auto !md:top-auto !md:right-auto" />
        </div>

        <div className="text-left mt-1 mb-2 px-1">
          <h1 className="font-serif text-[1.4rem] text-navy tracking-tight leading-snug font-bold">어떤 아티스트를 좋아하시나요?</h1>
          <p className="font-sans text-charcoal/90 font-medium text-sm mt-1">최소 3명의 아티스트를 선택해주세요.</p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="text-navy/50" size={18} strokeWidth={2} />
          </div>
          <input 
            type="text" 
            placeholder="아티스트 검색..." 
            className="w-full py-2.5 pl-11 pr-4 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
        </div>

        {/* Sorting Tags */}
        <div className="flex overflow-x-auto gap-2 scrollbar-none py-1 mt-1 px-1">
          {["추천순", "가나다순", "선택순"].map((sort) => (
            <button
              key={sort}
              onClick={() => setSortOrder(sort as any)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full border-2 transition-all font-sans text-[0.8rem] font-bold ${sortOrder === sort ? 'border-point text-point bg-point/5 shadow-sm' : 'border-navy/10 text-charcoal/70 hover:border-navy/30 hover:bg-navy/5'}`}
            >
              {sort}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-3 gap-x-3 gap-y-8 mt-6 px-1"
      >
        <AnimatePresence>
          {artists.map((artist) => {
            const isSimilar = artist.type === "similar";
            const isSelected = selectedIds.has(artist.id);
            
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4, type: "spring", bounce: 0.25 }}
                key={artist.id}
                onClick={() => handleArtistClick(artist)}
                className={`flex flex-col items-center gap-3 cursor-pointer group select-none`}
              >
                <motion.div 
                  layout="position"
                  className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 transition-all duration-300 ${isSimilar && !isSelected ? 'border-point border-dashed bg-point/5 scale-90' : isSimilar && isSelected ? 'border-point border-solid bg-point/10 scale-90 shadow-[0_0_15px_rgba(230,126,34,0.4)]' : isSelected ? 'border-point shadow-[0_0_15px_rgba(230,126,34,0.3)]' : 'border-navy/20 group-hover:border-navy/60 group-hover:shadow-md'}`}
                >
                  <div className={`relative w-full h-full rounded-full overflow-hidden ${isSelected ? 'p-1 bg-cream/50' : ''}`}>
                    <div className="relative w-full h-full rounded-full overflow-hidden">
                      <Image 
                        src={artist.image} 
                        alt={artist.name} 
                        fill 
                        sizes="112px"
                        className={`object-cover ${isSimilar ? 'opacity-80 mix-blend-multiply filter sepia-[0.4]' : ''} transition-all duration-300 ${isSelected && isSimilar ? 'filter-none mix-blend-normal opacity-100' : ''}`} 
                      />
                    </div>
                  </div>
                  {isSelected && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-navy/20 flex items-center justify-center rounded-full pointer-events-none"
                    >
                      <div className="w-5 h-5 bg-point rounded-full border-2 border-cream shadow-sm" />
                    </motion.div>
                  )}
                </motion.div>
                <motion.span 
                  layout="position"
                  className={`font-sans text-xs sm:text-sm text-center line-clamp-1 w-full px-1 ${isSimilar && !isSelected ? 'text-point font-medium' : isSelected ? 'text-navy font-bold' : 'text-charcoal'}`}
                >
                  {artist.name}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
      
      {/* Floating Action Button */}
      <AnimatePresence>
        {selectedIds.size >= 3 && (
          <motion.div 
            initial={{ y: 100, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 100, opacity: 0, x: "-50%" }}
            className="fixed bottom-8 left-1/2 z-50 w-[90%] max-w-[380px]"
          >
            <button 
              onClick={() => {
                const selectedData = artists.filter(a => selectedIds.has(a.id));
                sessionStorage.setItem('selectedArtists', JSON.stringify(selectedData));
                window.location.href = '/tracks';
              }}
              className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-2xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors cursor-pointer"
            >
              다음으로 넘어가기
              <span className="bg-point text-white text-xs px-2 py-1 rounded-full">{selectedIds.size}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="h-32" /> {/* Bottom padding */}
    </main>
  );
}
