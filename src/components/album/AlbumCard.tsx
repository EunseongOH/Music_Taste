"use client";

import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SafeImage } from "@/components/SafeImage";

/*
 * 앨범 카드 — 2열 그리드에서 하나를 펼치면 폭을 다 쓰고 수록곡이 내려온다.
 *
 * 전곡 모드(/tracks)와 같이 소트하기 만들기(/together/new)가 같은 화면을 쓴다.
 * 원래 세 벌(발매·미발매·같이 소트하기)이 따로 있어서 한쪽만 고치면 다른 쪽이
 * 달라졌다. 모양·모션은 여기서만 정하고, 펼친 뒤 무엇을 보여줄지(곡 줄·버튼)는
 * children 으로 각 화면이 넣는다.
 */

/** 펼침 전환. 두 화면의 펼침이 다르게 느껴지면 안 되므로 여기 한 곳에만 둔다. */
export const albumTransition = { type: "tween" as const, ease: "circOut" as const, duration: 0.45 };

/**
 * 한 번에 하나만 펼친다. 다른 앨범을 열면 먼저 것이 닫히고, 열린 카드는 화면
 * 위쪽으로 올려 준다 — 아래쪽 앨범을 누르면 곡 목록이 화면 밖에 생긴다.
 *
 * 옮기는 시점을 전환(0.45s)이 끝난 뒤로 미루는 이유: 먼저 열려 있던 앨범이
 * 닫히면서 이 카드의 자리가 위로 올라온다. 전환 중에 재면 엉뚱한 곳으로 간다.
 *
 * @param onOpen 펼칠 때 한 번 불린다. 전곡 모드는 여기서 수록곡을 받아 온다.
 */
export function useAlbumAccordion(onOpen?: (id: string) => void) {
  const [openId, setOpenId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const reduceMotion = useReducedMotion();

  const toggle = (id: string) => {
    const willOpen = openId !== id;
    setOpenId(willOpen ? id : null);
    if (!willOpen) return;
    onOpen?.(id);
    window.setTimeout(() => {
      const el = refs.current.get(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 이미 화면 위쪽에 잘 보이면 움직이지 않는다(쓸데없이 튀지 않게).
      if (top >= 8 && top <= window.innerHeight * 0.3) return;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }, 470);
  };

  const cardRef = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  return { openId, setOpenId, toggle, cardRef, reduceMotion };
}

/**
 * 앨범을 몇 장씩 끊어 보여 준다.
 *
 * 앨범을 많이 낸 아티스트에서는 목록 아래에 있는 것들(미발매곡 추가, 오류 제보,
 * 만들기 버튼)까지 스크롤이 너무 길어 사실상 못 쓴다. 페이지 번호가 아니라
 * "더 보기"로 뒤에 붙이는 이유: 앨범이 사라지지 않으므로 펼쳐 둔 앨범도,
 * 골라 둔 곡도 그대로 있다. 페이지를 넘기며 뭘 접을지 정할 일이 없다.
 *
 * @param pageSize 한 번에 보여 줄 장수. 주지 않으면 전부 보여 준다.
 * @param resetKey 이게 바뀌면 처음 한 묶음으로 돌아간다(보통 아티스트 id).
 */
export function useAlbumPaging(total: number, pageSize?: number, resetKey?: string | null) {
  const [pages, setPages] = useState(1);
  // 되돌리기는 effect 가 아니라 렌더 중에 한다 — effect 로 하면 한 번 옛 묶음을 그린 뒤
  // 다시 그려서 화면이 깜빡인다(React 가 권하는 "prop 이 바뀌면 state 조정" 꼴).
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPages(1);
  }
  const shown = pageSize ? Math.min(total, pages * pageSize) : total;
  return { shown, hasMore: shown < total, more: () => setPages((n) => n + 1) };
}

interface AlbumCardProps {
  id: string;
  title: string;
  cover: string;
  /** 재킷이 깨질 때 쓸 두 번째 후보(Spotify 가 주는 작은 판) */
  coverFallback?: string;
  /** 제목 아래 한 줄 — "정규 • 2019", "2019 · 12곡" 처럼 화면마다 다르다 */
  meta: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** 고른 곡 수. 0 이면 배지를 달지 않는다 */
  badge?: number;
  /** LP 연출을 건너뛸지. useAlbumAccordion 이 주는 값을 그대로 넘긴다 */
  reduceMotion?: boolean | null;
  cardRef?: (el: HTMLElement | null) => void;
  /** 펼쳤을 때 재킷 아래로 내려오는 것 — 수록곡 줄, 버튼 */
  children: ReactNode;
}

export function AlbumCard({
  id,
  title,
  cover,
  coverFallback,
  meta,
  open,
  onToggle,
  badge = 0,
  reduceMotion,
  cardRef,
  children,
}: AlbumCardProps) {
  return (
    <motion.li
      layout
      transition={albumTransition}
      key={id}
      ref={cardRef}
      /*
       * 펼친 앨범의 면은 아주 옅게만 둔다(그림자·테두리 없음). 접힌 카드와 나란히
       * 놓이는 화면이라 그보다 무거우면 카드가 아니라 창처럼 읽힌다.
       * 색은 토큰으로 — 디자인 톤이 바뀔 때 이 자리도 따라와야 한다.
       */
      className={`flex flex-col relative scroll-mt-4 ${open ? "col-span-2 bg-navy/5 rounded-[2rem] p-4 z-10" : "col-span-1"}`}
    >
      <motion.div
        layout
        transition={albumTransition}
        className={`flex ${open ? "flex-col items-center mb-5 z-20 relative" : "flex-col gap-2"}`}
      >
        <div className={`relative flex justify-center items-center w-full ${open ? "mb-3 mt-4" : ""}`}>
          {/* 펼치면 재킷 뒤에서 LP 가 빠져나온다 */}
          <AnimatePresence>
            {open && !reduceMotion && (
              <motion.div
                initial={{ x: 0, opacity: 0, rotate: -45 }}
                animate={{ x: "40%", opacity: 1, rotate: 0 }}
                exit={{ x: 0, opacity: 0, rotate: -45 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="absolute top-0 bottom-0 my-auto w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full z-0 flex items-center justify-center pointer-events-none"
                style={{
                  background: "radial-gradient(circle, #222 0%, #0a0a0a 100%)",
                  boxShadow: "inset 0 0 10px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.3)",
                }}
              >
                {/* 소리골 */}
                <div className="absolute inset-[3px] sm:inset-[5px] border border-white/5 rounded-full" />
                <div className="absolute inset-[7px] sm:inset-[11px] border border-white/5 rounded-full" />
                <div className="absolute inset-[12px] sm:inset-[19px] border border-white/5 rounded-full" />
                <div className="absolute inset-[18px] sm:inset-[29px] border border-white/5 rounded-full" />
                {/* 가운데 라벨 */}
                <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full relative overflow-hidden border-2 border-[#111]">
                  <SafeImage src={cover} fallbackSrc={coverFallback} alt={title} fill fallbackType="track" className="object-cover" />
                </div>
                {/* 가운데 구멍 */}
                <div className="absolute w-1.5 h-1.5 bg-cream rounded-full z-10" />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            layout
            transition={albumTransition}
            onClick={onToggle}
            aria-expanded={open}
            style={{ borderRadius: open ? "0.2rem" : "2rem" }}
            className={`relative aspect-square shrink-0 overflow-hidden z-10 cursor-pointer ${
              open ? "w-20 sm:w-28 md:w-32 shadow-xl" : "w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]"
            }`}
          >
            <SafeImage
              src={cover}
              fallbackSrc={coverFallback}
              alt={title}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              fallbackType="track"
              className="object-cover"
            />
            {badge > 0 && (
              <span className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-point text-white font-num text-xs font-bold flex items-center justify-center shadow-md">
                {badge}
              </span>
            )}
          </motion.button>
        </div>

        <motion.button
          layout
          transition={albumTransition}
          onClick={onToggle}
          aria-expanded={open}
          className={`flex flex-col justify-center cursor-pointer ${open ? "w-full text-center" : "px-2 text-left"}`}
        >
          <span className="type-body-strong text-navy line-clamp-1">{title}</span>
          <span className="type-caption text-navy/70">{meta}</span>
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -15 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -15, transition: { duration: 0.3 } }}
            transition={albumTransition}
            className="flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
