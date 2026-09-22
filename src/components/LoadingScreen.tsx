"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/*
 * 곡을 모으는 동안 보여 주는 화면.
 *
 * 전곡 모드(/tracks)와 같이 소트하기 만들기(/together/new)가 같이 쓴다.
 * 두 모드는 같은 일을 기다리게 하는데 — 아티스트를 고르고 그 곡이 다 올 때까지 —
 * 한쪽은 화면을 덮고 다른 쪽은 버튼 글자만 바뀌어서, 누른 게 먹히지 않은 것처럼
 * 보였다.
 *
 * 진행률은 실제 진행이다. 서버가 앨범을 몇 장 받았는지·곡을 몇 장분 받았는지
 * 흘려보내 주고(`/api/together/catalog?stream=1`) 화면은 그걸 그대로 그린다.
 * 남는 시간을 채우는 가짜 애니메이션은 없다 — 캐시에 다 있으면 순식간에 찬다.
 *
 * 색은 전부 토큰이다. 로고만 테마와 무관한 같은 파일을 쓴다.
 * 바뀌기 전 모습은 docs/design-system/loading.md 에 적어 뒀다.
 */

const copy = {
  ko: (artist?: string | null) =>
    artist ? `${artist} 발매곡 정보를 불러오고 있어요` : "발매곡 정보를 불러오고 있어요",
  en: (artist?: string | null) =>
    artist ? `Loading ${artist}'s releases` : "Loading releases",
};

/**
 * 짧게 끝나는 기다림은 아예 보여 주지 않는다.
 *
 * 캐시에 다 있으면 눈 깜짝할 새에 끝나는데, 그때 로고가 한 번 번쩍이면 오히려
 * 뭔가 잘못된 것처럼 보인다. 실제로 기다린 적이 없으면 기다리라고 하지 않는다.
 * 기다리는 화면을 띄우는 곳마다 같은 기준을 쓰라고 여기 둔다.
 */
export function useSlowEnough(active: boolean, ms = 250): boolean {
  const [slow, setSlow] = useState(false);
  // 꺼질 때는 렌더 중에 되돌린다 — effect 로 미루면 한 프레임 더 남아 깜빡인다.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setSlow(false);
  }
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
  return slow;
}

interface Props {
  /** 누구의 곡을 모으는지. 아직 모르면 비워 둔다 */
  artist?: string | null;
  locale?: "ko" | "en";
  /**
   * 0~1. `null` 은 "하는 중인데 얼마나 남았는지 모른다"(불확정 바), 아예 주지
   * 않으면 바를 달지 않는다 — 셀 것이 없는 기다림에까지 바를 붙이면 그건 장식이다.
   */
  progress?: number | null;
  /**
   * 한 줄 대신 번갈아 보여 줄 문구. 오래 걸리는 기다림에서 같은 글자만 떠 있으면
   * 멈춘 것처럼 보인다. **모듈 상수로 넘길 것** — 렌더마다 새 배열이면 처음으로 돌아간다.
   */
  lines?: readonly string[];
  /** 화면을 덮지 않고 그 자리에만 들어갈 때(2단계 안쪽) */
  inline?: boolean;
}

export default function LoadingScreen({ artist, locale = "ko", progress, lines, inline = false }: Props) {
  const reduceMotion = useReducedMotion();
  const pct = progress === null || progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!lines || lines.length < 2) return;
    const timer = window.setInterval(() => setTurn((n) => n + 1), 2200);
    return () => window.clearInterval(timer);
  }, [lines]);
  const message = lines?.length ? lines[turn % lines.length] : (copy[locale] ?? copy.ko)(artist);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-6 px-8 text-center ${
        inline ? "py-20" : "min-h-screen w-full bg-[var(--app-bg)]"
      }`}
    >
      {/*
       * 로고는 원으로 자른다 — 파일 바탕이 흰색이라 그냥 두면 크림 바탕에
       * 흰 네모가 얹힌다. 마크는 가운데 모여 있어 원 밖으로 잘리는 건 여백뿐이다.
       */}
      <motion.img
        src="/logo-mark-sm.png"
        alt=""
        aria-hidden
        width={80}
        height={80}
        // 새 톤: 흰 원판이 하늘빛 위에 떠 보이게 옅은 잉크 그림자(legacy 는 그대로). 파랑·주황을 더하지 않는다 — color.md 원칙 7.
        className="w-20 h-20 rounded-full newtone:shadow-[0_10px_24px_-10px_rgba(24,33,59,0.28)]"
        animate={reduceMotion ? undefined : { y: [0, -14, 0] }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
      />

      {/*
       * 화면이 바뀐 걸 읽어 주는 건 이 한 줄이다. role="status" 로 두면
       * 화면을 안 보는 사람에게도 "기다리는 중" 이 전해진다.
       */}
      <p role="status" className="type-body-strong text-navy break-keep min-h-[1.5em]">
        {message}
      </p>

      {progress !== undefined && (
      <div
        className="w-full max-w-[240px] h-1.5 rounded-full bg-navy/10 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {pct === null ? (
          // 전체 앨범 수를 아직 모르는 구간. 채울 수가 없으니 "돌고 있다"만 보인다.
          <motion.span
            className="block h-full w-1/3 rounded-full bg-point"
            animate={reduceMotion ? undefined : { x: ["-100%", "300%"] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          />
        ) : (
          /*
           * 값은 띄엄띄엄 온다(요청이 끝날 때마다 한 번). 다음 값까지의 사이를
           * 이 전환이 메워서 계단이 아니라 흐름으로 보이게 한다. 값을 앞질러
           * 채우지는 않는다 — 늘 방금 받은 값까지만 간다.
           */
          <motion.span
            className="block h-full rounded-full bg-point"
            animate={{ width: `${pct}%` }}
            initial={false}
            transition={{ type: "tween", ease: "easeOut", duration: 0.4 }}
          />
        )}
      </div>
      )}
    </div>
  );
}
