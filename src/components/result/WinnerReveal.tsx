"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { primaryButton } from "@/components/space/SpaceUI";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

interface WinnerRevealProps {
  champion: Track;
  /** 결승 상대. 결승을 "빼기"로 끝냈으면 null 로 넘긴다 — 모른다고 뺀 곡을 이긴 상대로 부르지 않는다. */
  runnerUp: Track | null;
  /** 결승 대진의 왼쪽이 1위였는지. 결승 상대 커버를 반대쪽에 둔다. */
  championOnLeft: boolean;
  totalTracks: number;
  /** 실제로 고른 횟수(빼기로 넘어간 매치는 제외). */
  choices: number;
  isSingleArtistMode: boolean;
  locale: "ko" | "en";
  onContinue: () => void;
  /** 점검 페이지처럼 틀 안에 넣을 때: 화면 높이 대신 부모 높이를 채운다. */
  embedded?: boolean;
}

const copy = {
  ko: {
    single: "최애 곡 소트하기",
    multi: "믹스 매치 월드컵",
    trackCount: (n: number) => `${n}곡`,
    winner: "1위",
    lastStanding: (n: number) => `${n}곡 중 마지막까지 남은 곡이에요`,
    choices: (n: number) => `${n}번 골라서 찾은 1위예요`,
    rival: "결승 상대",
    cta: "취향표 보기",
  },
  en: {
    single: "My favorites",
    multi: "Mix match world cup",
    trackCount: (n: number) => `${n} songs`,
    winner: "No. 1",
    lastStanding: (n: number) => `The last song standing out of ${n}`,
    choices: (n: number) => `Found after ${n} picks`,
    rival: "Final opponent",
    cta: "See my taste card",
  },
};

/**
 * 월드컵이 끝난 직후의 "최종 1위" 화면.
 *
 * 단계 연출은 두지 않는다 — 순위가 올라가는 모션은 다음 화면(결과 화면의 피라미드)에서 보여준다.
 * 여기서는 1위와 결승 상대, 이 1위가 나온 과정만 조용히 보여주고 한 번에 넘어간다.
 */
export default function WinnerReveal({
  champion,
  runnerUp,
  championOnLeft,
  totalTracks,
  choices,
  isSingleArtistMode,
  locale,
  onContinue,
  embedded = false,
}: WinnerRevealProps) {
  const t = copy[locale];
  const reduce = useReducedMotion();
  const side = championOnLeft ? -1 : 1;
  const meta = [isSingleArtistMode ? champion.artistName : null, isSingleArtistMode ? t.single : t.multi, t.trackCount(totalTracks)]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.main
      className={`${embedded ? "h-full" : "min-h-screen"} bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-8`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <p className="type-caption text-navy/70">{meta}</p>

      {/* 커버와 곡 정보를 화면 가운데에 모은다. 위에만 몰리면 아래가 비어 보인다. */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="relative h-[260px] flex items-center justify-center">
          {runnerUp && (
            // 결승 상대: 1위 뒤로 물러나 흐리게.
            <div
              className="absolute w-[101px] h-[101px] rounded-[4px] overflow-hidden opacity-40 grayscale"
              style={{ transform: `translate(${-side * 132}px, 22px)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={runnerUp.albumImage} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="relative z-10 w-[217px] h-[217px] rounded-[4px] overflow-hidden shadow-[0_18px_40px_-16px_rgba(26,42,108,0.55)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={champion.albumImage} alt={champion.title} className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-1">
          <span className="type-caption font-semibold text-point-ink">{t.winner}</span>
          <h1 className="type-display text-navy text-balance break-keep line-clamp-3">{champion.title}</h1>
          {!isSingleArtistMode && <p className="type-body text-navy/70">{champion.artistName}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-1">
          <p className="type-body text-navy">{t.lastStanding(totalTracks)}</p>
          {choices > 0 && <p className="type-body text-navy/70">{t.choices(choices)}</p>}
        </div>

        {runnerUp && (
          <div className="mt-5 min-w-0">
            <p className="type-caption text-navy/70">{t.rival}</p>
            <p className="type-sub text-navy truncate">
              {runnerUp.title}
              {!isSingleArtistMode && <span className="text-navy/70"> · {runnerUp.artistName}</span>}
            </p>
          </div>
        )}
      </div>

      <div className="pt-8">
        <button type="button" className={`${primaryButton} w-full`} onClick={onContinue}>
          {t.cta}
        </button>
      </div>
    </motion.main>
  );
}
