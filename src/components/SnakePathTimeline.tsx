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
  tracks: Track[];
  drawDuration?: number;
  onLayoutComplete?: (cameraKeyframes: {x: number, y: number}[], viewBoxHeight: number) => void;
  isCompleted?: boolean;
}

// 1. maxCols 제한을 없애고 완벽한 피라미드 구조(1, 2, 3, 4, 5...)로 배분합니다.
const getRowSizes = (n: number) => {
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
  
  // 남은 곡들은 하위 줄부터 역순으로 골고루 뿌려줍니다.
  if (remaining > 0) {
    let idx = sizes.length - 1;
    while (remaining > 0) {
      sizes[idx]++;
      remaining--;
      idx--;
      if (idx < 1) {
        idx = sizes.length - 1;
      }
    }
  }
  
  return sizes;
};

// 공간이 좌우로 무한 확장되므로, 하위 순위 노드들도 더 이상 작아질 필요 없이 쾌적한 사이즈를 유지합니다.
const getNodeDimensions = (S: number, isWinner: boolean) => {
  if (isWinner) {
    return {
      albumClass: "w-20 h-20 border-point shadow-[0_0_20px_rgba(230,126,34,0.5)] animate-pulse-ring",
      badgeClass: "w-8 h-8 text-sm -top-4 -left-4 bg-[#E67E22] text-white",
      titleClass: "text-[11px] sm:text-[12px] font-extrabold text-navy tracking-tight",
      artistClass: "text-[8px] sm:text-[9px] text-navy/60 font-semibold",
      safeWidth: "140px",
      holeClass: "w-[24%] h-[24%]"
    };
  }
  
  if (S <= 2) {
    return {
      albumClass: "w-14 h-14 border-navy/20 shadow-md",
      badgeClass: "w-5.5 h-5.5 text-[9px] -top-2.5 -left-2.5 bg-cream text-navy",
      titleClass: "text-[9.5px] sm:text-[10.5px] font-bold text-navy tracking-tight",
      artistClass: "text-[7.5px] sm:text-[8.5px] text-navy/60",
      safeWidth: "110px",
      holeClass: "w-[22%] h-[22%]"
    };
  }
  
  if (S <= 4) {
    return {
      albumClass: "w-11 h-11 border-navy/20 shadow-md",
      badgeClass: "w-5 h-5 text-[8.5px] -top-2 -left-2 bg-cream text-navy",
      titleClass: "text-[8px] sm:text-[9px] font-bold text-navy tracking-tight",
      artistClass: "text-[6px] sm:text-[7px] text-navy/60",
      safeWidth: "90px",
      holeClass: "w-[22%] h-[22%]"
    };
  }

  // S가 5 이상 아무리 커져도 공간이 보장되므로, 쾌적하게 볼 수 있는 고정 사이즈를 반환합니다.
  return {
    albumClass: "w-9 h-9 border-navy/15 shadow-sm",
    badgeClass: "w-4 h-4 text-[7px] -top-1.5 -left-1.5 bg-cream text-navy",
    titleClass: "text-[7.5px] sm:text-[8px] font-bold text-navy tracking-tight",
    artistClass: "text-[6px] sm:text-[6.5px] text-navy/60",
    safeWidth: "80px", // 텍스트가 16자까지 들어갈 넉넉한 너비
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
    setIsStarted(true);
  }, []);

  const { pathData, points, viewBoxHeight, cameraKeyframes, totalPathLength } = useMemo(() => {
    if (!tracks || tracks.length === 0) return { pathData: "", points: [], viewBoxHeight: 600, cameraKeyframes: [], totalPathLength: 1 };

    const sizes = getRowSizes(tracks.length); 
    const maxS = sizes[sizes.length - 1]; // 가장 넓은 맨 아랫줄의 곡 개수
    
    // 2. 가상 좌표계 무한 확장 (Expansion Factor)
    // 한 줄에 5곡이 들어갈 때를 기본 1배수(100%)로 보고, 노드가 늘어나면 캔버스를 강제로 좌우로 찢어 넓힙니다.
    const expansionFactor = Math.max(1, maxS / 5); 

    const PADDING_Y = 80;
    const ROW_HEIGHT = 145; 
    const VIEW_HEIGHT = Math.max(600, (sizes.length - 1) * ROW_HEIGHT + PADDING_Y * 2);

    let calculatedPoints: { x: number, y: number, trackIdx: number, rank: number, track: Track, rowCapacity: number }[] = [];
    let trackIdx = tracks.length - 1;
    let isLeftToRight = false;

    const rowInfos = [];

    for (let r = sizes.length - 1; r >= 0; r--) {
      let S = sizes[r];
      const rowNodes: { x: number, y: number, trackIdx: number, rank: number, track: Track, rowCapacity: number }[] = new Array(S);

      for (let c = 0; c < S; c++) {
        // 기존 0~100 사이의 상대 비율 좌표 (정중앙은 50)
        const p = (c + 0.5) * (100 / S);
        
        // 정중앙(50)을 기준으로 확장 팽창 계수(expansionFactor)를 곱하여 물리적으로 위치를 벌려줍니다.
        // ex) 200곡일 때 좌우 끝 좌표는 -150% ~ 250% 까지 뻗어나가며, ResultPage의 카메라가 이를 알아서 스캔합니다!
        const x = 50 + (p - 50) * expansionFactor;
        
        const y = PADDING_Y + r * ROW_HEIGHT;
        const ti = isLeftToRight ? (trackIdx - c) : (trackIdx - (S - 1 - c));
        rowNodes[c] = { x, y, trackIdx: ti, rank: ti + 1, track: tracks[ti], rowCapacity: S };
      }

      trackIdx -= S;
      
      if (isLeftToRight) {
        calculatedPoints.push(...rowNodes);
      } else {
        calculatedPoints.push(...[...rowNodes].reverse());
      }
      
      rowInfos.push({
        r,
        y: PADDING_Y + r * ROW_HEIGHT,
        isLeftToRight,
        nodes: isLeftToRight ? rowNodes : [...rowNodes].reverse()
      });
      
      isLeftToRight = !isLeftToRight;
    }

    let d = "";
    const cameraKeyframes: {x: number, y: number}[] = [];
    const pointsWithDistance: { x: number, y: number, trackIdx: number, rank: number, track: Track, rowCapacity: number, distance: number }[] = [];
    let accumulatedDistance = 0;
    const scaleY = (100 * 16 / 9) / VIEW_HEIGHT;

    if (rowInfos.length > 0) {
      let firstRow = rowInfos[0];
      let startNode = firstRow.nodes[0];
      d = `M ${startNode.x} ${startNode.y}`;
      cameraKeyframes.push({ x: startNode.x, y: startNode.y });

      pointsWithDistance.push({ ...startNode, distance: 0 });

      for (let i = 0; i < rowInfos.length; i++) {
        let row = rowInfos[i];
        
        for (let c = 0; c < row.nodes.length - 1; c++) {
          let p0 = row.nodes[c];
          let p3 = row.nodes[c + 1];
          let sag = 0; 
          
          let p1x = p0.x + (p3.x - p0.x) / 3;
          let p1y = p0.y + sag;
          let p2x = p0.x + 2 * (p3.x - p0.x) / 3;
          let p2y = p3.y + sag;
          
          d += ` C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3.x} ${p3.y}`;
          
          const segmentLen = Math.abs(p3.x - p0.x);
          accumulatedDistance += segmentLen;
          pointsWithDistance.push({ ...p3, distance: accumulatedDistance });
          
          cameraKeyframes.push({ x: p0.x + (p3.x - p0.x) * 0.33, y: p0.y + sag });
          cameraKeyframes.push({ x: p0.x + (p3.x - p0.x) * 0.66, y: p0.y + sag });
          cameraKeyframes.push({ x: p3.x, y: p3.y });
        }

        if (i < rowInfos.length - 1) {
          let nextRow = rowInfos[i + 1];
          let p0 = row.nodes[row.nodes.length - 1];
          let p3 = nextRow.nodes[0];
          
          // 가상 캔버스가 확장된 만큼 곡선(Turn Width)도 비례해서 우아하게 넓혀줍니다.
          let turnWidth = 10 * expansionFactor; 
          let isRightSide = row.isLeftToRight;
          let p1x = isRightSide ? p0.x + turnWidth : p0.x - turnWidth;
          let p1y = p0.y - 30;
          let p2x = isRightSide ? p3.x + turnWidth : p3.x - turnWidth;
          let p2y = p3.y + 30;
          
          d += ` C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3.x} ${p3.y}`;
          
          const turnLen = getBezierLength(
            { x: p0.x, y: p0.y * scaleY },
            { x: p1x, y: p1y * scaleY },
            { x: p2x, y: p2y * scaleY },
            { x: p3.x, y: p3.y * scaleY }
          );
          accumulatedDistance += turnLen;
          pointsWithDistance.push({ ...p3, distance: accumulatedDistance });

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

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.02, delayChildren: 0.05 }
    }
  };

  const nodeVariants = {
    hidden: { scale: 0, y: 15 },
    visible: { 
      scale: 1, y: 0,
      transition: { type: "spring" as const, stiffness: 450, damping: 24 }
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" style={{ height: `${viewBoxHeight}px` }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(230, 126, 34, 0.7); }
          70% { box-shadow: 0 0 0 15px rgba(230, 126, 34, 0); }
          100% { box-shadow: 0 0 0 0 rgba(230, 126, 34, 0); }
        }
        @keyframes winnerBounce {
          0%, 100% { transform: scale(1.25) translateY(0); }
          50% { transform: scale(1.32) translateY(-6px); }
        }
        .animate-pulse-ring { animation: pulseRing 2s infinite; }
        .animate-winner-highlight { animation: winnerBounce 2s ease-in-out infinite; }
      `}} />

      {/* overflow="visible"를 통해 마이너스 좌표나 100%를 초과하는 확장 좌표계의 선도 모두 화면에 렌더링되게 허용합니다 */}
      <svg 
        viewBox={`0 0 100 ${viewBoxHeight}`} 
        className="absolute top-0 w-full z-0 h-full drop-shadow-md"
        preserveAspectRatio="none"
        overflow="visible" 
      >
        <path d={pathData} fill="none" stroke="rgba(26,42,108,0.05)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        
        <motion.path 
          d={pathData} 
          fill="none" 
          stroke="#E67E22" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={isCompleted ? { duration: 0.1 } : { delay: 1.0, duration: drawDuration, ease: "linear" }}
        />
      </svg>

      <motion.div 
        className="relative z-10 w-full"
        style={{ height: `${viewBoxHeight}px` }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {points.map((pt) => {
          const isWinner = pt.rank === 1;
          const dims = getNodeDimensions(pt.rowCapacity, isWinner);
          
          // 계산된 무한 확장 팽창 좌표(x%)를 그대로 left에 주입
          const leftPercent = `${pt.x}%`;
          const topPercent = `${(pt.y / viewBoxHeight) * 100}%`;

          const pathFraction = pt.distance / totalPathLength;
          // 카메라가 도달하기 2.5초 전에 선명해지도록 처리 (충분한 시각적 대비 및 인지 시간 확보)
          const lightUpDelay = isCompleted ? 0 : Math.max(0, 1.0 + pathFraction * drawDuration - 2.5);
          
          const lightUpStyle: React.CSSProperties = isCompleted
            ? { opacity: 1.0, filter: "blur(0px) grayscale(0%)" }
            : {
                opacity: isStarted ? 1.0 : 0.42,
                filter: isStarted ? "blur(0px) grayscale(0%)" : "blur(1.8px) grayscale(15%)",
                transition: "opacity 0.15s ease-out, filter 0.15s ease-out", 
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
                  {/* CD 커버, 뱃지, 레코드 구멍이 서로 어긋나지 않도록 강력한 래퍼(Wrapper)로 묶음 */}
                  <div className="relative flex flex-col items-center">
                    {isWinner && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 text-yellow-500 text-base drop-shadow-md select-none animate-bounce">
                        👑
                      </div>
                    )}

                    <div className={`absolute rounded-full flex items-center justify-center font-serif font-bold z-30 shadow-md border border-white ${dims.badgeClass}`}>
                      {pt.rank}
                    </div>
                    
                    <div 
                      className={`relative rounded-full overflow-hidden border-2 ${dims.albumClass}`}
                      style={{
                        maskImage: "radial-gradient(circle, transparent 12%, black 12.5%)",
                        WebkitMaskImage: "radial-gradient(circle, transparent 12%, black 12.5%)"
                      }}
                    >
                      <Image src={pt.track.albumImage} alt={pt.track.title} fill className="object-cover" />
                    </div>
                    
                    {/* 레코드 구멍 테두리가 무조건 앨범 이미지 정중앙에 고정됨 */}
                    <div className={`absolute inset-0 m-auto ${dims.holeClass} border border-[#E67E22]/30 bg-transparent rounded-full pointer-events-none z-20`} />
                  </div>
                  
                  {/* 텍스트 영역을 absolute로 분리해 정렬 왜곡 원천 차단 */}
                  <div 
                    className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 flex flex-col items-center transition-all ${isWinner ? 'scale-110' : 'scale-100'}`}
                    style={{ width: dims.safeWidth }}
                  >
                    <p className={`${dims.titleClass} line-clamp-3 break-all leading-[1.15] text-center w-full`}>{pt.track.title}</p>
                    <p className={`${dims.artistClass} mt-0.5 line-clamp-1 break-all leading-none text-center w-full`}>{pt.track.artistName}</p>
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
