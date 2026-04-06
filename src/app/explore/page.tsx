"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import Image from "next/image";

// Dummy data
const INITIAL_ARTISTS = [
  { id: "a1", name: "The Beatles", image: "https://picsum.photos/seed/a1/300/300", type: "main" },
  { id: "a2", name: "Daft Punk", image: "https://picsum.photos/seed/a2/300/300", type: "main" },
  { id: "a3", name: "Radiohead", image: "https://picsum.photos/seed/a3/300/300", type: "main" },
  { id: "a4", name: "Kendrick Lamar", image: "https://picsum.photos/seed/a4/300/300", type: "main" },
  { id: "a5", name: "Tame Impala", image: "https://picsum.photos/seed/a5/300/300", type: "main" },
  { id: "a6", name: "Frank Ocean", image: "https://picsum.photos/seed/a6/300/300", type: "main" },
  { id: "a7", name: "Arctic Monkeys", image: "https://picsum.photos/seed/a7/300/300", type: "main" },
  { id: "a8", name: "Gorillaz", image: "https://picsum.photos/seed/a8/300/300", type: "main" },
  { id: "a9", name: "The Strokes", image: "https://picsum.photos/seed/a9/300/300", type: "main" },
];

const SIMILAR_DB: Record<string, any[]> = {
  a1: [
    { id: "s1-1", name: "The Rolling Stones", image: "https://picsum.photos/seed/s11/300/300", type: "similar" },
    { id: "s1-2", name: "The Kinks", image: "https://picsum.photos/seed/s12/300/300", type: "similar" },
    { id: "s1-3", name: "The Who", image: "https://picsum.photos/seed/s13/300/300", type: "similar" },
  ],
  a2: [
    { id: "s2-1", name: "Justice", image: "https://picsum.photos/seed/s21/300/300", type: "similar" },
    { id: "s2-2", name: "Kavinsky", image: "https://picsum.photos/seed/s22/300/300", type: "similar" },
    { id: "s2-3", name: "Air", image: "https://picsum.photos/seed/s23/300/300", type: "similar" },
  ],
};

const DUMMY_SIMILAR = [
    { id: "s-d1", name: "추천 아티스트 1", image: "https://picsum.photos/seed/sd1/300/300", type: "similar" },
    { id: "s-d2", name: "추천 아티스트 2", image: "https://picsum.photos/seed/sd2/300/300", type: "similar" },
    { id: "s-d3", name: "추천 아티스트 3", image: "https://picsum.photos/seed/sd3/300/300", type: "similar" },
];

export default function ExplorePage() {
  const [artists, setArtists] = useState(INITIAL_ARTISTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleArtistClick = (artist: any) => {
    // Prevent clicking on similar artists
    if (artist.type === "similar") return;

    if (expandedId === artist.id) {
      // Collapse
      setArtists(INITIAL_ARTISTS);
      setExpandedId(null);
    } else {
      // Expand
      const similar = SIMILAR_DB[artist.id] || DUMMY_SIMILAR.map(a => ({...a, id: `${artist.id}-${a.id}`}));
      const artistIndex = INITIAL_ARTISTS.findIndex(a => a.id === artist.id);
      
      const newArray = [
        ...INITIAL_ARTISTS.slice(0, artistIndex + 1),
        ...similar,
        ...INITIAL_ARTISTS.slice(artistIndex + 1)
      ];
      setArtists(newArray);
      setExpandedId(artist.id);
    }
  };

  return (
    <main className="flex flex-col min-h-screen p-6 md:p-12 relative z-10 max-w-5xl mx-auto w-full">
      <div className="mb-10 text-center md:text-left mt-8">
        <h1 className="font-serif text-3xl md:text-4xl text-navy mb-2">어떤 아티스트를 좋아하시나요?</h1>
        <p className="font-sans text-charcoal/70">선택한 아티스트와 비슷한 음악을 추천해드려요.</p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-12 max-w-2xl">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="text-navy/50" size={20} strokeWidth={1.5} />
        </div>
        <input 
          type="text" 
          placeholder="아티스트 검색..." 
          className="w-full py-4 pl-12 pr-4 bg-transparent border-2 border-navy rounded-full focus:outline-none focus:ring-0 focus:border-point font-sans text-navy placeholder:text-navy/40 transition-colors bg-cream/30"
        />
      </div>

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10"
      >
        <AnimatePresence>
          {artists.map((artist) => {
            const isSimilar = artist.type === "similar";
            const isSelected = expandedId === artist.id;
            
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4, type: "spring", bounce: 0.25 }}
                key={artist.id}
                onClick={() => handleArtistClick(artist)}
                className={`flex flex-col items-center gap-4 cursor-pointer group select-none`}
              >
                <motion.div 
                  layout="position"
                  className={`relative w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-2 transition-all duration-300 ${isSimilar ? 'border-point border-dashed bg-point/5' : isSelected ? 'border-point shadow-[0_0_15px_rgba(230,126,34,0.3)]' : 'border-navy/20 group-hover:border-navy/60 group-hover:shadow-md'}`}
                >
                  <div className={`relative w-full h-full rounded-full overflow-hidden ${isSelected ? 'p-1' : ''}`}>
                    <div className="relative w-full h-full rounded-full overflow-hidden">
                      <Image 
                        src={artist.image} 
                        alt={artist.name} 
                        fill 
                        sizes="176px"
                        className={`object-cover ${isSimilar ? 'opacity-90 mix-blend-multiply filter sepia-[0.3]' : ''} transition-all duration-300`} 
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
                  className={`font-sans text-base md:text-lg text-center ${isSimilar ? 'text-point font-medium' : isSelected ? 'text-navy font-bold' : 'text-charcoal'}`}
                >
                  {artist.name}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
      <div className="h-32" /> {/* Bottom padding */}
    </main>
  );
}
