"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, useAnimation, useDragControls, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useTrackArtwork } from "@/utils/useTrackArtwork";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
  albumImageFallbacks?: string[];
  artistImage?: string;
  albumTitle?: string;
  duration?: string;
}

interface WorldCupCandidateProps {
  track: Track;
  onDrop: (track: Track) => void;
  /** 위로 끌어 올렸을 때 — 모르는 곡으로 뺀다. */
  onRemove?: (track: Track) => void;
  onActive?: (isActive: boolean) => void;
}

export default function WorldCupCandidate({ track, onDrop, onRemove, onActive }: WorldCupCandidateProps) {
  const [isLP, setIsLP] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimation();
  const dragControls = useDragControls();
  // 슬리브와 LP 라벨이 같은 그림을 쓴다 — 한쪽만 대체 그림으로 넘어가는 일이 없게 한 번만 정한다.
  const art = useTrackArtwork(track);

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
    } else if (info.offset.y < -100) {
      onRemove?.(track);
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
          className="absolute w-[90%] h-[90%] rounded-full border-2 border-navy bg-[#1a1a1a] newtone:border newtone:border-navy/20 newtone:bg-[#222B47] newtone:shadow-[0_10px_24px_-10px_rgba(24,33,59,0.5)] flex items-center justify-center shadow-2xl z-20 cursor-grab active:cursor-grabbing origin-center"
        >
          {/* Grooves */}
          <div className="absolute w-[85%] h-[85%] rounded-full border border-white/10 pointer-events-none" />
          <div className="absolute w-[70%] h-[70%] rounded-full border border-white/10 pointer-events-none" />
          <div className="absolute w-[55%] h-[55%] rounded-full border border-white/10 pointer-events-none" />
          
          {/* LP Label (Scales perfectly in ratio) */}
          <div className="w-[45%] h-[45%] rounded-full border border-navy/20 relative overflow-hidden bg-point z-10 flex items-center justify-center shadow-inner pointer-events-none">
             <Image src={art.src} onError={art.onError} alt={track.title} fill sizes="64px" className="object-cover opacity-80" />
             <div className="w-[20%] h-[20%] rounded-full bg-cream border border-navy shadow-sm z-20 absolute" />
          </div>
        </motion.div>

        {/* 1. The Album Cover (Sleeve) - Slides UP beautifully by percentage to maintain perfect proportion regardless of scale */}
        <motion.div
          animate={{ 
            y: isLP ? "-25%" : 0, 
            scale: isLP ? 0.85 : 1,
            opacity: isLP ? 0.5 : 1,
            rotate: isLP ? -5 : 0
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute inset-0 rounded-2xl sm:rounded-[1.5rem] border border-navy/20 bg-cream shadow-[0_6px_20px_rgba(var(--t-ink-rgb),0.15)] newtone:bg-white newtone:border-navy/10 newtone:shadow-[0_8px_24px_-12px_rgba(24,33,59,0.25)] overflow-hidden z-30 pointer-events-none"
        >
          <Image src={art.src} onError={art.onError} alt={track.title} fill sizes="(max-width: 768px) 140px, 160px" className="object-cover" />
          {/*
            재킷이 없어 아티스트 사진을 쓸 때만. 같은 아티스트의 두 곡이 같은 사진으로 맞붙으면
            그림으로는 못 가른다 — 아래쪽에 곡 제목을 얕게 얹는다. 실제 재킷에는 아무것도 얹지 않는다.
          */}
          {art.kind === "artist" && (
            <div
              data-artwork-fallback="artist"
              className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-6 bg-gradient-to-t from-black/60 to-transparent"
            >
              <p className="font-sans font-bold text-[10px] sm:text-xs leading-tight text-white line-clamp-2 text-left">{track.title}</p>
            </div>
          )}
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
