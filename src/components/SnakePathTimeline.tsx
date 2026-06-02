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
  isCompleted?: boolean;
}

const getRowSizes = (n: number, maxCols: number = 4) => {
  if (n <= 0) return [];
  if (n === 1) return [1];
  
  const sizes: number[] = [];
  let current = 1;
  let remaining = n;
  
  while (remaining >= current) {
    sizes.push(current);
    remaining -= current;
    current++;
  }
  
  // Distribute the remaining items among the existing rows (excluding the top row at index 0)
  // We distribute starting from the bottom row (index sizes.length - 1) backwards to index 1.
  if (remaining > 0) {
    let idx = sizes.length - 1;
    while (remaining > 0) {
      sizes[idx]++;
      remaining--;
      idx--;
      if (idx < 1) {
        idx = sizes.length - 1; // loop back to the bottom row
      }
    }
  }
  
  return sizes;
};

const getNodeDimensions = (S: number, isWinner: boolean) => {
  if (isWinner) {
    return {
      albumClass: "w-20 h-20 border-point shadow-[0_0_20px_rgba(230,126,34,0.5)] animate-pulse-ring",
      badgeClass: "w-8 h-8 text-sm -top-4 -left-4 bg-[#E67E22] text-white",
      titleClass: "text-[11px] sm:text-[12px] font-extrabold text-navy",
      artistClass: "text-[8px] sm:text-[9px] text-navy/60 font-semibold mt-0.5",
      maxWidth: "110px",
      holeClass: "w-[24%] h-[24%]"
    };
  }
  
  if (S <= 2) {
    return {
      albumClass: "w-14 h-14 border-navy/20 shadow-md",
      badgeClass: "w-5.5 h-5.5 text-[9px] -top-2.5 -left-2.5 bg-cream text-navy",
      titleClass: "text-[9.5px] sm:text-[10.5px] font-bold text-navy",
      artistClass: "text-[7.5px] sm:text-[8.5px] text-navy/60 mt-0.5",
      maxWidth: "85px",
      holeClass: "w-[22%] h-[22%]"
    };
  }
  
  if (S === 3) {
    return {
      albumClass: "w-11 h-11 border-navy/20 shadow-md",
      badgeClass: "w-5 h-5 text-[8.5px] -top-2 -left-2 bg-cream text-navy",
      titleClass: "text-[8.5px] sm:text-[9.5px] font-bold text-navy",
      artistClass: "text-[6.5px] sm:text-[7.5px] text-navy/60 mt-0.5",
      maxWidth: "70px",
      holeClass: "w-[22%] h-[22%]"
    };
  }

  if (S === 4) {
    return {
      albumClass: "w-9 h-9 border-navy/20 shadow-sm",
      badgeClass: "w-4 h-4 text-[7px] -top-1.5 -left-1.5 bg-cream text-navy",
      titleClass: "text-[7.5px] sm:text-[8px] font-bold text-navy",
      artistClass: "text-[6px] sm:text-[7px] text-navy/60 mt-0.5",
      maxWidth: "60px",
      holeClass: "w-[20%] h-[20%]"
    };
  }

  // S >= 5
  return {
    albumClass: "w-8 h-8 border-navy/15 shadow-sm",
    badgeClass: "w-3.5 h-3.5 text-[6px] -top-1 -left-1 bg-cream text-navy",
    titleClass: "text-[7px] font-bold text-navy",
    artistClass: "text-[5.5px] text-navy/60 mt-0.5",
    maxWidth: "50px",
    holeClass: "w-[20%] h-[20%]"
  };
};

const getBezierLength = (p0: {x:number, y:number}, p1: {x:number, y:number}, p2: {x:number, y:number}, p3: {x:number, y:number}) => {
  let len = 0;
  let prev = p0;
  const steps = 15;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
    const y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
    const dx = x - prev.x;
    const dy = y - prev.y;
    len += Math.sqrt(dx*dx + dy*dy);
    prev = {x, y};
  }
  return len;
};

export default function SnakePathTimeline({ tracks, drawDuration = 5, onLayoutComplete, isCompleted = false }: SnakePathTimelineProps) {
  const [isStarted, setIsStarted] = React.useState(false);

  React.useEffect(() => {
    // Set isStarted to true after mounting to trigger the CSS transition delay smoothly
    setIsStarted(true);
  }, []);
  const { pathData, points, viewBoxHeight, cameraKeyframes, totalPathLength } = useMemo(() => {
    if (!tracks || tracks.length === 0) return { pathData: "", points: [], viewBoxHeight: 600, cameraKeyframes: [], totalPathLength: 1 };

    const sizes = getRowSizes(tracks.length, 4); 
    const PADDING_Y = 80;
    const ROW_HEIGHT = 120;
    const VIEW_WIDTH = 100; // coordinate system 0 to 100 across width
    const VIEW_HEIGHT = Math.max(600, (sizes.length - 1) * ROW_HEIGHT + PADDING_Y * 2);

    let calculatedPoints: { x: number, y: number, trackIdx: number, rank: number, track: Track, rowCapacity: number }[] = [];
    let trackIdx = tracks.length - 1; // Start with lowest rank at the bottom
    let isLeftToRight = false; // Start from right to left at the bottom row

    const rowInfos = [];

    for (let r = sizes.length - 1; r >= 0; r--) {
      let S = sizes[r];
      let rowNodes = [];
      for (let c = 0; c < S; c++) {
        let x = (c + 0.5) * (VIEW_WIDTH / S);
        let y = PADDING_Y + r * ROW_HEIGHT;
        rowNodes.push({ x, y, trackIdx, rank: trackIdx + 1, track: tracks[trackIdx], rowCapacity: S });
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
    const pointsWithDistance: { x: number, y: number, trackIdx: number, rank: number, track: Track, rowCapacity: number, distance: number }[] = [];
    let accumulatedDistance = 0;
    const scaleY = (100 * 16 / 9) / VIEW_HEIGHT; // Scale Y coordinates to match aspect ratio in length calculations

    if (rowInfos.length > 0) {
      let firstRow = rowInfos[0];
      let startNode = firstRow.nodes[0];
      d = `M ${startNode.x} ${startNode.y}`;
      cameraKeyframes.push({ x: startNode.x, y: startNode.y });

      // The first node starts at cumulative distance 0
      pointsWithDistance.push({ ...startNode, distance: 0 });

      for (let i = 0; i < rowInfos.length; i++) {
        let row = rowInfos[i];
        
        // Sagging Christmas-light curves between nodes in the same row
        for (let c = 0; c < row.nodes.length - 1; c++) {
          let p0 = row.nodes[c];
          let p3 = row.nodes[c + 1];
          let sag = 0; // Smooth flowing straight ribbon line within rows
          
          let p1x = p0.x + (p3.x - p0.x) / 3;
          let p1y = p0.y + sag;
          let p2x = p0.x + 2 * (p3.x - p0.x) / 3;
          let p2y = p3.y + sag;
          
          d += ` C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3.x} ${p3.y}`;
          
          // Inside horizontal rows, sag=0 means straight line, length is horizontal distance
          const segmentLen = Math.abs(p3.x - p0.x);
          accumulatedDistance += segmentLen;
          pointsWithDistance.push({ ...p3, distance: accumulatedDistance });
          
          // Smooth intermediate tracking keyframes
          cameraKeyframes.push({ x: p0.x + (p3.x - p0.x) * 0.33, y: p0.y + sag });
          cameraKeyframes.push({ x: p0.x + (p3.x - p0.x) * 0.66, y: p0.y + sag });
          cameraKeyframes.push({ x: p3.x, y: p3.y });
        }

        // Sweeping Bezier turns connecting to the next row
        if (i < rowInfos.length - 1) {
          let nextRow = rowInfos[i + 1];
          let p0 = row.nodes[row.nodes.length - 1];
          let p3 = nextRow.nodes[0];
          
          // Wide rounded sweeping curve bowing outwards
          let turnWidth = 14;
          let isRightSide = row.isLeftToRight;
          let p1x = isRightSide ? p0.x + turnWidth : p0.x - turnWidth;
          let p1y = p0.y - 30;
          let p2x = isRightSide ? p3.x + turnWidth : p3.x - turnWidth;
          let p2y = p3.y + 30;
          
          d += ` C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3.x} ${p3.y}`;
          
          // Bezier turn distance calculation
          const turnLen = getBezierLength(
            { x: p0.x, y: p0.y * scaleY },
            { x: p1x, y: p1y * scaleY },
            { x: p2x, y: p2y * scaleY },
            { x: p3.x, y: p3.y * scaleY }
          );
          accumulatedDistance += turnLen;
          pointsWithDistance.push({ ...p3, distance: accumulatedDistance });

          // Camera tracks the turn loop smoothly
          cameraKeyframes.push({ x: p1x, y: (p0.y + p3.y) / 2 });
          cameraKeyframes.push({ x: p3.x, y: p3.y });
        }
      }
    }

    const totalPathLength = accumulatedDistance || 1;

    return { pathData: d, points: pointsWithDistance, viewBoxHeight: VIEW_HEIGHT, cameraKeyframes, totalPathLength };
  }, [tracks]);

  React.useEffect(() => {
    if (onLayoutComplete && cameraKeyframes.length > 0) {
      onLayoutComplete(cameraKeyframes, viewBoxHeight);
    }
  }, [cameraKeyframes, viewBoxHeight, onLayoutComplete]);

  // Snappy simultaneous entrance so all nodes are fully loaded and visible before drone tracking
  const containerVariants = {
    hidden: {},
    visible: {
      transition: { 
        staggerChildren: 0.02,
        delayChildren: 0.05
      }
    }
  };

  const nodeVariants = {
    hidden: { scale: 0, y: 15 },
    visible: { 
      scale: 1, 
      y: 0,
      transition: { type: "spring" as const, stiffness: 450, damping: 24 }
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" style={{ height: `${viewBoxHeight}px` }}>
      {/* Premium Inline Styles for cinematic 1st place highlighting */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulseRing {
          0% {
            box-shadow: 0 0 0 0 rgba(230, 126, 34, 0.7);
          }
          70% {
            box-shadow: 0 0 0 15px rgba(230, 126, 34, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(230, 126, 34, 0);
          }
        }
        @keyframes winnerBounce {
          0%, 100% {
            transform: scale(1.25) translateY(0);
          }
          50% {
            transform: scale(1.32) translateY(-6px);
          }
        }
        .animate-pulse-ring {
          animation: pulseRing 2s infinite;
        }
        .animate-winner-highlight {
          animation: winnerBounce 2s ease-in-out infinite;
        }
      `}} />

      {/* Absolute SVG spanning the flexible container */}
      <svg 
        viewBox={`0 0 100 ${viewBoxHeight}`} 
        className="absolute top-0 w-full z-0 h-full drop-shadow-md"
        preserveAspectRatio="none"
        overflow="visible"
      >
        {/* Background faint path (optional) */}
        <path d={pathData} fill="none" stroke="rgba(26,42,108,0.05)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Animated main path (vibrant orange string of lights line) */}
        <motion.path 
          d={pathData} 
          fill="none" 
          stroke="#E67E22" // Vibrant point orange color as requested
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={isCompleted ? { duration: 0.1 } : { delay: 1.0, duration: drawDuration, ease: "linear" }}
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
          const dims = getNodeDimensions(pt.rowCapacity, isWinner);
          // Calculate absolute percentages for rendering the HTML nodes
          const leftPercent = `${pt.x}%`;
          const topPercent = `${(pt.y / viewBoxHeight) * 100}%`;

          // Compute dynamic bulb light-up delays based on EXACT cumulative path distance
          // Start pan tracking delayed by startDelay = 1.0s, pacing proportional to EXACT path distance.
          // Trigger light-up with a 0.3s anticipation offset, so the transition completes exactly when the camera centers and the line passes through.
          const pathFraction = pt.distance / totalPathLength;
          const lightUpDelay = isCompleted ? 0 : Math.max(0, 1.0 + pathFraction * drawDuration - 0.3);
          
          const lightUpStyle: React.CSSProperties = isCompleted
            ? {
                opacity: 1.0,
                filter: "blur(0px) grayscale(0%)"
              }
            : {
                opacity: isStarted ? 1.0 : 0.42, // Subtler transparency for better base visibility
                filter: isStarted ? "blur(0px) grayscale(0%)" : "blur(1.8px) grayscale(15%)", // Faint blur (1.8px) and grayscale (15%) for subtle focus transition
                transition: "opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s cubic-bezier(0.16, 1, 0.3, 1)", // Ultra-snappy 0.3s transition to match lockstep triggering
                transitionDelay: `${lightUpDelay}s`
              };

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
                  style={lightUpStyle}
                  className={`relative flex flex-col items-center group transition-transform ${
                    isWinner 
                      ? 'animate-winner-highlight z-50' 
                      : 'scale-100 z-10 hover:z-30 hover:scale-110'
                  }`}
                >
                  {/* Bouncing Gold Crown for Winner */}
                  {isWinner && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 text-yellow-500 text-base drop-shadow-md select-none animate-bounce">
                      👑
                    </div>
                  )}

                  {/* Rank Badge */}
                  <div className={`absolute rounded-full flex items-center justify-center font-serif font-bold z-30 shadow-md border border-white ${dims.badgeClass}`}>
                    {pt.rank}
                  </div>
                  
                  {/* Album Cover (Masked center hole) */}
                  <div 
                    className={`relative rounded-full overflow-hidden border-2 ${dims.albumClass}`}
                    style={{
                      maskImage: "radial-gradient(circle, transparent 12%, black 12.5%)",
                      WebkitMaskImage: "radial-gradient(circle, transparent 12%, black 12.5%)"
                    }}
                  >
                    <Image src={pt.track.albumImage} alt={pt.track.title} fill className="object-cover" />
                  </div>
                  
                  {/* Vinyl hole border detail (completely transparent inside, overlays on top of masked album cover with a matching orange border) */}
                  <div className={`absolute inset-0 m-auto ${dims.holeClass} border border-[#E67E22]/30 bg-transparent rounded-full pointer-events-none z-20`} />
                  
                  {/* Track Info (Borderless clean text directly below, matching the third/fourth image style) */}
                  <div 
                    className={`mt-2 text-center flex flex-col items-center transition-all ${isWinner ? 'scale-110' : 'scale-100'}`}
                    style={{ maxWidth: dims.maxWidth }}
                  >
                    <p className={`${dims.titleClass} line-clamp-1 break-keep leading-tight text-center w-full`}>{pt.track.title}</p>
                    <p className={`${dims.artistClass} line-clamp-1 break-keep leading-none text-center w-full mt-0.5`}>{pt.track.artistName}</p>
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
