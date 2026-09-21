"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
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

/**
 * 턴테이블. 홈과 월드컵 아래에 놓이는 장식이다 — 어느 화면에서도 주인공이 아니다.
 *
 * 테마에 따라 모양이 갈린다. legacy 클래스는 한 글자도 바꾸지 않았고, 새 테마의 모양은 전부 `newtone:` 변형으로
 * 같은 요소에 덧붙였다(요소를 새로 만들거나 없애지 않는다). docs/design-system/color.md 7-1장.
 *
 *  legacy  남색 선화. 바깥 링 176 > 판 160 > 라벨 64. 재킷은 라벨 자리에 80% 농도로.
 *  새 테마 플래터(옅은 원, 바깥 6px 테만 보임) > LP(플래터의 91%, 흰 면 + 또렷한 가장자리 + 홈).
 *          재킷이 올라오면 **픽처 디스크** — 재킷이 LP 면 전체를 덮는다("실제 턴테이블은 LP 가 원형 판의
 *          면적 대부분을 차지한다"). 재킷이 없으면 작은 단색 주황 라벨(LP 의 30%).
 *          받침 안에 들어오는 크기(플래터 136 · LP 124), 파랑 없음, 그림자 없음 — 조용하게.
 */
export default function LPPlayer({ isPlaying = false, currentTrack, onTogglePlay, className = "" }: LPPlayerProps) {
  // 재킷을 받아 올 해상도에만 쓴다. 새 테마에서는 재킷이 LP 전체(최대 168px)라 80px 로는 흐리다.
  // 모양은 전부 CSS(newtone:)가 가르므로 이 값이 늦게 정해져도 깜빡이지 않는다. legacy 는 "80px" 그대로.
  const [newtone, setNewtone] = useState(false);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setNewtone(t === "toss-white" || t === "sky-tint");
  }, []);

  const screw = "w-4 h-4 rounded-full border-2 border-navy/30 newtone:w-3 newtone:h-3 newtone:border newtone:border-navy/10";
  const groove = "rounded-full border border-navy/20 newtone:border-navy/[0.07]";

  return (
    <div className={`relative w-full max-w-lg h-36 sm:h-48 border-2 border-navy rounded-xl px-6 flex flex-col justify-between bg-cream/50 backdrop-blur-sm shadow-sm newtone:border newtone:border-navy/10 newtone:rounded-2xl newtone:bg-white/60 newtone:backdrop-blur-none newtone:shadow-none ${className}`}>
      {/* Turn table structure */}
      <div className={`absolute top-4 left-4 ${screw}`} />
      <div className={`absolute top-4 right-4 ${screw}`} />
      <div className={`absolute bottom-4 left-4 ${screw}`} />
      <div className={`absolute bottom-4 right-4 ${screw}`} />

      {/* Platter and Vinyl */}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        {/* legacy: 바깥 링 / 새 테마: 플래터 */}
        <div className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full border-2 border-navy/20 flex items-center justify-center newtone:w-[8.5rem] newtone:h-[8.5rem] newtone:sm:w-[11.5rem] newtone:sm:h-[11.5rem] newtone:border newtone:border-navy/10 newtone:bg-navy/[0.04]">
          {/* legacy: 판 / 새 테마: LP */}
          <motion.div
            className={`w-40 h-40 sm:w-56 sm:h-56 rounded-full border-2 border-navy flex items-center justify-center shadow-inner overflow-hidden ${currentTrack ? 'bg-[#1a1a1a]' : 'bg-navy/5'} newtone:w-[7.75rem] newtone:h-[7.75rem] newtone:sm:w-[10.5rem] newtone:sm:h-[10.5rem] newtone:border newtone:border-navy/15 newtone:bg-white newtone:shadow-[0_1px_2px_rgba(24,33,59,0.10)]`}
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={
              isPlaying
                ? { repeat: Infinity, duration: 1.2, ease: "linear" }
                : { duration: 1, ease: "easeOut" }
            }
          >
            {/* Record Grooves - Line-art style */}
            <div className={`absolute w-[85%] h-[85%] newtone:w-[90%] newtone:h-[90%] ${groove}`} />
            <div className={`absolute w-[70%] h-[70%] newtone:w-[80%] newtone:h-[80%] ${groove}`} />
            <div className={`absolute w-[55%] h-[55%] newtone:w-[70%] newtone:h-[70%] ${groove}`} />

            {/* Center Label — 새 테마: 재킷이 있으면 LP 전체(픽처 디스크), 없으면 작은 주황 라벨 */}
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${currentTrack ? 'bg-transparent' : 'bg-point'} flex items-center justify-center border-2 border-navy z-10 relative overflow-hidden newtone:border-0 ${
                currentTrack
                  ? "newtone:w-full newtone:h-full newtone:sm:w-full newtone:sm:h-full"
                  : "newtone:w-[30%] newtone:h-[30%] newtone:sm:w-[30%] newtone:sm:h-[30%] newtone:bg-point/85"
              }`}
            >
              {currentTrack && (
                 <Image src={currentTrack.albumImage} alt={currentTrack.title} fill sizes={newtone ? "168px" : "80px"} className="object-cover opacity-80 newtone:opacity-90" />
              )}
              {/* 픽처 디스크도 판이라는 것이 읽히게 아주 옅은 홈 두 줄. 새 테마에서 재킷이 있을 때만. */}
              {currentTrack && (
                <>
                  <span aria-hidden className="hidden newtone:block absolute w-[78%] h-[78%] rounded-full border border-white/25 z-20" />
                  <span aria-hidden className="hidden newtone:block absolute w-[52%] h-[52%] rounded-full border border-white/20 z-20" />
                </>
              )}
              <div
                className={`w-4 h-4 rounded-full bg-cream border-2 border-navy relative z-20 newtone:border-0 newtone:bg-white ${
                  currentTrack ? "newtone:w-3 newtone:h-3 newtone:shadow-[0_0_0_2px_rgba(24,33,59,0.18)]" : "newtone:w-2.5 newtone:h-2.5"
                }`}
              />
            </div>
          </motion.div>
        </div>

        {/* Tonearm — 새 테마에서는 LP 가 작아진 만큼 안쪽으로 당겨 바늘이 판 위에 놓이게 한다 */}
        <motion.div
          className="absolute right-8 top-1/2 -translate-y-1/2 w-4 origin-top z-20 newtone:right-16"
          animate={{ rotate: isPlaying ? 25 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Tonearm Base */}
          <div className="w-8 h-8 rounded-full border-2 border-navy bg-cream absolute -top-4 -left-2 z-20 flex items-center justify-center newtone:w-6 newtone:h-6 newtone:-top-3 newtone:-left-1 newtone:border newtone:border-navy/10 newtone:bg-white">
             <div className="w-3 h-3 rounded-full bg-navy/20 newtone:hidden" />
          </div>
          {/* Arm */}
          <div className="w-2 h-28 sm:h-32 border-x-2 border-t-2 border-navy bg-cream/80 ml-1 rounded-t-full shadow-sm newtone:w-1.5 newtone:h-[5.5rem] newtone:sm:h-28 newtone:ml-[5px] newtone:border newtone:border-navy/10 newtone:bg-white newtone:rounded-full newtone:shadow-none" />
          {/* Head-shell */}
          <div className="w-6 h-10 border-2 border-navy bg-cream -ml-1 rounded-sm shadow-sm flex flex-col items-center pt-1 mt-[-2px] newtone:w-4 newtone:h-7 newtone:ml-0 newtone:border-0 newtone:bg-navy/15 newtone:rounded-md newtone:shadow-none">
             <div className="w-4 h-1 border-b-2 border-navy/50 newtone:hidden" />
             <div className="w-4 h-1 border-b-2 border-navy/50 mt-1 newtone:hidden" />
          </div>
        </motion.div>
      </div>

    </div>
  );
}
