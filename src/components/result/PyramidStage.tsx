"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import SnakePathTimeline from "@/components/SnakePathTimeline";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

/**
 * 결과 화면의 피라미드 인트로와 피라미드형 화면 보기 — 예전(fe2d1e4 의 ResultScreen) 연출을 그대로 옮겼다.
 *
 * 재생 중에는 화면 전체를 덮고(fixed) 카메라가 3.8배로 뱀 모양 경로를 꼴찌부터 1위까지 따라간 뒤
 * 전체로 빠진다. 끝나면 같은 피라미드가 레이아웃 애니메이션으로 화면 흐름 안에 자리 잡는다.
 * 수치(줌·속도·대기)를 바꾸면 사용자가 고른 "예전 모션"과 달라지므로 그대로 둔다.
 *
 * 저장 이미지(9:16)는 이 화면이 아니라 TasteTemplates 의 PyramidCard 로 만든다.
 */
const S = 3.8;
const START_DELAY = 1.0;
const HOLD_DURATION = 1.5;
const ZOOM_OUT_DURATION = 1.2;

export default function PyramidStage({
  tracks,
  playing,
  onDone,
  skipLabel,
}: {
  tracks: Track[];
  /** true 면 인트로 재생(화면 전체), false 면 완성된 피라미드를 흐름 안에 보여준다 */
  playing: boolean;
  onDone: () => void;
  skipLabel: string;
}) {
  const panDuration = Math.max(12.0, tracks.length * 1.2);
  const totalDuration = START_DELAY + panDuration + HOLD_DURATION + ZOOM_OUT_DURATION;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [rawKeyframes, setRawKeyframes] = useState<{ x: number; y: number }[]>([]);
  const [viewBoxHeight, setViewBoxHeight] = useState(600);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      if (wrapperRef.current) setDimensions({ width: wrapperRef.current.clientWidth, height: wrapperRef.current.clientHeight });
    };
    // ResizeObserver 는 observe 직후 한 번 호출된다 — 첫 크기도 여기서 잡힌다.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const handleLayoutComplete = useCallback((keyframes: { x: number; y: number }[], vbh: number) => {
    setRawKeyframes(keyframes);
    setViewBoxHeight(vbh);
  }, []);

  const cameraRig = useMemo(() => {
    const K = rawKeyframes.length;
    if (K === 0) return null;

    const W = dimensions.width || 360;
    const H = dimensions.height || 500;

    const xKeyframes = rawKeyframes.map((k) => `${(S * W * (50 - k.x)) / 100}px`);
    const yKeyframes = rawKeyframes.map((k) => `${S * (H / 2 - k.y)}px`);

    let totalDist = 0;
    const dists = [0];
    for (let i = 1; i < K; i++) {
      const dx = rawKeyframes[i].x - rawKeyframes[i - 1].x;
      const dyScaled = ((rawKeyframes[i].y - rawKeyframes[i - 1].y) * ((100 * 16) / 9)) / viewBoxHeight;
      totalDist += Math.sqrt(dx * dx + dyScaled * dyScaled);
      dists.push(totalDist);
    }
    if (totalDist === 0) totalDist = 1;

    const startFraction = START_DELAY / totalDuration;
    const panFraction = panDuration / totalDuration;
    const holdEndFraction = startFraction + panFraction + HOLD_DURATION / totalDuration;

    return {
      xKeyframes: [xKeyframes[0], ...xKeyframes, xKeyframes[K - 1], "0px"],
      yKeyframes: [yKeyframes[0], ...yKeyframes, yKeyframes[K - 1], "0px"],
      scaleKeyframes: [S, ...xKeyframes.map(() => S), S, 1],
      times: [0.0, ...dists.map((d) => startFraction + (d / totalDist) * panFraction), holdEndFraction, 1.0],
    };
  }, [rawKeyframes, dimensions, viewBoxHeight, totalDuration, panDuration]);

  return (
    <motion.div
      layout
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className={
        playing
          ? "fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 bg-[#F5F2ED] overflow-hidden flex flex-col"
          : "w-full relative"
      }
    >
      {playing && <div className="absolute inset-0 z-0 bg-[#F5F2ED]" />}

      {playing && (
        <button
          onClick={onDone}
          className="absolute top-4 right-4 z-50 px-3.5 py-1.5 bg-white/90 hover:bg-white text-navy hover:text-point font-bold text-xs rounded-full border border-navy/15 hover:border-point/40 shadow-md backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1"
        >
          {skipLabel}
        </button>
      )}

      <motion.div
        layout
        ref={wrapperRef}
        className={`relative z-10 w-full mt-4 ${playing ? "flex-1 overflow-hidden" : "h-auto overflow-visible pb-20"}`}
      >
        <motion.div
          initial={cameraRig ? { scale: S, x: cameraRig.xKeyframes[0], y: cameraRig.yKeyframes[0] } : false}
          animate={
            !playing
              ? { scale: 1, x: "0px", y: "0px" }
              : cameraRig
              ? { scale: cameraRig.scaleKeyframes, x: cameraRig.xKeyframes, y: cameraRig.yKeyframes }
              : {}
          }
          transition={!playing ? { duration: 0.1 } : { duration: totalDuration, times: cameraRig?.times, ease: "linear" }}
          className={playing ? "w-full h-full origin-center" : "w-full origin-center"}
          style={playing ? {} : { height: viewBoxHeight }}
          onAnimationComplete={() => {
            if (playing && cameraRig) onDone();
          }}
        >
          <SnakePathTimeline tracks={tracks} drawDuration={panDuration} onLayoutComplete={handleLayoutComplete} isCompleted={!playing} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
