"use client";

/**
 * 홈 미리보기 — 실제 홈(`src/app/page.tsx`)은 수정 금지라 같은 구성을 여기서 다시 짠다.
 * 워드마크 · 태그라인 · 카드 4장 캐러셀 · 점 표시 · 시작하기 · 턴테이블을 한 화면으로.
 * 카드는 실제로 갈아 끼울 컴포넌트(`components/home/ModeCard`)를 그대로 쓴다.
 * 문구는 page.tsx 의 것을 옮겨 적었다(2026-09-22, MIX_MATCH 꺼짐 기준 4장).
 */

import React, { useRef, useState } from "react";
import ModeCard from "@/components/home/ModeCard";
import { TurntableStudy, type TurntableLook } from "./Studies";

const MODES = [
  { badge: "아티스트 한 명", title: "최애 곡 소트하기", desc: "한 아티스트의 전곡을 비교하며, 내가 더 좋아하는 곡을 찾아보세요.", btn: "시작하기" },
  { badge: "둘 이상", title: "같이 소트하기", desc: "같은 곡을 각자 소트하고, 취향이 얼마나 닮았는지 확인해요.", btn: "시작하기" },
  { badge: "내 기록", title: "내 취향 스페이스", desc: "내 기록들을 모아두고, 취향이 닮은 리스너도 만나보세요.", btn: "확인하기" },
  { badge: "모두의 취향표", title: "우리의 취향 아카이브", desc: "다른 리스너는 어떤 곡을 더 좋아했을까요? 다양한 취향표를 구경해보세요.", btn: "구경하기" },
];

export default function HomePreview({ look }: { look: TurntableLook }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  };

  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[2rem] border border-navy/10 bg-cream overflow-hidden">
      <div className="flex flex-col items-center px-4 pt-10 pb-8">
        <h4 className="font-wordmark text-5xl text-navy tracking-tight font-bold">Sortify</h4>
        <p className="font-sans text-xs text-charcoal/60 leading-relaxed text-center mt-1">
          좋아하는 곡 중에서도,
          <br />더 마음이 가는 곡을 찾는 곳, Sortify
        </p>

        {/* 캐러셀: 기본 가로 스크롤 + 스냅. 실제 홈은 framer-motion 드래그지만 보이는 결과는 같다. */}
        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setActive(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="w-full max-w-[320px] flex overflow-x-auto snap-x snap-mandatory py-6 mt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MODES.map((m, i) => (
            <div key={m.title} className="w-full px-4 shrink-0 snap-center flex justify-center">
              <ModeCard badge={m.badge} title={m.title} desc={m.desc} tone={i} />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {MODES.map((m, i) => (
            <button
              key={m.title}
              aria-label={m.title}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${active === i ? "w-6 bg-point" : "w-2 bg-navy/20"}`}
            />
          ))}
        </div>

        {/* 실제 홈의 버튼과 같은 모양. 통합 뒤 bg-navy → bg-brand 로 바뀔 자리라 여기서는 brand 로 보여 준다. */}
        <button className="mt-7 px-12 py-3 bg-brand text-cream rounded-full font-semibold text-base shadow-md min-w-[180px]">
          {MODES[active]?.btn ?? "시작하기"}
        </button>

        <div className="w-full mt-10 px-1">
          <TurntableStudy look={look} />
        </div>
      </div>
    </div>
  );
}
