"use client";

import React, { useState } from "react";
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
  /** 결승 대진의 왼쪽이 1위였는지. 실제로 겨룬 자리 그대로 시작한다. */
  championOnLeft: boolean;
  totalTracks: number;
  /** 실제로 고른 횟수(빼기로 넘어간 매치는 제외). */
  choices: number;
  isSingleArtistMode: boolean;
  locale: "ko" | "en";
  onContinue: () => void;
}

const copy = {
  ko: {
    single: "최애 곡 줄 세우기",
    multi: "믹스 매치 월드컵",
    trackCount: (n: number) => `${n}곡`,
    final: "결승전",
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
    final: "Final",
    winner: "No. 1",
    lastStanding: (n: number) => `The last song standing out of ${n}`,
    choices: (n: number) => `Found after ${n} picks`,
    rival: "Final opponent",
    cta: "See my taste card",
  },
};

/**
 * 월드컵이 끝난 직후의 1위 공개 — 결승전을 되짚는다.
 *
 * 숫자를 세는 연출 대신, 이 사람이 실제로 한 선택(결승에서 무엇을 이겼는지,
 * 몇 번 골랐는지)을 보여준다. 이 화면은 이미지로 저장되지 않으므로
 * html-to-image 제약(필터·그림자)을 신경 쓰지 않아도 된다.
 *
 * 동작 줄이기 설정이거나 화면을 한 번 누르면 마지막 장면으로 바로 간다.
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
}: WinnerRevealProps) {
  const t = copy[locale];
  const reduce = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const instant = !!reduce || skipped;

  /** 연출 시각(초). instant 면 모두 0 이라 같은 DOM 이 최종 상태로 바로 그려진다. */
  const at = (delay: number, duration = 0.5) =>
    instant ? { duration: 0, delay: 0 } : { duration, delay, ease: [0.2, 0.8, 0.2, 1] as const };

  const side = championOnLeft ? -1 : 1;
  const meta = [
    isSingleArtistMode ? champion.artistName : null,
    isSingleArtistMode ? t.single : t.multi,
    t.trackCount(totalTracks),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main
      className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-8 select-none"
      onClick={() => setSkipped(true)}
    >
      <p className="type-caption text-navy/70">{meta}</p>

      {/* 무대와 곡 정보를 화면 가운데에 모은다. 위에만 몰리면 아래가 비어 보인다. */}
      <div className="flex-1 flex flex-col justify-center">
      {/* 결승 무대 */}
      <div className="relative h-[300px] flex items-center justify-center">
        {runnerUp && (
          <motion.p
            className="absolute top-2 left-0 right-0 text-center type-caption text-navy/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={instant ? { duration: 0 } : { duration: 1.4, times: [0, 0.2, 0.6, 1] }}
          >
            {t.final}
          </motion.p>
        )}

        {runnerUp && (
          <motion.div
            className="absolute w-[140px] h-[140px] rounded-[4px] overflow-hidden"
            initial={{ x: -side * 82, opacity: 0, scale: 0.92 }}
            animate={{
              x: -side * 132,
              y: 22,
              opacity: [0, 1, 0.4],
              scale: 0.72,
              filter: "grayscale(1)",
            }}
            transition={
              instant
                ? { duration: 0 }
                : {
                    opacity: { duration: 1.4, times: [0, 0.35, 1] },
                    default: { duration: 0.8, delay: 0.6, ease: [0.2, 0.8, 0.2, 1] },
                  }
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={runnerUp.albumImage} alt="" className="w-full h-full object-cover" />
          </motion.div>
        )}

        <motion.div
          className="relative z-10 w-[140px] h-[140px] rounded-[4px] overflow-hidden shadow-[0_18px_40px_-16px_rgba(26,42,108,0.55)]"
          initial={runnerUp ? { x: side * 82, opacity: 0, scale: 0.92 } : { opacity: 0, scale: 0.9 }}
          animate={{ x: 0, opacity: 1, scale: 1.55 }}
          transition={
            instant
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.5 },
                  default: { duration: 0.8, delay: runnerUp ? 0.6 : 0.1, ease: [0.2, 0.8, 0.2, 1] },
                }
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={champion.albumImage} alt={champion.title} className="w-full h-full object-cover" />
        </motion.div>
      </div>

      {/* 곡 정보 */}
      <motion.div
        className="mt-6 flex flex-col gap-1"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={at(1.4, 0.6)}
      >
        <span className="type-caption font-semibold text-point-ink">{t.winner}</span>
        <h1 className="type-display text-navy text-balance break-keep line-clamp-3">{champion.title}</h1>
        {!isSingleArtistMode && <p className="type-body text-navy/70">{champion.artistName}</p>}
      </motion.div>

      {/* 이 1위가 나온 과정 */}
      <motion.div
        className="mt-6 flex flex-col gap-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={at(2.0)}
      >
        <p className="type-body text-navy">{t.lastStanding(totalTracks)}</p>
        {choices > 0 && <p className="type-body text-navy/70">{t.choices(choices)}</p>}
      </motion.div>

      {runnerUp && (
        <motion.div
          className="mt-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={at(2.15)}
        >
          <div className="min-w-0">
            <p className="type-caption text-navy/70">{t.rival}</p>
            <p className="type-sub text-navy truncate">
              {runnerUp.title}
              {!isSingleArtistMode && <span className="text-navy/70"> · {runnerUp.artistName}</span>}
            </p>
          </div>
        </motion.div>
      )}

      </div>

      <motion.div
        className="pt-8 flex flex-col items-stretch gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={at(2.6, 0.4)}
      >
        <button
          type="button"
          className={`${primaryButton} w-full`}
          onClick={(e) => {
            e.stopPropagation();
            onContinue();
          }}
        >
          {t.cta}
        </button>
      </motion.div>
    </main>
  );
}
