"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, useAnimation, useDragControls, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
  albumTitle?: string;
  duration?: string;
}

interface WorldCupCandidateProps {
  track: Track;
  onDrop: (track: Track) => void;
  onActive?: (isActive: boolean) => void;
}

export default function WorldCupCandidate({ track, onDrop, onActive }: WorldCupCandidateProps) {
  const [isLP, setIsLP] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimation();
  const dragControls = useDragControls();

  useEffect(() => {
    onActive?.(isLP);
  }, [isLP, onActive]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragControls.start(e);
    setIsPressing(true);
    controls.start({
      scale: 0.95,
      transition: { duration: 0.15 }
    });

    pressTimer.current = setTimeout(() => {
      setIsLP(true);
    }, 200);
  };

  const cancelPress = () => {
    setIsPressing(false);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    controls.start({
      scale: 1,
      transition: { type: "spring", stiffness: 300, damping: 20 }
    });
  };

  const handleDragEnd = (event: any, info: any) => {
    cancelPress();
    setIsLP(false);
    
    // Play-in sensitive drag check 
    if (info.offset.y > 100) {
      onDrop(track);
    }
  };

  return (
    <motion.div
      className="relative flex flex-col items-center select-none w-full justify-center"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      animate={controls}
    >
      {/* 
        Responsive visual wrapper: 
        Maintains a gorgeous scale that is optimized for small screens (360px+) 
        without ever becoming too small on large modern devices (S20 Ultra / iPhone Max).
      */}
      <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 flex items-center justify-center shrink-0">
        
        {/* 2. The LP Record (Revealed underneath - scales perfectly using percentages) */}
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false} 
          dragSnapToOrigin={true}
          onDragStart={() => setIsLP(true)}
          onDragEnd={handleDragEnd}
          animate={{ 
             scale: isLP ? 1 : 0.8,
             opacity: isLP ? 1 : 0,
          }}
          whileDrag={{ scale: 1.1, zIndex: 50 }}
          className="absolute w-[90%] h-[90%] rounded-full border-2 border-navy bg-[#1a1a1a] flex items-center justify-center shadow-2xl z-20 cursor-grab active:cursor-grabbing origin-center"
        >
          {/* Grooves */}
          <div className="absolute w-[85%] h-[85%] rounded-full border border-white/10 pointer-events-none" />
          <div className="absolute w-[70%] h-[70%] rounded-full border border-white/10 pointer-events-none" />
          <div className="absolute w-[55%] h-[55%] rounded-full border border-white/10 pointer-events-none" />
          
          {/* LP Label (Scales perfectly in ratio) */}
          <div className="w-[45%] h-[45%] rounded-full border border-navy/20 relative overflow-hidden bg-point z-10 flex items-center justify-center shadow-inner pointer-events-none">
             <Image src={track.albumImage} alt={track.title} fill sizes="64px" className="object-cover opacity-80" />
             <div className="w-[20%] h-[20%] rounded-full bg-cream border border-navy shadow-sm z-20 absolute" />
          </div>
        </motion.div>

        {/* 1. The Album Cover (Sleeve) - Slides UP beautifully by percentage to maintain perfect proportion regardless of scale */}
        <motion.div
          animate={{ 
            y: isLP ? "-12%" : 0, 
            scale: isLP ? 0.82 : 1,
            opacity: isLP ? 0.6 : 1,
            rotate: isLP ? -3 : 0
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute inset-0 rounded-2xl sm:rounded-[1.5rem] border border-navy/20 bg-cream shadow-[0_6px_20px_rgba(26,42,108,0.15)] overflow-hidden z-30 pointer-events-none"
        >
          <Image src={track.albumImage} alt={track.title} fill sizes="(max-width: 768px) 140px, 160px" className="object-cover" />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors" />
        </motion.div>
      </div>

      {/* 3. Normal Flow Info Label (Static relative placement) */}
      <motion.div 
        animate={{ opacity: isLP ? 0 : 1, y: isLP ? 15 : 0 }}
        className="mt-3 text-center pointer-events-none w-full select-none"
      >
        <h3 className="font-sans font-bold text-xs sm:text-base md:text-lg text-navy line-clamp-1 px-1">
          {track.title}
        </h3>
        <p className="font-sans text-[10px] sm:text-sm text-charcoal/70 line-clamp-1 mt-0.5">
          {track.artistName}
        </p>
      </motion.div>
    </motion.div>
  );
}
