"use client";

import React, { useEffect, useRef } from "react";
import { CARD_PALETTES, type CardPalette } from "@/components/result/cardPalette";

/**
 * 카드 색 조합 고르기.
 *
 * 부가 기능이라 자리를 거의 차지하지 않는다 — 평소에는 **지금 색을 보여주는 동그라미
 * 하나**이고, 누르면 그 위로 색칩 일곱 개가 가로로 펼쳐진다.
 *
 * 칩을 눌러도 **닫지 않는다.** 여러 색을 빠르게 견줘 보는 것이 이 기능의 전부라,
 * 한 번 누를 때마다 닫히면 그걸 할 수 없다. 바깥을 누르면 닫힌다.
 *
 * 저장·공유 이미지에는 들어가지 않는다(카드 밖에 있다).
 */
export default function PalettePicker({
  value,
  onChange,
  open,
  onOpenChange,
  label = "카드 색 바꾸기",
  defaultLabel = "기본 색으로",
}: {
  /** null 이면 앱 테마 그대로 — 아무것도 고르지 않은 상태다. */
  value: CardPalette | null;
  onChange: (p: CardPalette | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  defaultLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다. Esc 로도 닫는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrap} className="relative">
      {open && (
        /*
         * 트리거 **위로** 띄운다. 아래는 화면 끝이라 잘린다.
         * 칩이 일곱 개라 좁은 화면에서도 한 줄에 들어가게 36px + gap 으로 잡았다.
         */
        <div
          role="radiogroup"
          aria-label={label}
          className="absolute bottom-[calc(100%+8px)] left-0 flex gap-1.5 p-2 rounded-full bg-cream border border-navy/15 shadow-lg"
        >
          {/*
            첫 칸은 **기본으로 되돌리기**. 앱 테마 색이라 고정 값이 없어 화면의 토큰을
            그대로 보여준다. 이게 없으면 한 번 고른 뒤 원래 색으로 돌아갈 길이 없다.
          */}
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label={defaultLabel}
            onClick={() => onChange(null)}
            className={`w-9 h-9 rounded-full bg-cream cursor-pointer transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)] ${
              value === null ? "ring-2 ring-offset-2 ring-navy ring-offset-cream" : "border border-navy/15"
            }`}
          >
            <span aria-hidden className="block w-3 h-3 rounded-full mx-auto bg-point-ink" />
          </button>

          {CARD_PALETTES.map((p) => {
            const on = p.id === value?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p.name}
                onClick={() => onChange(p)}
                className={`w-9 h-9 rounded-full cursor-pointer transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)] ${
                  on ? "ring-2 ring-offset-2 ring-navy ring-offset-cream" : "border border-navy/15"
                }`}
                style={{ background: p.cardBg }}
              >
                {/* 바탕만으로는 조합을 알 수 없다. 포인트색 점을 하나 얹는다. */}
                <span
                  aria-hidden
                  className="block w-3 h-3 rounded-full mx-auto"
                  style={{ background: p.cardAccent }}
                />
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="w-10 h-10 rounded-full bg-cream border border-navy/15 shadow-md cursor-pointer transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)]"
        style={value ? { background: value.cardBg } : undefined}
      >
        <span
          aria-hidden
          className={`block w-3.5 h-3.5 rounded-full mx-auto ${value ? "" : "bg-point-ink"}`}
          style={value ? { background: value.cardAccent } : undefined}
        />
      </button>
    </div>
  );
}
