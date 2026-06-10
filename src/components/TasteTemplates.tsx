"use client";

import React from "react";
import Image from "next/image";
import { Music } from "lucide-react";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

interface TemplateProps {
  tracks: Track[];
  isExport?: boolean;
  pageIndex?: number;
  pageSize?: number;
}

export function EmotionalListTemplate({ tracks, isExport = false, pageIndex = 0, pageSize = 15 }: TemplateProps) {
  // If exporting, slice the tracks based on page index
  const displayTracks = isExport 
    ? tracks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
    : tracks;

  const startRank = isExport ? pageIndex * pageSize + 1 : 1;

  return (
    <div 
      className={`w-full bg-[#F5F2ED] font-sans text-navy flex flex-col ${
        isExport ? "h-full p-10 justify-between select-none" : "h-auto p-4 sm:p-6"
      }`}
      style={{ minHeight: isExport ? "100%" : "auto" }}
    >
      {/* Header */}
      <div className="text-center pb-6 border-b border-navy/15 flex flex-col items-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-navy/5 text-navy mb-2.5">
          <Music size={20} />
        </div>
        <h2 className="font-serif text-3xl tracking-tight text-navy leading-none">My Music Taste</h2>
        <p className="font-sans font-bold text-[8.5px] uppercase tracking-[0.25em] text-[#E67E22] mt-1.5">
          The Analog Record Shop Chart
        </p>
        {isExport && (
          <span className="font-mono text-[9px] text-navy/40 font-bold mt-2 uppercase tracking-widest bg-navy/5 px-2.5 py-0.5 rounded-full">
            Part {pageIndex + 1} / {Math.ceil(tracks.length / pageSize)}
          </span>
        )}
      </div>

      {/* Tracks List */}
      <div className={`w-full flex flex-col mt-4 flex-1 ${isExport ? "justify-center" : ""}`}>
        {displayTracks.map((track, idx) => {
          const rank = startRank + idx;
          const isTop3 = rank <= 3;
          
          return (
            <div 
              key={`${track.id}-${rank}`}
              className="flex items-center justify-between py-3 border-b border-navy/5 last:border-b-0 hover:bg-navy/5 px-2 rounded-xl transition-all"
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                {/* Rank Badge */}
                <span className={`font-serif text-sm font-black w-6 text-center select-none ${
                  isTop3 ? "text-[#E67E22] text-base" : "text-navy/40"
                }`}>
                  {rank}
                </span>

                {/* Album Cover */}
                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-navy/10 shadow-sm shrink-0">
                  <Image 
                    src={track.albumImage} 
                    alt={track.title} 
                    fill 
                    className="object-cover"
                    sizes="40px"
                  />
                </div>

                {/* Track Info */}
                <div className="flex flex-col min-w-0 text-left">
                  <span className={`text-xs font-bold text-navy line-clamp-1 ${isTop3 ? "text-[12.5px]" : ""}`}>
                    {track.title.length > 20 ? track.title.slice(0, 20) + "…" : track.title}
                  </span>
                  <span className="text-[10px] text-navy/60 font-medium line-clamp-1 mt-0.5">
                    {track.artistName}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Branding (Mostly for Export Card) */}
      <div className="mt-6 pt-4 border-t border-navy/10 flex items-center justify-between text-navy/40">
        <span className="font-serif text-[11px] font-bold tracking-tight">The Record Shop</span>
        <span className="font-sans text-[8px] uppercase tracking-wider font-semibold">
          {isExport ? `Showing Ranks ${startRank} - ${Math.min(tracks.length, startRank + pageSize - 1)} of ${tracks.length}` : `Total ${tracks.length} tracks`}
        </span>
      </div>
    </div>
  );
}

export function VintageVinylTemplate({ tracks, isExport = false, pageIndex = 0, pageSize = 10 }: TemplateProps) {
  // If exporting, slice the tracks. For Page 1, we show #1 as large LP plus ranks 2 to 10.
  // For Page > 1, we show a standard vintage list.
  const isFirstPage = pageIndex === 0;
  const startRank = pageIndex * pageSize + 1;
  const displayTracks = isExport
    ? (isFirstPage ? tracks.slice(1, pageSize) : tracks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize))
    : tracks.slice(1);

  const topTrack = tracks[0];

  return (
    <div 
      className={`w-full bg-[#FAF7F2] font-sans text-navy flex flex-col ${
        isExport ? "h-full p-9 justify-between select-none" : "h-auto p-4 sm:p-6"
      }`}
      style={{ minHeight: isExport ? "100%" : "auto" }}
    >
      {/* Vinyl Section for Rank 1 (Shown on screen always, or on Export Page 1) */}
      {((!isExport && topTrack) || (isExport && isFirstPage && topTrack)) && (
        <div className="flex flex-col items-center py-6 relative">
          {/* Tone Arm overlay decoration */}
          <div className="absolute top-2 right-1/4 w-12 h-20 border-r-2 border-t-2 border-navy/20 rounded-tr-3xl z-30 pointer-events-none opacity-80" style={{ transform: "rotate(15deg)", transformOrigin: "top right" }}>
            <div className="absolute bottom-0 right-0 w-3 h-5 bg-navy/40 border border-navy/60 rounded-sm" />
          </div>

          {/* Large Spinning LP disc */}
          <div className="relative w-44 h-44 rounded-full bg-[#1A1A1A] shadow-2xl flex items-center justify-center border-4 border-navy border-opacity-5 relative group overflow-hidden">
            {/* Grooves */}
            <div className="absolute inset-0 rounded-full border border-white/5 m-3" />
            <div className="absolute inset-0 rounded-full border border-white/5 m-6" />
            <div className="absolute inset-0 rounded-full border border-white/5 m-9" />
            <div className="absolute inset-0 rounded-full border border-white/5 m-12" />
            
            {/* Center Label (Album Art) */}
            <div 
              className="relative w-16 h-16 rounded-full overflow-hidden border border-[#E67E22]/30"
              style={{
                maskImage: "radial-gradient(circle, transparent 15%, black 15.5%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 15%, black 15.5%)"
              }}
            >
              <Image 
                src={topTrack.albumImage} 
                alt={topTrack.title} 
                fill 
                className="object-cover animate-[spin_10s_linear_infinite]" 
                sizes="64px"
              />
            </div>
            
            {/* Metal Center Spindle hole */}
            <div className="absolute inset-0 m-auto w-3 h-3 bg-[#FAF7F2] border border-navy/20 rounded-full z-20 shadow-inner" />
          </div>

          {/* #1 Album Title & Badge */}
          <div className="text-center mt-5 flex flex-col items-center">
            <div className="px-3.5 py-0.5 bg-[#E67E22] text-[#FAF7F2] font-serif text-[10px] font-black uppercase tracking-[0.15em] rounded-full shadow-sm mb-2.5">
              1st Choice
            </div>
            <h3 className="text-base font-black text-navy font-serif tracking-tight leading-tight line-clamp-1 max-w-[240px]">
              {topTrack.title}
            </h3>
            <p className="text-xs text-navy/60 font-semibold mt-1">
              {topTrack.artistName}
            </p>
          </div>
        </div>
      )}

      {/* Header for Pages > 1 */}
      {isExport && !isFirstPage && (
        <div className="text-center pb-4 border-b border-navy/15 flex flex-col items-center">
          <h2 className="font-serif text-2xl tracking-tight text-navy">My Music Taste</h2>
          <p className="font-sans font-bold text-[8px] uppercase tracking-[0.2em] text-[#E67E22] mt-1">
            The Record Shop Playlist
          </p>
          <span className="font-mono text-[9px] text-navy/40 font-bold mt-2 uppercase tracking-widest bg-navy/5 px-2.5 py-0.5 rounded-full">
            Part {pageIndex + 1} / {Math.ceil(tracks.length / pageSize)}
          </span>
        </div>
      )}

      {/* Runner Up List */}
      <div className="w-full flex flex-col flex-1 mt-4">
        {displayTracks.map((track, idx) => {
          const rank = isExport 
            ? (isFirstPage ? 2 + idx : startRank + idx)
            : 2 + idx;
            
          return (
            <div 
              key={`${track.id}-${rank}`}
              className="flex items-center justify-between py-2.5 border-b border-navy/5 last:border-b-0 hover:bg-navy/5 px-1.5 rounded-xl transition-all"
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <span className="font-serif text-[12.5px] font-black text-navy/40 w-5 text-center select-none">
                  {rank}
                </span>

                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-navy/10 shadow-sm shrink-0">
                  <Image 
                    src={track.albumImage} 
                    alt={track.title} 
                    fill 
                    className="object-cover"
                    sizes="32px"
                  />
                  {/* Vinyl center hole dot */}
                  <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-[#FAF7F2] rounded-full border border-navy/10 z-10" />
                </div>

                <div className="flex flex-col min-w-0 text-left">
                  <span className="text-[11px] font-bold text-navy line-clamp-1">
                    {track.title.length > 20 ? track.title.slice(0, 20) + "…" : track.title}
                  </span>
                  <span className="text-[9.5px] text-navy/50 font-medium line-clamp-1 mt-0.5">
                    {track.artistName}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-5 pt-3 border-t border-navy/10 flex items-center justify-between text-navy/40">
        <span className="font-serif text-[10px] font-bold tracking-tight">The Analog Vibe</span>
        <span className="font-sans text-[8px] uppercase tracking-wider font-semibold">
          {isExport 
            ? (isFirstPage 
                ? `Ranks 1 - ${Math.min(tracks.length, pageSize)} of ${tracks.length}`
                : `Ranks ${startRank} - ${Math.min(tracks.length, startRank + pageSize - 1)} of ${tracks.length}`
              )
            : `Showing Top ${Math.min(tracks.length, 10)} tracks`
          }
        </span>
      </div>
    </div>
  );
}
