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

    let calculatedPoints: { x: number, y: number, trackIdx: number, rank: number, track: Track }[] = [];
    let trackIdx = tracks.length - 1; // Start with lowest rank at the bottom
    let isLeftToRight = false; // Start from right to left at the bottom row

    const rowInfos = [];

    for (let r = sizes.length - 1; r >= 0; r--) {
      let S = sizes[r];
      let rowNodes = [];
      for (let c = 0; c < S; c++) {
        let x = (c + 0.5) * (VIEW_WIDTH / S);
        let y = PADDING_Y + r * ROW_HEIGHT;
        rowNodes.push({ x, y, trackIdx, rank: trackIdx + 1, track: tracks[trackIdx] });
        trackIdx--;
      }
      
      let minX = rowNodes[0].x;
      let maxX = rowNodes[rowNodes.length - 1].x;
      if (S === 1) {
        minX = 50; maxX = 50;
      }
      
      let paddingX = 15;
      let rowLeftX = Math.max(5, minX - paddingX);
      let rowRightX = Math.min(95, maxX + paddingX);
      
      if (isLeftToRight) {
        calculatedPoints.push(...rowNodes);
      } else {
        calculatedPoints.push(...[...rowNodes].reverse());
      }
      
      rowInfos.push({
        r,
        y: PADDING_Y + r * ROW_HEIGHT,
        leftX: rowLeftX,
        rightX: rowRightX,
        isLeftToRight,
        nodes: isLeftToRight ? rowNodes : [...rowNodes].reverse()
      });
      
      isLeftToRight = !isLeftToRight;
    }

    let d = "";
    const cameraKeyframes: {x: number, y: number}[] = [];

    if (rowInfos.length > 0) {
      let firstRow = rowInfos[0];
      let startX = firstRow.isLeftToRight ? firstRow.leftX : firstRow.rightX;
      d = `M ${startX} ${firstRow.y}`;
      cameraKeyframes.push({ x: startX, y: firstRow.y });

      for (let i = 0; i < rowInfos.length; i++) {
        let row = rowInfos[i];
        let endX = row.isLeftToRight ? row.rightX : row.leftX;
        
        for (let node of row.nodes) {
           cameraKeyframes.push({ x: node.x, y: node.y });
        }
        
        d += ` L ${endX} ${row.y}`;
        cameraKeyframes.push({ x: endX, y: row.y });

        if (i < rowInfos.length - 1) {
          let nextRow = rowInfos[i + 1];
          let nextStartX = nextRow.isLeftToRight ? nextRow.leftX : nextRow.rightX;
          
          let p0x = endX;
          let p0y = row.y;
          let p3x = nextStartX;
          let p3y = nextRow.y;
          
          let turnRadius = 20;
          let isRightSideTurn = row.isLeftToRight;
          let p1x = isRightSideTurn ? Math.max(p0x, p3x) + turnRadius : Math.min(p0x, p3x) - turnRadius;
          let p2x = p1x;
          
          d += ` C ${p1x} ${p0y}, ${p2x} ${p3y}, ${p3x} ${p3y}`;
          
          for (let t = 0.2; t <= 0.8; t += 0.2) {
             let mt = 1 - t;
             let x = mt*mt*mt*p0x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3x;
             let y = mt*mt*mt*p0y + 3*mt*mt*t*p0y + 3*mt*t*t*p3y + t*t*t*p3y;
             cameraKeyframes.push({ x, y });
          }
          cameraKeyframes.push({ x: p3x, y: p3y });
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
                
                {/* Track Info (Always visible to show what songs were ranked) */}
                <div className={`mt-2 text-center bg-white/90 backdrop-blur-md px-3 py-1 rounded-xl shadow-sm border border-navy/10 flex flex-col items-center transition-all ${isWinner ? 'scale-110' : 'scale-100'}`}>
                  <p className="text-[9px] sm:text-[10px] font-bold text-navy line-clamp-1 max-w-[90px] break-keep">{pt.track.title}</p>
                  <p className="text-[7px] sm:text-[8px] text-navy/60 line-clamp-1 max-w-[90px] mt-0.5 break-keep">{pt.track.artistName}</p>
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
