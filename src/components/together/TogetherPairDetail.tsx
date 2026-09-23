"use client";

import React, { useMemo, useState } from "react";
import type { PairMatch } from "@/utils/togetherMatch";
import { buildRankComparison, commonOrders, getSharedTopTracks, getTopK } from "@/utils/togetherMatch";
import { Cover, textLink } from "@/components/space/SpaceUI";
import { withJosa } from "@/utils/josa";

/**
 * 관계도에서 고른 사람과 나의 상세 비교.
 *
 * 이 화면에서 새로운 정보는 "내 순위"가 아니라 **그 사람과 무엇이 같고 달랐는가**다.
 * 그래서 카드 안에 카드를 겹치지 않고, 여백과 글자 크기로만 위계를 만든다.
 */

export interface DetailTrack {
  id: string;
  title: string;
  artistName?: string;
  albumImage?: string | null;
}

export default function TogetherPairDetail({
  pair,
  myKey,
  myRanking,
  theirRanking,
  theirName,
  byId,
}: {
  pair: PairMatch;
  myKey: string;
  myRanking: string[];
  theirRanking: string[];
  theirName: string;
  byId: Map<string, DetailTrack>;
}) {
  const [showAll, setShowAll] = useState(false);

  const { topK, sharedTop, rows, gap } = useMemo(() => {
    // 한 사람을 골라 보는 자리라 **그 사람과 겹친 곡 안에서** 센다.
    const shared = commonOrders(myRanking, theirRanking);
    const k = getTopK(pair.common);
    const rows = buildRankComparison(myRanking, theirRanking);
    return {
      topK: k,
      sharedTop: getSharedTopTracks(shared.mine, shared.theirs, k),
      rows,
      // 순위 표시는 각자의 전체 소트 기준이다(pair.biggestGap 과 같은 규칙).
      gap: pair.biggestGap,
    };
  }, [myRanking, theirRanking, pair]);

  if (!pair.comparable) {
    return (
      <section className="mt-10">
        <PairHeading theirName={theirName} rate={null} />
        <p className="type-body text-navy/70 mt-3 break-keep">
          {theirName}님과 함께 소트한 곡이 {pair.common}곡이라 순위를 견줄 수 없어요.
          같은 곡을 더 소트하면 채워져요.
        </p>
      </section>
    );
  }

  const shown = showAll ? rows : rows.slice(0, 5);

  return (
    <section className="mt-10">
      <PairHeading theirName={theirName} rate={pair.rate} />

      {/* 같이 위에 둔 곡 */}
      {topK > 0 && (
        <div className="mt-6">
          <h3 className="type-body-strong text-navy">같이 TOP {topK}에 둔 곡</h3>
          {sharedTop.length === 0 ? (
            <p className="type-caption text-navy/70 mt-1.5 break-keep">
              TOP {topK} 안에서는 겹친 곡이 없어요. 아래 순위 비교에서 어디가 갈렸는지 볼 수 있어요.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {sharedTop.map((id) => {
                const t = byId.get(id);
                if (!t) return null;
                return (
                  <li key={id} className="flex items-center gap-3">
                    <Cover src={t.albumImage} alt={t.title} size={40} />
                    <div className="min-w-0">
                      <p className="type-body-strong text-navy truncate">{t.title}</p>
                      {t.artistName && <p className="type-caption text-navy/70 truncate">{t.artistName}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* 가장 갈린 곡 */}
      {gap && byId.get(gap.id) && (
        <div className="mt-6">
          <h3 className="type-body-strong text-navy">가장 순위가 달랐던 곡</h3>
          <p className="type-body text-navy mt-1.5 truncate">{byId.get(gap.id)!.title}</p>
          {/* 쌍의 a·b 중 어느 쪽이 나인지는 쌍이 안다(참여자를 key 로 정렬해 짝지으므로 고정이 아니다). */}
          <p className="type-caption text-navy/70 mt-0.5">
            나는 {pair.aKey === myKey ? gap.aRank : gap.bRank}위 · {theirName}님은{" "}
            {pair.aKey === myKey ? gap.bRank : gap.aRank}위
          </p>
        </div>
      )}

      {/* 전체 순위 비교 — 두 사람을 한 목록 안에서 양쪽으로 */}
      <div className="mt-6">
        <h3 className="type-body-strong text-navy">전체 순위 비교</h3>
        <div className="mt-2 flex items-center gap-3 pb-1.5 border-b border-navy/10">
          <span className="type-caption font-semibold text-navy/70 w-7 text-center shrink-0">나</span>
          <span className="flex-1" />
          <span className="type-caption font-semibold text-navy/70 max-w-[84px] truncate text-center shrink-0">
            {theirName}
          </span>
        </div>
        <ul className="flex flex-col">
          {shown.map((row) => {
            const t = byId.get(row.id);
            const worst = gap?.id === row.id;
            return (
              <li
                key={row.id}
                /* 가장 갈린 한 줄만 옅은 면으로 집어낸다. 색만으로 말하지 않으려고
                   숫자 사이에 차이도 함께 적는다. */
                className={`flex items-center gap-3 py-2 -mx-2 px-2 rounded-lg ${worst ? "bg-navy/5" : ""}`}
              >
                <span className="type-body-strong font-num tabular-nums text-navy w-7 text-center shrink-0">
                  {row.mineRank}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block type-body text-navy truncate">{t?.title ?? row.id}</span>
                  {worst && <span className="block type-caption text-navy/70">{row.gap}칸 차이</span>}
                </span>
                <span className="type-body-strong font-num tabular-nums text-navy w-7 text-center shrink-0">
                  {row.theirRank}
                </span>
              </li>
            );
          })}
        </ul>
        {rows.length > 5 && (
          /* 새 화면으로 보내지 않는다 — 보던 자리에서 펼친다. */
          <button type="button" onClick={() => setShowAll((v) => !v)} className={`${textLink} mt-3`}>
            {showAll ? "접기" : `전체 ${rows.length}곡 비교하기`}
          </button>
        )}
      </div>
    </section>
  );
}

function PairHeading({ theirName, rate }: { theirName: string; rate: number | null }) {
  return (
    <>
      <h2 className="type-title-2 text-navy break-keep">{withJosa(theirName, "와")} 나</h2>
      {rate !== null && (
        <p className="type-title-1 font-num tabular-nums text-point-ink mt-0.5">{rate}% 일치</p>
      )}
    </>
  );
}
