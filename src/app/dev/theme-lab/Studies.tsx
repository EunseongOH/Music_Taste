"use client";

/**
 * 홈의 모드 카드와 턴테이블을 새 톤에서 어떻게 할지 — 세 단계 시안.
 *
 * 실제 홈(`src/app/page.tsx`)과 `LPPlayer` 는 고치지 않는다. 여기는 그 부품을 **복제한 시안**이다.
 *  (a) 색만 교체      형태·선 굵기 그대로, 새 팔레트(2차 토큰)만
 *  (b) 가벼운 조정    구조는 그대로, 테두리·모서리·그림자·면 색만
 *  (c) 재디자인       로고의 부드러운 그라데이션·유리 질감과 이어지는 카드와 LP. 면 위주, 선 최소
 * 로고 마크의 색·모양은 바꾸지 않는다.
 */

import React from "react";
import LPPlayer from "@/components/LPPlayer";

const MODE = {
  badge: "아티스트 한 명",
  title: "최애 곡 소트하기",
  desc: "한 아티스트의 전곡을 비교하며, 내가 더 좋아하는 곡을 찾아보세요.",
};

const LOGO_BLUE = "linear-gradient(135deg, #A0F0FC 0%, #4C9EFE 45%, #4063FB 100%)";
const LOGO_ORANGE = "linear-gradient(135deg, #FDA84B 0%, #FE7045 100%)";

function Label({ step, title, note }: { step: string; title: string; note: string }) {
  return (
    <div className="mb-3">
      <p className="type-body-strong text-navy">
        <span className="text-point-ink mr-1.5">{step}</span>
        {title}
      </p>
      <p className="type-caption text-navy/70 break-keep">{note}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- 모드 카드 */

/** (a) 홈의 마크업 그대로. 크림 면(#FAF7F2 직접 표기)만 토큰 바탕으로 바꿨다. */
function CardA() {
  return (
    <div className="w-full bg-white border-[3px] border-navy rounded-[2.5rem] p-6 shadow-md relative flex flex-col items-center justify-between text-center min-h-[170px]">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center justify-center h-6 px-3.5 bg-point text-white text-[11px] font-sans font-bold rounded-full shadow-sm leading-none whitespace-nowrap">
        {MODE.badge}
      </div>
      <div className="mt-2 w-full flex-1 flex flex-col justify-center">
        <h3 className="text-xl sm:text-2xl text-navy font-black tracking-tight">{MODE.title}</h3>
        <p className="font-sans text-xs text-charcoal/70 leading-relaxed mt-2 break-keep px-2">{MODE.desc}</p>
      </div>
    </div>
  );
}

/** (b) 같은 구조. 3px 테두리 → 옅은 선 + 파란 기가 도는 부드러운 그림자, 모서리 조금 줄임. */
function CardB() {
  return (
    <div className="w-full bg-white border border-line rounded-[2rem] p-6 shadow-[0_10px_30px_-12px_rgba(56,91,240,0.28)] relative flex flex-col items-center justify-between text-center min-h-[170px]">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center justify-center h-6 px-3.5 bg-point text-white type-caption font-bold rounded-full leading-none whitespace-nowrap">
        {MODE.badge}
      </div>
      <div className="mt-2 w-full flex-1 flex flex-col justify-center">
        <h3 className="type-title-1 text-navy">{MODE.title}</h3>
        <p className="type-sub text-navy/70 mt-2 break-keep px-2">{MODE.desc}</p>
      </div>
    </div>
  );
}

/** (c-1) 면 위주. 흰 면 + 로고 그라데이션을 흐리게 깐 빛. 왼쪽 정렬, 배지는 글자로. */
function CardC1() {
  return (
    <div className="w-full rounded-[1.75rem] p-6 relative overflow-hidden min-h-[170px] flex flex-col justify-end bg-white shadow-[0_12px_36px_-14px_rgba(56,91,240,0.35)]">
      <span
        aria-hidden
        className="absolute -top-16 -right-14 w-52 h-52 rounded-full opacity-70 blur-2xl"
        style={{ background: LOGO_BLUE }}
      />
      <span
        aria-hidden
        className="absolute top-7 right-8 w-7 h-7 rounded-full blur-[2px] opacity-90"
        style={{ background: LOGO_ORANGE }}
      />
      <p className="type-caption font-semibold text-brand relative">{MODE.badge}</p>
      <h3 className="type-title-1 text-navy mt-1 relative">{MODE.title}</h3>
      <p className="type-sub text-navy/70 mt-1.5 break-keep relative max-w-[260px]">{MODE.desc}</p>
    </div>
  );
}

/** (c-2) 카드 전체가 로고의 파랑. 글자 대비 때문에 로고보다 어두운 쪽 그라데이션을 쓴다. */
function CardC2() {
  return (
    <div
      className="w-full rounded-[1.75rem] p-6 relative overflow-hidden min-h-[170px] flex flex-col justify-end shadow-[0_14px_36px_-12px_rgba(56,91,240,0.55)]"
      style={{ background: "linear-gradient(140deg, #4063FB 0%, #385BF0 45%, #2B47C9 100%)" }}
    >
      <span aria-hidden className="absolute -top-10 -right-8 w-44 h-44 rounded-full bg-white/25 blur-2xl" />
      <span aria-hidden className="absolute top-7 right-8 w-7 h-7 rounded-full" style={{ background: LOGO_ORANGE }} />
      <p className="type-caption font-semibold text-white/85 relative">{MODE.badge}</p>
      <h3 className="type-title-1 text-white mt-1 relative">{MODE.title}</h3>
      <p className="type-sub text-white/90 mt-1.5 break-keep relative max-w-[260px]">{MODE.desc}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- 턴테이블 */

/** (b) LPPlayer 와 같은 구조. 2px 남색 선 → 옅은 선, 면을 흰색으로, 그림자를 부드럽게. */
function TurntableB() {
  return (
    <div className="relative w-full max-w-lg h-36 sm:h-48 border border-line rounded-2xl px-6 bg-white shadow-[0_10px_30px_-14px_rgba(56,91,240,0.3)] overflow-hidden">
      {["top-4 left-4", "top-4 right-4", "bottom-4 left-4", "bottom-4 right-4"].map((pos) => (
        <span key={pos} className={`absolute ${pos} w-3 h-3 rounded-full bg-fill border border-line`} />
      ))}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <div className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full border border-navy/10 flex items-center justify-center">
          <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-full border border-navy/25 bg-fill flex items-center justify-center relative">
            <span className="absolute w-[85%] h-[85%] rounded-full border border-navy/10" />
            <span className="absolute w-[70%] h-[70%] rounded-full border border-navy/10" />
            <span className="absolute w-[55%] h-[55%] rounded-full border border-navy/10" />
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-point flex items-center justify-center z-10">
              <span className="w-4 h-4 rounded-full bg-white" />
            </div>
          </div>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 z-20">
          <span className="w-8 h-8 rounded-full border border-navy/25 bg-white absolute -top-4 -left-2 z-20 flex items-center justify-center shadow-sm">
            <span className="w-3 h-3 rounded-full bg-navy/15" />
          </span>
          <span className="block w-2 h-28 sm:h-32 border-x border-t border-navy/30 bg-white ml-1 rounded-t-full" />
          <span className="block w-6 h-10 border border-navy/30 bg-white -ml-1 rounded-md shadow-sm mt-[-2px]" />
        </div>
      </div>
    </div>
  );
}

/** (c) 선을 없애고 면과 빛으로. 판은 어두운 유리, 라벨은 로고의 주황 점, 받침 뒤에 로고 파랑의 빛. */
function TurntableC() {
  return (
    <div
      className="relative w-full max-w-lg h-36 sm:h-48 rounded-[1.75rem] overflow-hidden shadow-[0_14px_40px_-16px_rgba(56,91,240,0.4)]"
      style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #EEF5FF 100%)" }}
    >
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <span aria-hidden className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full blur-2xl opacity-60" style={{ background: LOGO_BLUE }} />
        <div
          className="w-40 h-40 sm:w-56 sm:h-56 rounded-full relative flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(24,33,59,0.55)]"
          style={{
            background:
              "conic-gradient(from 210deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 18%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.16) 62%, rgba(255,255,255,0) 78%), " +
              "repeating-radial-gradient(circle, #1B2440 0 1.5px, #232D4D 1.5px 3px)",
          }}
        >
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-[inset_0_2px_6px_rgba(255,255,255,0.5)]"
            style={{ background: LOGO_ORANGE }}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>
        <div className="absolute right-9 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
          <span className="w-7 h-7 rounded-full bg-white shadow-[0_4px_10px_-2px_rgba(24,33,59,0.35)] -mb-1 z-10" />
          <span className="w-1.5 h-24 sm:h-28 rounded-full bg-white shadow-[0_4px_10px_-2px_rgba(24,33,59,0.3)]" />
          <span className="w-5 h-8 rounded-lg bg-brand shadow-[0_6px_12px_-4px_rgba(56,91,240,0.6)] -mt-1" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 묶음 */

export default function Studies() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h3 className="type-title-2 text-navy mb-1">홈 모드 카드</h3>
        <p className="type-sub text-navy/70 mb-5 break-keep">
          지금 홈의 카드는 크림 면을 직접 적어 두어서 새 테마에서도 누렇게 남아요. 아래는 그 자리를 어떻게 할지의 세 단계예요.
        </p>
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="pt-3">
            <Label step="(a)" title="색만 교체" note="형태·3px 테두리·배지 위치 그대로. 면을 흰색으로, 선과 글자는 ink, 배지는 새 주황." />
            <CardA />
          </div>
          <div className="pt-3">
            <Label step="(b)" title="가벼운 조정" note="구조는 그대로. 굵은 테두리를 옅은 선과 파란 기 도는 그림자로, 글자를 타이포 토큰으로." />
            <CardB />
          </div>
          <div>
            <Label step="(c-1)" title="재디자인 · 밝은 면" note="선을 없애고 흰 면에 로고의 빛을 흐리게. 왼쪽 정렬, 배지는 brand 글자. 주황 점은 로고에서 가져온 악센트." />
            <CardC1 />
          </div>
          <div>
            <Label step="(c-2)" title="재디자인 · 파란 면" note="카드 전체를 로고 파랑으로. 글자 대비(4.5:1) 때문에 로고보다 어두운 쪽 그라데이션. 네 장이 나란하면 과할 수 있어요." />
            <CardC2 />
          </div>
        </div>
      </div>

      <div>
        <h3 className="type-title-2 text-navy mb-1">턴테이블</h3>
        <p className="type-sub text-navy/70 mb-5 break-keep">
          홈과 월드컵 화면 아래에 놓이는 그림이에요. 월드컵에서는 고른 곡의 재킷이 라벨 자리에 올라가요.
        </p>
        <div className="flex flex-col gap-8">
          <div>
            <Label step="(a)" title="색만 교체" note="실제 LPPlayer 컴포넌트 그대로예요. 토큰을 쓰고 있어서 선은 ink, 라벨은 새 주황으로 이미 따라와요." />
            <LPPlayer />
          </div>
          <div>
            <Label step="(b)" title="가벼운 조정" note="같은 구조. 2px 남색 선을 옅은 선으로, 받침을 흰 면과 부드러운 그림자로. 라벨의 테두리를 없앰." />
            <TurntableB />
          </div>
          <div>
            <Label step="(c)" title="재디자인" note="선화를 면과 빛으로. 판은 어두운 유리 질감, 라벨은 로고의 주황 점, 받침 뒤에 로고 파랑의 빛. 톤암 머리는 brand." />
            <TurntableC />
          </div>
        </div>
      </div>
    </div>
  );
}
