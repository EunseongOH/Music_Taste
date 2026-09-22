"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Disc } from "lucide-react";

/*
 * 곡을 모으는 동안 보여 주는 화면.
 *
 * 전곡 모드(/tracks)와 같이 소트하기 만들기(/together/new)가 같이 쓴다.
 * 두 모드는 같은 일을 기다리게 하는데 — 아티스트를 고르고 그 곡이 다 올 때까지 —
 * 한쪽은 도는 LP 한 장을 띄우고 다른 쪽은 버튼 글자만 바뀌어서, 같은 서비스의
 * 같은 순간이 다르게 느껴졌다.
 *
 * 원래 모습(2026-09-22 이전)은 docs/design-system/loading.md 에 적어 뒀다.
 */

const copy = {
  ko: (artist?: string | null) => (artist ? `${artist} 곡을 모으고 있어요` : "곡을 모으고 있어요"),
  en: (artist?: string | null) => (artist ? `Gathering ${artist}'s songs` : "Gathering songs"),
};

interface Props {
  /** 누구의 곡을 모으는지. 아직 모르면 비워 둔다 */
  artist?: string | null;
  locale?: "ko" | "en";
}

export default function LoadingScreen({ artist, locale = "ko" }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col min-h-screen w-full items-center justify-center gap-6 px-8 text-center bg-[var(--app-bg)]">
      <motion.div
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="relative w-20 h-20 flex items-center justify-center text-point opacity-80"
        aria-hidden
      >
        <Disc size={80} strokeWidth={1} />
      </motion.div>
      {/*
       * 화면이 바뀐 걸 읽어 주는 건 이 한 줄이다. role="status" 로 두면
       * 화면을 안 보는 사람에게도 "기다리는 중" 이 전해진다.
       */}
      <p role="status" className="type-title-2 text-navy">
        {(copy[locale] ?? copy.ko)(artist)}
      </p>
    </div>
  );
}
