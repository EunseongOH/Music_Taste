"use client";

import React from "react";
import type { PairMatch } from "@/utils/togetherMatch";
import { otherKey, partnersOf } from "@/utils/togetherMatch";
import { Sheet } from "@/components/space/SpaceUI";

/**
 * 참여자가 많을 때 관계도에 다 세우지 않고, 묶음 노드(+N)에서 여기로 들어온다.
 * 나와 닮은 순으로 보여준다 — 여기서 찾는 건 "누가 나와 비슷한가"다.
 */
export default function ParticipantSheet({
  open,
  onClose,
  participants,
  pairs,
  myKey,
  selectedKey,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  participants: { key: string; nickname: string | null }[];
  pairs: PairMatch[];
  myKey: string;
  selectedKey: string | null;
  onPick: (key: string) => void;
}) {
  const byKey = new Map(participants.map((p) => [p.key, p]));
  const name = (k: string) => byKey.get(k)?.nickname?.trim() || "익명 리스너";
  const rows = partnersOf(pairs, myKey).map((p: PairMatch) => ({ key: otherKey(p, myKey), pair: p }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel="닫기"
      header={
        <>
          <h2 className="type-title-2 text-navy">참여자 {participants.length}명</h2>
          <p className="type-caption text-navy/70 mt-0.5">나와 닮은 순이에요.</p>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-navy/10">
        {rows.map(({ key, pair }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(key)}
              aria-pressed={key === selectedKey}
              className="w-full py-3 flex items-center gap-3 text-left min-h-[44px] cursor-pointer hover:bg-navy/5 -mx-6 px-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--t-point-ink)]"
            >
              <span className="type-title-2 font-num tabular-nums text-point-ink w-14 shrink-0">
                {pair.comparable ? `${pair.rate}%` : "—"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-body-strong text-navy truncate">{name(key)}</span>
                <span className="block type-caption text-navy/70">
                  {pair.comparable ? `${pair.common}곡 함께 소트` : "함께 소트한 곡이 모자라요"}
                </span>
              </span>
              {key === selectedKey && (
                <span className="type-caption font-semibold text-point-ink shrink-0">보는 중</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
