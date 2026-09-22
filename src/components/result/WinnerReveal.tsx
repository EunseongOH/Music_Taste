"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SafeImage } from "@/components/SafeImage";
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
  isSingleArtistMode: boolean;
  /** 이 취향표의 주인 이름. 없으면 문구에서 이름을 뺀다. */
  nickname?: string | null;
  locale: "ko" | "en";
  onContinue: () => void;
  /** 점검 페이지처럼 틀 안에 넣을 때: 화면 높이 대신 부모 높이를 채운다. */
  embedded?: boolean;
}

/** 결승 두 곡을 보여 주는 시간. 이만큼 지나면 1위 커버가 위로 올라가 자리를 잡는다. */
const REVEAL_MS = 2200;

const copy = {
  ko: { cta: "취향표 보기" },
  en: { cta: "See my taste card" },
};

/**
 * 월드컵이 끝난 직후의 "최종 1위" 화면.
 *
 * 두 장면이다.
 *  1) 결승 두 곡 — 1위가 앞에, 진 곡이 뒤로 물러나 흐리게.
 *  2) 1위 커버가 위로 올라가 화면 폭을 채우고, 그 위에 한 줄이 얹힌다.
 *
 * 둘째 장면은 같이 소트하기 초대 화면(`app/together/[code]/page.tsx`)과 같은 문법이다 —
 * 사진이 위를 덮고 아래로 갈수록 바탕색에 수렴하며, 글자는 그 아래쪽에 앉는다.
 * 두 화면이 한 서비스로 읽히려면 "사진 위에 한 줄" 이라는 형식이 같아야 한다.
 *
 * 숫자를 따로 적지 않는다. 예전에는 "5곡 중 마지막까지 남은 곡이에요" 와
 * "4번 골라서 찾은 1위예요" 를 줄마다 늘어놓고, 결승 상대를 연출로 보여 주고도
 * 아래에 글로 또 적었다. 한 줄이 그 일을 다 한다.
 */
export default function WinnerReveal({
  champion,
  runnerUp,
  championOnLeft,
  totalTracks,
  isSingleArtistMode,
  nickname,
  locale,
  onContinue,
  embedded = false,
}: WinnerRevealProps) {
  const t = copy[locale] ?? copy.ko;
  const reduce = useReducedMotion();
  const side = championOnLeft ? -1 : 1;

  // 동작 줄이기를 켰으면 결승 장면을 건너뛰고 마지막 모습으로 바로 간다.
  const [revealed, setRevealed] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  /*
   * `'{아티스트}' {n}곡 중 {닉네임}님의 1위곡은 '{곡제목}'`
   *
   * 없는 조각은 통째로 뺀다 — "님" 앞이 비거나 따옴표만 남으면 고장으로 보인다.
   *  - 이름이 없으면(비로그인·닉네임 미확정) "{닉네임}님의" 를 뺀다
   *  - 여러 아티스트가 섞인 판이면 아티스트 자리를 뺀다(지금은 믹스 매치가 꺼져 있어
   *    새로 생기지 않지만, 예전 취향표를 열면 나온다)
   */
  const head = [
    isSingleArtistMode && champion.artistName ? `'${champion.artistName}'` : null,
    `${totalTracks}곡 중`,
    nickname ? `${nickname}님의` : null,
    "1위곡은",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.main
      /*
       * 좌우 여백을 main 이 아니라 안쪽 블록이 가진다. 1위 커버는 화면 폭을 꽉
       * 채워야 하는데, main 에 px 를 주면 그만큼 밖으로 빼내는 계산이 또 필요하다.
       */
      className={`${embedded ? "h-full" : "min-h-screen"} bg-[var(--app-bg)] flex flex-col pb-8`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      // 기다리기 싫은 사람은 눌러서 건너뛴다.
      onClick={() => setRevealed(true)}
    >
      <div className={revealed ? "relative" : "flex-1 flex items-center justify-center relative px-6"}>
        {/* 결승 상대: 1위 뒤로 물러나 흐리게. 자리를 잡고 나면 사라진다. */}
        {runnerUp && !revealed && (
          <motion.div
            exit={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            className="absolute w-[101px] h-[101px] rounded-[4px] overflow-hidden grayscale"
            style={{ transform: `translate(${-side * 132}px, 22px)` }}
          >
            <SafeImage src={runnerUp.albumImage} alt="" fill sizes="101px" fallbackType="track" className="object-cover" />
          </motion.div>
        )}

        <motion.div
          layout
          transition={{ type: "tween", ease: "circOut", duration: 0.6 }}
          className={
            revealed
              ? "relative w-full h-[320px] overflow-hidden"
              : "relative z-10 w-[217px] h-[217px] rounded-[4px] overflow-hidden shadow-[0_18px_40px_-16px_rgba(var(--t-ink-rgb),0.55)]"
          }
        >
          <SafeImage
            src={champion.albumImage}
            alt={champion.title}
            fill
            sizes="(max-width: 430px) 100vw, 430px"
            fallbackType="track"
            className="object-cover"
          />
          {/*
           * 딤은 위에서부터 시작해 아래로 갈수록 바탕색에 닿는다(초대 화면과 같은 값).
           * 글자가 앉는 아래쪽은 사실상 크림 바탕이라, 커버가 밝든 어둡든 네이비 글자가
           * 그대로 읽힌다. 밝은 커버에서 대비가 무너지는 자리를 없애는 방법이다.
           */}
          {revealed && (
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45 }}
              className="absolute inset-0 bg-gradient-to-b from-[var(--app-bg)]/20 via-[var(--app-bg)]/85 to-[var(--app-bg)]"
            />
          )}
        </motion.div>

        {revealed && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.25 }}
            className="absolute inset-x-0 bottom-0 px-6 pb-5"
          >
            <h1 className="type-title-1 text-navy break-keep text-balance">
              <span className="font-normal text-navy/70">{head} </span>
              &apos;{champion.title}&apos;
            </h1>
          </motion.div>
        )}
      </div>

      {revealed && <div className="flex-1" />}

      <div className="px-6 pt-8">
        <button type="button" className={`${primaryButton} w-full`} onClick={onContinue}>
          {t.cta}
        </button>
      </div>
    </motion.main>
  );
}
