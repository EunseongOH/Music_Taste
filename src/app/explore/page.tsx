"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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
    // Prevent clicking on similar artists
    if (artist.type === "similar") return;

    if (selectedIds.has(artist.id)) {
      // Collapse / Deselect
      const newSelected = new Set(selectedIds);
      newSelected.delete(artist.id);
      setSelectedIds(newSelected);
      // Remove the generated similar items for this artist
      setArtists(prev => prev.filter(a => a.parentId !== artist.id));
    } else {
      // Expand / Select
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

  return (
    <main className="flex flex-col min-h-screen py-6 relative z-10 w-full mb-20">
      <div className="mb-8 mt-4 text-center">
        <h1 className="font-serif text-3xl text-navy mb-2 break-keep tracking-tight">어떤 아티스트를<br/>좋아하시나요?</h1>
        <p className="font-sans text-charcoal/70 text-sm mt-3">최소 3명의 아티스트를 선택해주세요.</p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-10 w-full">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="text-navy/50" size={20} strokeWidth={1.5} />
        </div>
        <input 
          type="text" 
          placeholder="아티스트 검색..." 
          className="w-full py-3 pl-12 pr-4 bg-transparent border-2 border-navy rounded-full focus:outline-none focus:ring-0 focus:border-point font-sans text-navy placeholder:text-navy/40 transition-colors bg-cream/30"
        />
      </div>

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-3 gap-x-3 gap-y-8"
      >
        <AnimatePresence>
          {artists.map((artist) => {
            const isSimilar = artist.type === "similar";
            const isSelected = selectedIds.has(artist.id);
            // Highlight parent if it is specifically selected
            const highlightActive = isSimilar ? false : isSelected;
            
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
                  className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 transition-all duration-300 ${isSimilar ? 'border-point border-dashed bg-point/5 scale-90' : highlightActive ? 'border-point shadow-[0_0_15px_rgba(230,126,34,0.3)]' : 'border-navy/20 group-hover:border-navy/60 group-hover:shadow-md'}`}
                >
                  <div className={`relative w-full h-full rounded-full overflow-hidden ${highlightActive ? 'p-1' : ''}`}>
                    <div className="relative w-full h-full rounded-full overflow-hidden">
                      <Image 
                        src={artist.image} 
                        alt={artist.name} 
                        fill 
                        sizes="112px"
                        className={`object-cover ${isSimilar ? 'opacity-80 mix-blend-multiply filter sepia-[0.4]' : ''} transition-all duration-300`} 
                      />
                    </div>
                  </div>
                  {highlightActive && (
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
                  className={`font-sans text-xs sm:text-sm text-center line-clamp-1 w-full px-1 ${isSimilar ? 'text-point font-medium' : highlightActive ? 'text-navy font-bold' : 'text-charcoal'}`}
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
            <Link href="/tracks" className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-2xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors">
              다음으로 넘어가기
              <span className="bg-point text-white text-xs px-2 py-1 rounded-full">{selectedIds.size}</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="h-32" /> {/* Bottom padding */}
    </main>
  );
}
