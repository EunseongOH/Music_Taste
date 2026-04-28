"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, FastForward, Rewind } from "lucide-react";
import Image from "next/image";

export interface LPPlayerProps {
  isPlaying?: boolean;
  currentTrack?: {
    id: string;
    albumImage: string;
    title: string;
  } | null;
  onTogglePlay?: () => void;
  className?: string;
}

export default function LPPlayer({ isPlaying = false, currentTrack, onTogglePlay, className = "" }: LPPlayerProps) {

  return (
    <div className={`relative w-full max-w-lg h-36 sm:h-48 border-2 border-navy rounded-xl px-6 flex flex-col justify-between bg-cream/50 backdrop-blur-sm shadow-sm ${className}`}>
      {/* Turn table structure */}
      <div className="absolute top-4 left-4 w-4 h-4 rounded-full border-2 border-navy/30" />
      <div className="absolute top-4 right-4 w-4 h-4 rounded-full border-2 border-navy/30" />
      <div className="absolute bottom-4 left-4 w-4 h-4 rounded-full border-2 border-navy/30" />
      <div className="absolute bottom-4 right-4 w-4 h-4 rounded-full border-2 border-navy/30" />
      
      {/* Platter and Vinyl */}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <div className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full border-2 border-navy/20 flex items-center justify-center">
          <motion.div 
            className={`w-40 h-40 sm:w-56 sm:h-56 rounded-full border-2 border-navy flex items-center justify-center shadow-inner overflow-hidden ${currentTrack ? 'bg-[#1a1a1a]' : 'bg-navy/5'}`}
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={
              isPlaying 
                ? { repeat: Infinity, duration: 1.2, ease: "linear" } 
                : { duration: 1, ease: "easeOut" }
            }
          >
            {/* Record Grooves - Line-art style */}
            <div className="absolute w-[85%] h-[85%] rounded-full border border-navy/20" />
            <div className="absolute w-[70%] h-[70%] rounded-full border border-navy/20" />
            <div className="absolute w-[55%] h-[55%] rounded-full border border-navy/20" />
            
            {/* Center Label */}
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${currentTrack ? 'bg-transparent' : 'bg-point'} flex items-center justify-center border-2 border-navy z-10 relative overflow-hidden`}>
              {currentTrack && (
                 <Image src={currentTrack.albumImage} alt={currentTrack.title} fill sizes="80px" className="object-cover opacity-80" />
              )}
              <div className="w-4 h-4 rounded-full bg-cream border-2 border-navy relative z-20" />
            </div>
          </motion.div>
        </div>

        {/* Tonearm */}
        <motion.div 
          className="absolute right-8 top-1/2 -translate-y-1/2 w-4 origin-top z-20"
          animate={{ rotate: isPlaying ? 25 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Tonearm Base */}
          <div className="w-8 h-8 rounded-full border-2 border-navy bg-cream absolute -top-4 -left-2 z-20 flex items-center justify-center">
             <div className="w-3 h-3 rounded-full bg-navy/20" />
          </div>
          {/* Arm */}
          <div className="w-2 h-28 sm:h-32 border-x-2 border-t-2 border-navy bg-cream/80 ml-1 rounded-t-full shadow-sm" />
          {/* Head-shell */}
          <div className="w-6 h-10 border-2 border-navy bg-cream -ml-1 rounded-sm shadow-sm flex flex-col items-center pt-1 mt-[-2px]">
             <div className="w-4 h-1 border-b-2 border-navy/50" />
             <div className="w-4 h-1 border-b-2 border-navy/50 mt-1" />
          </div>
        </motion.div>
      </div>

    </div>
  );
}
