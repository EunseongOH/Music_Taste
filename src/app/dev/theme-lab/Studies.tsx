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

import React, { useState } from "react";
import LPPlayer from "@/components/LPPlayer";
import ModeCard, { type GlowLevel } from "@/components/home/ModeCard";

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
    <div className="relative w-full max-w-lg h-36 sm:h-48 border border-line rounded-2xl px-6 bg-white shadow-[0_10px_30px_-14px_rgba(56,91,240,0.3)]">
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
      className="relative w-full max-w-lg h-48 sm:h-60 rounded-[1.75rem] overflow-hidden shadow-[0_14px_40px_-16px_rgba(56,91,240,0.4)]"
      style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #EEF5FF 100%)" }}
    >
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <span aria-hidden className="absolute w-48 h-48 sm:w-60 sm:h-60 rounded-full blur-2xl opacity-60" style={{ background: LOGO_BLUE }} />
        <div
          className="w-40 h-40 sm:w-52 sm:h-52 rounded-full relative flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(24,33,59,0.55)]"
          style={{
            background:
              "conic-gradient(from 200deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 9%, rgba(255,255,255,0) 20%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.14) 60%, rgba(255,255,255,0) 72%, rgba(255,255,255,0) 100%), " +
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

/* ---------------------------------------------------------------- 턴테이블: (b)와 (c) 사이 두 안 */

export type TurntableLook = "light" | "dark";

/**
 * 네트워크를 타지 않는 가짜 재킷(SVG data URI). 밝은 것 하나, 어두운 것 하나.
 * 월드컵에서는 고른 곡의 재킷이 이 자리에 올라온다 — 판이 재킷을 받쳐 줘야지 경쟁하면 안 된다.
 */
const svg = (body: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + body + "</svg>");

export const JACKETS = {
  light: svg(
    '<rect width="200" height="200" fill="#F6D9C8"/><circle cx="130" cy="78" r="46" fill="#F2A7A0"/>' +
      '<rect y="128" width="200" height="72" fill="#F9EFE4"/><path d="M0 150 Q50 120 100 150 T200 150 V200 H0Z" fill="#9CC7D9"/>'
  ),
  dark: svg(
    '<rect width="200" height="200" fill="#10131F"/><circle cx="66" cy="70" r="26" fill="#E9E4D4"/><circle cx="76" cy="62" r="24" fill="#10131F"/>' +
      '<path d="M0 200 L60 120 L100 160 L140 100 L200 200Z" fill="#232A45"/><path d="M0 200 L90 150 L200 200Z" fill="#2F3A63"/>'
  ),
};

/**
 * 공통: (b)의 가벼움(흰 받침, 옅은 선, 부드러운 그림자) + (c)의 빛(받침 뒤 로고 파랑의 옅은 빛, brand 톤암 머리).
 * 라벨 자리는 재킷의 자리다. 재킷이 없을 때만 단색 주황(point). 주황 그라데이션 라벨은 두지 않는다.
 *  - light: 판도 밝다. 재킷이 화면에서 가장 짙은 것이 된다.
 *  - dark : 판만 어둡다(실제 LP 처럼). (c)보다 가볍게 — 빛 반사 쐐기와 짙은 그림자를 덜었다.
 */
export function TurntableStudy({ look, jacket, spinning = false }: { look: TurntableLook; jacket?: string; spinning?: boolean }) {
  const dark = look === "dark";
  return (
    <div className="relative w-full max-w-lg h-36 sm:h-48 border border-line rounded-2xl bg-white shadow-[0_10px_30px_-14px_rgba(56,91,240,0.3)]">
      {["top-4 left-4", "top-4 right-4", "bottom-4 left-4", "bottom-4 right-4"].map((pos) => (
        <span key={pos} className={"absolute " + pos + " w-3 h-3 rounded-full bg-fill border border-line"} />
      ))}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        {/* 받침 뒤의 빛. (c)의 60% → 35% 로 낮췄다 */}
        <span
          aria-hidden
          className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full blur-2xl opacity-35"
          style={{ background: LOGO_BLUE }}
        />
        <div className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full border border-navy/10 flex items-center justify-center">
          <div
            className={
              "w-40 h-40 sm:w-56 sm:h-56 rounded-full flex items-center justify-center relative " +
              (dark ? "shadow-[0_6px_16px_-8px_rgba(24,33,59,0.45)] " : "border border-navy/20 bg-fill ") +
              (spinning ? "animate-[spin_1.8s_linear_infinite]" : "")
            }
            style={dark ? { background: "repeating-radial-gradient(circle, #222B47 0 1.5px, #2B3556 1.5px 3px)" } : undefined}
          >
            {!dark && (
              <>
                <span className="absolute w-[85%] h-[85%] rounded-full border border-navy/10" />
                <span className="absolute w-[70%] h-[70%] rounded-full border border-navy/10" />
              </>
            )}
            {/* 라벨 = 재킷의 자리. 원본(40%)보다 키워 재킷이 주인공이 되게 */}
            <div
              className={
                "w-[46%] h-[46%] rounded-full flex items-center justify-center relative overflow-hidden " +
                (jacket ? "ring-2 ring-white" : "bg-point")
              }
            >
              {jacket && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={jacket} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              <span className="w-3.5 h-3.5 rounded-full bg-white relative shadow-sm" />
            </div>
          </div>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
          <span className="w-7 h-7 rounded-full bg-white border border-line shadow-sm -mb-1 z-10" />
          <span className="w-1.5 h-24 sm:h-28 rounded-full bg-white border border-line" />
          <span className="w-5 h-8 rounded-lg bg-brand shadow-[0_6px_12px_-4px_rgba(56,91,240,0.55)] -mt-1" />
        </div>
      </div>
    </div>
  );
}

function TurntableOptions() {
  const [spinning, setSpinning] = useState(false);
  const rows: { look: TurntableLook; title: string; note: string }[] = [
    { look: "light", title: "1안 · 밝은 판", note: "(b)에 (c)의 빛과 brand 톤암만 더했어요. 판이 밝아서 재킷이 화면에서 가장 짙은 것이 돼요." },
    { look: "dark", title: "2안 · 어두운 판", note: "판만 (c)처럼 어둡게, 나머지는 (b). 실제 LP 처럼 어두운 테가 재킷을 받쳐 줘요. (c)의 빛 반사와 짙은 그림자는 덜었어요." },
  ];
  const states = [
    { cap: "재킷 없음 — 홈, 고르기 전", src: undefined },
    { cap: "밝은 재킷이 올라온 상태", src: JACKETS.light },
    { cap: "어두운 재킷이 올라온 상태", src: JACKETS.dark },
  ];
  return (
    <div id="turntable-options" className="flex flex-col gap-10">
      <button
        onClick={() => setSpinning((v) => !v)}
        className="self-start inline-flex items-center h-10 px-5 rounded-full bg-navy/5 text-navy type-sub font-semibold cursor-pointer"
      >
        {spinning ? "회전 멈추기" : "회전시켜 보기"}
      </button>
      {rows.map((r) => (
        <div key={r.look}>
          <Label step="" title={r.title} note={r.note} />
          <div className="flex flex-col gap-9 mt-6">
            {states.map((j) => (
              <div key={j.cap}>
                <p className="type-caption text-navy/70 mb-6">{j.cap}</p>
                <TurntableStudy look={r.look} jacket={j.src} spinning={spinning} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 턴테이블 1안 다듬기 (사용자 피드백 반영) */

export type Emphasis = "quiet" | "normal";
export type LabelStyle = "small" | "neutral";

/**
 * 1안(밝은 판)을 사용자 피드백대로 고친 것. 실제 LPPlayer 에는 사용자가 이 시안을 확인한 뒤에 옮긴다.
 *
 *  · 판을 줄였다: 지름 160 → 128(모바일). legacy 는 판이 받침 높이(144)의 1.11배라 위아래로 넘치는데,
 *    새 안은 0.89배라 받침 안에 들어온다. 재킷 지름은 72px 로 그대로 — 알아보일 만큼은 유지.
 *  · 파란 빛을 없앴다. 톤암 머리도 중립색. 파랑은 카드의 옅은 빛과 "시작하기" 두 곳에만 남는다.
 *  · 주황을 줄였다. 재킷이 없을 때의 라벨:
 *      small   작은 단색 주황 라벨(판의 30%). legacy(40%)보다 작다
 *      neutral 재킷 자리 크기의 중립색 면 + 가운데 주황 점만
 *  · emphasis: quiet(홈 — 장식. 그림자 없음, 선·면 한 단계 옅게) / normal(월드컵 — 지금 수준)
 */
export function Turntable1({
  emphasis = "quiet",
  label = "neutral",
  jacket,
  spinning = false,
}: {
  emphasis?: Emphasis;
  label?: LabelStyle;
  jacket?: string;
  spinning?: boolean;
}) {
  const quiet = emphasis === "quiet";
  return (
    <div
      className={
        "relative w-full max-w-lg h-36 sm:h-48 rounded-2xl border " +
        (quiet ? "border-navy/10 bg-white/60" : "border-line bg-white shadow-[0_10px_28px_-16px_rgba(24,33,59,0.28)]")
      }
    >
      {["top-4 left-4", "top-4 right-4", "bottom-4 left-4", "bottom-4 right-4"].map((pos) => (
        <span key={pos} className={"absolute " + pos + " w-3 h-3 rounded-full border " + (quiet ? "border-navy/10" : "bg-navy/[0.04] border-line")} />
      ))}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <div className={"absolute w-[8.75rem] h-[8.75rem] sm:w-[11.75rem] sm:h-[11.75rem] rounded-full border " + (quiet ? "border-navy/5" : "border-navy/10")} />
        <div
          className={
            "w-32 h-32 sm:w-44 sm:h-44 rounded-full flex items-center justify-center relative border " +
            (quiet ? "border-navy/10 bg-navy/[0.03] " : "border-navy/20 bg-navy/[0.05] ") +
            (spinning ? "animate-[spin_1.8s_linear_infinite]" : "")
          }
        >
          <span className={"absolute w-[86%] h-[86%] rounded-full border " + (quiet ? "border-navy/5" : "border-navy/10")} />
          <span className={"absolute w-[72%] h-[72%] rounded-full border " + (quiet ? "border-navy/5" : "border-navy/10")} />
          {jacket ? (
            <div className="w-[56%] h-[56%] rounded-full relative overflow-hidden ring-2 ring-white flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={jacket} alt="" className={"absolute inset-0 w-full h-full object-cover " + (quiet ? "opacity-90" : "")} />
              <span className="w-3 h-3 rounded-full bg-white relative shadow-sm" />
            </div>
          ) : label === "small" ? (
            <div className={"w-[30%] h-[30%] rounded-full flex items-center justify-center " + (quiet ? "bg-point/85" : "bg-point")}>
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
            </div>
          ) : (
            <div className={"w-[56%] h-[56%] rounded-full flex items-center justify-center border " + (quiet ? "bg-white/70 border-navy/10" : "bg-white border-line")}>
              <span className="w-3 h-3 rounded-full bg-point ring-[3px] ring-point/15" />
            </div>
          )}
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
          <span className={"w-6 h-6 rounded-full bg-white border -mb-1 z-10 " + (quiet ? "border-navy/10" : "border-line shadow-sm")} />
          <span className={"w-1.5 h-[5.5rem] sm:h-28 rounded-full bg-white border " + (quiet ? "border-navy/10" : "border-line")} />
          <span className={"w-4 h-7 rounded-md -mt-1 " + (quiet ? "bg-navy/15" : "bg-navy/35")} />
        </div>
      </div>
    </div>
  );
}

function GlowLevels() {
  const levels: { id: GlowLevel; title: string; note: string }[] = [
    { id: "full", title: "지금까지 (100%)", note: "농도 0.70 · 지름 208. 카드 오른쪽 절반이 파랗게 읽혀요. 비교용." },
    { id: "half", title: "절반 (약 50%)", note: "농도 0.40 · 지름 168, 모서리로 12px 더 밀었어요. 빛이 오른쪽 위 3분의 1 안에 머물러요." },
    { id: "faint", title: "옅게 (약 30%) — 기본값", note: "농도 0.26 · 지름 140, 모서리로 20px. 흰 면이 주인이고 빛은 모서리에 비치는 정도. 주황 점이 상대적으로 또렷해져요." },
  ];
  return (
    <div className="flex flex-col gap-8">
      {levels.map((l) => (
        <div key={l.id}>
          <Label step="" title={l.title} note={l.note} />
          <ModeCard badge={MODE.badge} title={MODE.title} desc={MODE.desc} glow={l.id} />
        </div>
      ))}
    </div>
  );
}

function Turntable1Refine() {
  const [spinning, setSpinning] = useState(false);
  const states = [
    { cap: "재킷 없음", src: undefined },
    { cap: "밝은 재킷", src: JACKETS.light },
    { cap: "어두운 재킷", src: JACKETS.dark },
  ];
  return (
    <div id="turntable-refine" className="flex flex-col gap-10">
      <div>
        <Label
          step=""
          title="크기 비교 — 같은 너비에 나란히"
          note="legacy: 받침 352×144, 판 160(받침 높이의 1.11배 — 위아래 8px 넘침), 바깥 링 176, 라벨 64(판의 40%). 새 안: 판 128(0.89배 — 받침 안), 바깥 링 140, 재킷 72."
        />
        <div className="flex flex-col gap-9 mt-6">
          <div>
            <p className="type-caption text-navy/70 mb-6">지금 운영의 LPPlayer (이 테마의 색으로)</p>
            <LPPlayer />
          </div>
          <div>
            <p className="type-caption text-navy/70 mb-3">새 안 · 홈용(quiet)</p>
            <Turntable1 emphasis="quiet" label="neutral" />
          </div>
          <div>
            <p className="type-caption text-navy/70 mb-3">새 안 · 월드컵용(normal)</p>
            <Turntable1 emphasis="normal" label="neutral" />
          </div>
        </div>
      </div>

      <button
        onClick={() => setSpinning((v) => !v)}
        className="self-start inline-flex items-center h-10 px-5 rounded-full bg-navy/5 text-navy type-sub font-semibold cursor-pointer"
      >
        {spinning ? "회전 멈추기" : "회전시켜 보기"}
      </button>

      {(
        [
          { id: "neutral", title: "라벨 A · 중립색 면 + 주황 점", note: "재킷 자리 크기의 흰 면을 비워 두고 주황은 가운데 점 하나. 재킷이 올라올 자리라는 것이 보이고, 주황 면적이 가장 작아요." },
          { id: "small", title: "라벨 B · 작은 주황 라벨", note: "판의 30% 크기 단색 주황. legacy(40%)보다 작아요. LP 다운 모양은 이쪽이 더 남아요." },
        ] as const
      ).map((opt) => (
        <div key={opt.id}>
          <Label step="" title={opt.title} note={opt.note} />
          <div className="grid gap-6 mt-4">
            {(["quiet", "normal"] as const).map((em) => (
              <div key={em}>
                <p className="type-caption text-navy/70 mb-3">{em === "quiet" ? "홈용 (quiet)" : "월드컵용 (normal)"}</p>
                <div className="flex flex-col gap-4">
                  {states.map((st) => (
                    <div key={st.cap}>
                      <p className="type-caption text-navy/40 mb-1.5">{st.cap}</p>
                      <Turntable1 emphasis={em} label={opt.id} jacket={st.src} spinning={spinning} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 묶음 */

export default function Studies() {
  return (
    <div className="flex flex-col gap-10">
      <div id="glow-levels">
        <h3 className="type-title-2 text-navy mb-1">카드 빛의 세기 — 세 단계</h3>
        <p className="type-sub text-navy/70 mb-5 break-keep">
          "푸른 로고 색의 빛을 좀 더 연하게, 덜." 농도와 면적을 같이 줄였어요. 새 테마에서만 달라지고, 지금 톤에서는 세 장이 똑같아요.
        </p>
        <GlowLevels />
      </div>

      <div>
        <h3 className="type-title-2 text-navy mb-1">턴테이블 1안 다듬기</h3>
        <p className="type-sub text-navy/70 mb-5 break-keep">
          판을 줄이고, 파란 빛을 없애고, 주황을 줄였어요. 홈에서는 장식이라 한 단계 더 가라앉혔어요.
        </p>
        <Turntable1Refine />
      </div>

      <div>
        <h3 className="type-title-2 text-navy mb-1">홈 모드 카드 — 처음 시안 (a)(b)(c)</h3>
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

      <div>
        <h3 className="type-title-2 text-navy mb-1">턴테이블 — (b)와 (c) 사이 두 안 (1안으로 확정. 2안은 남겨만 둔다)</h3>
        <p className="type-sub text-navy/70 mb-5 break-keep">
          월드컵에서 고른 곡의 재킷이 라벨 자리에 올라와요. 그래서 라벨은 재킷의 자리로 비워 두고, 재킷이 없을 때만 단색 주황을 둬요.
          재킷은 네트워크를 타지 않는 가짜 그림이에요.
        </p>
        <TurntableOptions />
      </div>
    </div>
  );
}
