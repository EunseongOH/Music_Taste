"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

interface SnakePathTimelineProps {
  tracks: Track[]; // Sorted from 1st place to lowest place
  drawDuration?: number;
  onLayoutComplete?: (cameraKeyframes: {x: number, y: number}[], viewBoxHeight: number) => void;
}

const getRowSizes = (n: number, maxCols: number = 4) => {
  const sizes: number[] = [];
  let current = 1;
  while (n > 0) {
    if (current >= maxCols) break;
    if (n >= current) {
      sizes.push(current);
      n -= current;
      current++;
    } else {
      sizes.push(n);
      n = 0;
    }
  }
  while (n > 0) {
    if (n >= maxCols) {
      sizes.push(maxCols);
      n -= maxCols;
    } else {
      sizes.push(n);
      n = 0;
    }
  }
  return sizes.sort((a, b) => a - b);
};

export default function SnakePathTimeline({ tracks, drawDuration = 5, onLayoutComplete }: SnakePathTimelineProps) {
  const { pathData, points, viewBoxHeight, cameraKeyframes } = useMemo(() => {
    if (!tracks || tracks.length === 0) return { pathData: "", points: [], viewBoxHeight: 600, cameraKeyframes: [] };

    const sizes = getRowSizes(tracks.length, 4); 
    const PADDING_Y = 80;
    const ROW_HEIGHT = 120;
    const VIEW_WIDTH = 100; // coordinate system 0 to 100 across width
    const VIEW_HEIGHT = Math.max(600, (sizes.length - 1) * ROW_HEIGHT + PADDING_Y * 2);

    let calculatedPoints = [];
    let trackIdx = tracks.length - 1; // Start with lowest rank at the bottom
    let isLeftToRight = true;

    for (let r = sizes.length - 1; r >= 0; r--) {
      let S = sizes[r];
      let rowPoints = [];
      for (let c = 0; c < S; c++) {
        // distribute centers across 0..100
        let x = (c + 0.5) * (VIEW_WIDTH / S);
        let y = PADDING_Y + r * ROW_HEIGHT;
        rowPoints.push({ x, y, trackIdx, rank: trackIdx + 1, track: tracks[trackIdx] });
        trackIdx--;
      }
      if (!isLeftToRight) {
        rowPoints.reverse();
      }
      calculatedPoints.push(...rowPoints);
      isLeftToRight = !isLeftToRight;
    }

    let d = "";
    const cameraKeyframes: {x: number, y: number}[] = [];

    if (calculatedPoints.length > 0) {
      d = `M ${calculatedPoints[0].x} ${calculatedPoints[0].y}`;
      cameraKeyframes.push({ x: calculatedPoints[0].x, y: calculatedPoints[0].y });
      
      for (let i = 1; i < calculatedPoints.length; i++) {
        let p0 = calculatedPoints[i - 1];
        let p1 = calculatedPoints[i];
        if (p0.y === p1.y) {
          d += ` L ${p1.x} ${p1.y}`;
          cameraKeyframes.push({ x: p1.x, y: p1.y });
        } else {
          // U-turn arc
          let isRightSide = p0.x >= 50;
          let outX = isRightSide ? Math.max(p0.x, p1.x) + 20 : Math.min(p0.x, p1.x) - 20;
          d += ` C ${outX} ${p0.y}, ${outX} ${p1.y}, ${p1.x} ${p1.y}`;
          
          cameraKeyframes.push({ x: Math.min(Math.max(outX, 0), 100), y: (p0.y + p1.y) / 2 });
          cameraKeyframes.push({ x: p1.x, y: p1.y });
        }
      }
    }

    return { pathData: d, points: calculatedPoints, viewBoxHeight: VIEW_HEIGHT, cameraKeyframes };
  }, [tracks]);

  React.useEffect(() => {
    if (onLayoutComplete && cameraKeyframes.length > 0) {
      onLayoutComplete(cameraKeyframes, viewBoxHeight);
    }
  }, [cameraKeyframes, viewBoxHeight, onLayoutComplete]);

  // Framer motion variants to stagger nodes
  const containerVariants = {
    hidden: {},
    visible: {
      transition: { 
        staggerChildren: 0.15,
        delayChildren: 0.5 // Wait for path line to start drawing
      }
    }
  };

  const nodeVariants = {
    hidden: { scale: 0, opacity: 0, y: 20 },
    visible: { 
      scale: 1, 
      opacity: 1, 
      y: 0,
      transition: { type: "spring" as const, stiffness: 300, damping: 20 }
    }
  };

  return (
    <div className="relative w-full max-w-sm mx-auto" style={{ height: 'auto', minHeight: '100%' }}>
      {/* Absolute SVG spanning the flexible container */}
      <svg 
        viewBox={`0 0 100 ${viewBoxHeight}`} 
        className="absolute top-0 w-full z-0 h-full drop-shadow-md"
        preserveAspectRatio="none"
        overflow="visible"
      >
        {/* Background faint path (optional) */}
        <path d={pathData} fill="none" stroke="rgba(26,42,108,0.05)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Animated main path */}
        <motion.path 
          d={pathData} 
          fill="none" 
          stroke="#E67E22" // Point color
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: drawDuration, ease: "easeInOut" }}
        />
      </svg>

      {/* Nodes Container */}
      <motion.div 
        className="relative z-10 w-full"
        style={{ height: `${viewBoxHeight}px` }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {points.map((pt, i) => {
          const isWinner = pt.rank === 1;
          // Calculate absolute percentages for rendering the HTML nodes
          const leftPercent = `${pt.x}%`;
          const topPercent = `${(pt.y / viewBoxHeight) * 100}%`;

          return (
            <div
              key={pt.track.id}
              className="absolute"
              style={{
                left: leftPercent,
                top: topPercent,
              }}
            >
              <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2">
                <motion.div
                  variants={nodeVariants}
                  className={`relative flex flex-col items-center group transition-transform ${isWinner ? 'scale-125 z-50' : 'scale-100 z-10 hover:z-30 hover:scale-110'}`}
                >
                  {/* Rank Badge */}
                <div className={`absolute -top-3 ${isWinner ? '-left-4' : '-left-2'} w-6 h-6 rounded-full flex items-center justify-center font-serif text-[10px] font-bold z-20 shadow-md border border-white
                  ${isWinner ? 'bg-point text-white w-8 h-8 text-sm -top-4' : 'bg-cream text-navy'}`}>
                  {pt.rank}
                </div>
                
                {/* Album Cover */}
                <div className={`relative rounded-full overflow-hidden shadow-lg border-2 ${isWinner ? 'w-20 h-20 border-point' : 'w-12 h-12 border-navy/20'}`}>
                  <Image src={pt.track.albumImage} alt={pt.track.title} fill className="object-cover" />
                  {/* Vinyl hole detail */}
                  <div className="absolute inset-0 m-auto w-[15%] h-[15%] bg-cream border border-navy/20 rounded-full" />
                </div>
                
                {/* Track Info (Hidden for lower ranks unless hovered, or just small) */}
                <div className={`mt-2 text-center bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm border border-navy/5 ${isWinner ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 absolute top-full pointer-events-none'}`}>
                  <p className="text-[10px] sm:text-xs font-bold text-navy line-clamp-1 max-w-[80px] break-keep">{pt.track.title}</p>
                </div>
                </motion.div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
