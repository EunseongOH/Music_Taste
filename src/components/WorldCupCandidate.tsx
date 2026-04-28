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
    // Instantly pass the drag to the LP
    dragControls.start(e);
    
    setIsPressing(true);
    controls.start({
      scale: 0.95,
      transition: { duration: 0.15 }
    });

    // Short timer to reveal LP
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
    
    // We don't instantly hide LP if they are dragging.
    // Hiding it will be handled by onDragEnd.
  };

  const handleDragEnd = (event: any, info: any) => {
    // Quick heuristic: Check if dropped roughly at the bottom center of the screen
    // We will use standard viewport coordinates roughly. For accuracy,
    // the parent could pass a ref to the drop zone bounding box.
    // For now we rely on a custom event, or parent passing a drop function.
    // We can also just rely on y offset being large enough.
    cancelPress();
    setIsLP(false);
    
    if (info.offset.y > 150) {
      onDrop(track);
    } else {
      // Snap back if not dropped
    }
  };

  return (
    <motion.div
      className="relative flex flex-col items-center select-none w-40 h-40 justify-center"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      animate={controls}
    >
      {/* 2. The LP Record (Revealed underneath) */}
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false} // Custom listener via onPointerDown on parent
        dragSnapToOrigin={true}
        onDragStart={() => setIsLP(true)}
        onDragEnd={handleDragEnd}
        animate={{ 
           scale: isLP ? 1 : 0.8,
           opacity: isLP ? 1 : 0,
        }}
        whileDrag={{ scale: 1.1, zIndex: 50 }}
        className="absolute w-36 h-36 rounded-full border-2 border-navy bg-[#1a1a1a] flex items-center justify-center shadow-2xl z-20 cursor-grab active:cursor-grabbing origin-center"
      >
        {/* Grooves */}
        <div className="absolute w-[85%] h-[85%] rounded-full border border-white/10 pointer-events-none" />
        <div className="absolute w-[70%] h-[70%] rounded-full border border-white/10 pointer-events-none" />
        <div className="absolute w-[55%] h-[55%] rounded-full border border-white/10 pointer-events-none" />
        
        {/* LP Label */}
        <div className="w-16 h-16 rounded-full border border-navy/20 relative overflow-hidden bg-point z-10 flex items-center justify-center shadow-inner pointer-events-none">
           <Image src={track.albumImage} alt={track.title} fill sizes="64px" className="object-cover opacity-80" />
           <div className="w-4 h-4 rounded-full bg-cream border border-navy shadow-sm z-20 absolute" />
        </div>
      </motion.div>

      {/* 1. The Album Cover (Sleeve) - Slides UP and slightly scales down */}
      <motion.div
        animate={{ 
          y: isLP ? -90 : 0, 
          scale: isLP ? 0.9 : 1,
          opacity: isLP ? 0.6 : 1,
          rotate: isLP ? -5 : 0
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="absolute w-40 h-40 rounded-[1.5rem] border border-navy/20 bg-cream shadow-[0_10px_30px_rgba(26,42,108,0.2)] overflow-hidden z-30 pointer-events-none"
      >
        <Image src={track.albumImage} alt={track.title} fill sizes="160px" className="object-cover" />
        <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors" />
      </motion.div>

      {/* Info Label below */}
      <motion.div 
        animate={{ opacity: isLP ? 0 : 1, y: isLP ? 20 : 0 }}
        className="absolute -bottom-16 text-center pointer-events-none w-full"
      >
        <h3 className="font-sans font-bold text-lg text-navy line-clamp-1">{track.title}</h3>
        <p className="font-sans text-sm text-charcoal/70">{track.artistName}</p>
      </motion.div>
    </motion.div>
  );
}
