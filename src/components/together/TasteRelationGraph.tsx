"use client";

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { PairMatch } from "@/utils/togetherMatch";
import { otherKey, pickHighlightEdges } from "@/utils/togetherMatch";

/**
 * 우리의 취향 관계도.
 *
 * 분석 도구가 아니라 결과 화면이다. 그래서 힘 기반 배치(force-directed)를 쓰지 않는다 —
 * 같은 사람들로 다시 열었을 때 자리가 달라지면 읽던 그림이 사라진다. 사람 수만 같으면
 * 언제나 같은 자리에 오는 타원 배치를 쓴다.
 *
 * 선은 SVG, 노드는 절대 위치 <button>. 선을 눌러야만 쓸 수 있는 화면은 만들지 않는다 —
 * 노드만 눌러도 모든 상세를 볼 수 있어야 한다.
 */

export interface GraphParticipant {
  key: string;
  nickname: string | null;
}

/** 관계도에 개별 노드로 세울 수 있는 최대 인원. 넘으면 대표만 세우고 나머지는 묶는다. */
export const GRAPH_NODE_LIMIT = 10;
/** 대표만 세울 때의 인원(나 포함). 공유 이미지는 자리가 좁아 한 명 덜 세운다. */
const SUMMARY_NODES = 7;
const COMPACT_LIMIT = 7;
const COMPACT_NODES = 6;

const NAME = (p: GraphParticipant | undefined): string => p?.nickname?.trim() || "익명 리스너";

/**
 * 사람 수에 맞춘 판.
 *
 * **판을 정사각에 가깝게 잡는다.** 세로로 긴 타원에 각도를 고르게 나누면 간격이
 * 고르지 않다 — 같은 각도라도 위아래에서는 호가 짧아 노드가 몰리고 좌우는 벌어진다.
 * 10명에서 위아래가 빽빽하고 가운데가 휑해 보이던 게 그 탓이었다. 원에서는 각도가
 * 곧 간격이라 따로 계산할 것이 없다.
 *
 * `size` 는 판의 한 변. 사람이 늘면 키우고(둘레 확보) 이름표는 좁힌다.
 */
function ovalFor(n: number, compact: boolean): { size: number; pill: number; r: number } {
  // 공유 이미지 안에서는 자리가 정해져 있다. 노드를 최대 7개로 줄이므로 판도 하나면 된다.
  if (compact) return { size: 236, pill: 62, r: 37 };
  if (n <= 4) return { size: 220, pill: 96, r: 33 };
  if (n <= 7) return { size: 292, pill: 88, r: 36 };
  return { size: 348, pill: 70, r: 39 };
}

/**
 * 11명 이상일 때 관계도에 세울 대표.
 *
 * 나 → 가장 닮은 두 쌍의 양끝 → 가장 다른 쌍의 양끝 → 남는 자리는 나와 가까운 순.
 * 강조선에 쓰이는 사람이 관계도에 없으면 그 선을 그릴 수 없다.
 */
function pickRepresentatives(
  all: GraphParticipant[],
  pairs: PairMatch[],
  myKey: string,
  trackCount: number | undefined,
  limit: number
): string[] {
  const { highest, lowest } = pickHighlightEdges(pairs, trackCount);
  const picked: string[] = [myKey];
  const add = (k: string) => {
    if (k && !picked.includes(k) && picked.length < limit) picked.push(k);
  };
  for (const e of [...highest, ...(lowest ? [lowest] : [])]) {
    add(e.aKey);
    add(e.bKey);
  }
  for (const p of pairs.filter((x) => x.aKey === myKey || x.bKey === myKey).sort((a, b) => b.rate - a.rate)) {
    add(otherKey(p, myKey));
  }
  // 그래도 자리가 남으면(나와 쌍이 없는 사람만 남은 경우) 아무나 채우지 않는다.
  for (const p of all) add(p.key);
  return picked;
}

export default function TasteRelationGraph({
  participants,
  pairs,
  myKey,
  selectedKey,
  onSelect,
  onOpenMore,
  trackCount,
  compact,
}: {
  participants: GraphParticipant[];
  pairs: PairMatch[];
  myKey: string;
  /** 지금 고른 상대. 나를 고를 수는 없다. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** 묶음 노드(+N)를 눌렀을 때. 11명 이상에서만 쓴다. */
  onOpenMore: () => void;
  /** 방의 곡 수. 강조선 문턱에 쓴다. */
  trackCount?: number;
  /**
   * 공유 이미지 안에 넣을 때. 판을 줄이고 노드를 최대 7개로 묶으며, 누를 수 없게 한다.
   * 화면에서 쓰는 것과 같은 배치·같은 강조선이라 그림이 달라지지 않는다.
   */
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const still = compact || reduceMotion;

  const view = useMemo(() => {
    const byKey = new Map(participants.map((p) => [p.key, p]));
    const limit = compact ? COMPACT_LIMIT : GRAPH_NODE_LIMIT;
    const summary = participants.length > limit;
    const shownKeys = summary
      ? pickRepresentatives(participants, pairs, myKey, trackCount, compact ? COMPACT_NODES : SUMMARY_NODES)
      : // 나를 맨 위에 두고, 나머지는 나와 닮은 순으로 시계 방향. 자료가 같으면 자리도 같다.
        [
          myKey,
          ...participants
            .filter((p) => p.key !== myKey)
            .map((p) => {
              const pair = pairs.find(
                (x) => (x.aKey === myKey && x.bKey === p.key) || (x.bKey === myKey && x.aKey === p.key)
              );
              return { key: p.key, rate: pair?.comparable ? pair.rate : -1 };
            })
            .sort((a, b) => b.rate - a.rate || (a.key < b.key ? -1 : 1))
            .map((x) => x.key),
        ];

    const hiddenCount = participants.length - shownKeys.length;
    const slots = shownKeys.length + (hiddenCount > 0 ? 1 : 0);
    const { size, pill, r } = ovalFor(slots, !!compact);

    // 나는 언제나 12시. 나머지는 시계 방향으로 고르게.
    const at = (i: number) => {
      const angle = -Math.PI / 2 + (i / slots) * Math.PI * 2;
      return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
    };
    const positions = new Map<string, { x: number; y: number }>();
    shownKeys.forEach((key, i) => positions.set(key, at(i)));
    const morePos = hiddenCount > 0 ? at(shownKeys.length) : null;

    const { highest, lowest } = pickHighlightEdges(pairs, trackCount);
    const drawable = (p: PairMatch) => positions.has(p.aKey) && positions.has(p.bKey);
    const edges: { pair: PairMatch; kind: "close" | "far" | "plain" }[] = [
      ...highest.filter(drawable).map((p) => ({ pair: p, kind: "close" as const })),
      ...(lowest && drawable(lowest) ? [{ pair: lowest, kind: "far" as const }] : []),
    ];
    // 고른 사람과 나의 선은 강조선에 없어도 그린다 — 고른 결과가 그림에 보여야 한다.
    const selectedPair =
      selectedKey && selectedKey !== myKey
        ? pairs.find(
            (x) =>
              (x.aKey === myKey && x.bKey === selectedKey) || (x.bKey === myKey && x.aKey === selectedKey)
          )
        : undefined;
    if (selectedPair && drawable(selectedPair) && !edges.some((e) => e.pair === selectedPair)) {
      /*
       * 고른 상대가 강조선에 없어도 선은 그린다 — 고른 결과가 그림에 보여야 한다.
       * 다만 "가장 닮은 조합"의 주황 실선을 쓰지 않는다. 25% 짜리 상대를 골랐는데
       * 범례에서 닮음을 뜻하는 선이 그어지면 숫자와 그림이 다른 말을 한다.
       */
      edges.push({ pair: selectedPair, kind: "plain" });
    }

    return { byKey, shownKeys, hiddenCount, positions, morePos, edges, size, pill, selectedPair, summary };
  }, [participants, pairs, myKey, selectedKey, trackCount, compact]);

  const isSelectedEdge = (p: PairMatch) =>
    !!selectedKey && (p.aKey === myKey || p.bKey === myKey) && otherKey(p, myKey) === selectedKey;

  return (
    /* 좁은 화면에서는 폭에 맞춰 줄어든다(그만큼 세로로 조금 길어진다). */
    <div className="relative w-full mx-auto" style={{ height: view.size, maxWidth: view.size }}>
      {/* 관계선. 장식이라 읽어 줄 필요가 없다 — 같은 내용을 아래 글로 적는다. */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {view.edges.map(({ pair, kind }) => {
          const a = view.positions.get(pair.aKey)!;
          const b = view.positions.get(pair.bKey)!;
          const active = isSelectedEdge(pair);
          const dim = !!selectedKey && !active;
          return (
            <line
              key={`${pair.aKey}-${pair.bKey}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              vectorEffect="non-scaling-stroke"
              stroke={kind === "close" ? "var(--t-point-ink)" : "var(--t-navy)"}
              strokeWidth={active ? 2.5 : kind === "close" ? 1.75 : 1.25}
              /* 닮은 관계는 실선, 다른 관계는 파선. 색만으로 가르지 않는다. */
              strokeDasharray={kind === "far" ? "4 4" : undefined}
              strokeLinecap="round"
              /* 고른 선 말고는 흐리게 하되 지우지는 않는다. 들어오자마자 한 명이 골라져 있어서
                 너무 흐리면 "가장 닮은 조합 둘, 가장 다른 하나"라는 기본 그림이 사라진다. */
              opacity={dim ? 0.5 : kind === "close" ? 0.95 : kind === "far" ? 0.6 : 0.75}
              style={{ transition: still ? undefined : "opacity .2s, stroke-width .2s" }}
            />
          );
        })}
      </svg>

      {view.shownKeys.map((key) => {
        const me = key === myKey;
        const selected = key === selectedKey;
        const pos = view.positions.get(key)!;
        const person = view.byKey.get(key);
        const pair = pairs.find(
          (x) => (x.aKey === myKey && x.bKey === key) || (x.bKey === myKey && x.aKey === key)
        );
        const rate = pair?.comparable ? `${pair.rate}%` : null;
        return (
          <motion.button
            key={key}
            type="button"
            layout={!still}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
            disabled={me || !!compact}
            onClick={() => !me && onSelect(key)}
            aria-pressed={me ? undefined : selected}
            aria-label={
              me
                ? `나 · ${NAME(person)}`
                : `${NAME(person)}${rate ? `, 나와 ${rate} 일치` : ", 비교할 공통 곡이 모자람"}${selected ? " (선택됨)" : ""}`
            }
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5",
              "rounded-full px-3 py-1.5 min-h-[44px] justify-center",
              "font-sans text-xs leading-tight transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)]",
              me
                ? "bg-navy text-cream font-bold cursor-default"
                : selected
                  ? "bg-cream text-navy font-bold ring-2 ring-[var(--t-point-ink)] cursor-pointer"
                  : "bg-cream text-navy/80 border border-navy/15 hover:border-navy/35 cursor-pointer",
            ].join(" ")}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, maxWidth: view.pill }}
          >
            <span className="truncate max-w-full">{NAME(person)}</span>
            {/* 둘째 줄은 나에게는 "나", 남에게는 일치율. 같은 자리에 같은 크기라 노드 모양이 흔들리지
                않고, 닉네임이 겹쳐도(같은 이름을 쓰는 사람이 있다) 어느 쪽이 나인지 바로 보인다. */}
            {me ? (
              <span className="text-[10px] font-normal text-cream/70">나</span>
            ) : (
              rate && (
                <span className={`font-num tabular-nums text-[10px] ${selected ? "text-point-ink" : "text-navy/50"}`}>
                  {rate}
                </span>
              )
            )}
          </motion.button>
        );
      })}

      {view.hiddenCount > 0 && view.morePos && (
        <button
          type="button"
          onClick={onOpenMore}
          aria-label={`나머지 참여자 ${view.hiddenCount}명 보기`}
          className="absolute -translate-x-1/2 -translate-y-1/2 min-h-[44px] px-3 rounded-full bg-navy/5 border border-dashed border-navy/30 font-sans text-xs font-bold text-navy/70 hover:bg-navy/10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)]"
          style={{ left: `${view.morePos.x}%`, top: `${view.morePos.y}%` }}
        >
          +{view.hiddenCount}
        </button>
      )}
    </div>
  );
}
