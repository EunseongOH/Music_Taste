"use client";

import React from "react";
import type { PairMatch } from "@/utils/togetherMatch";
import TasteRelationGraph, { type GraphParticipant } from "@/components/together/TasteRelationGraph";

/**
 * 같이 소트하기 결과 — 공유 이미지.
 *
 * 화면을 통째로 찍지 않는다. 결과 페이지는 세로로 길고 버튼·시트가 섞여 있어서
 * 그대로 찍으면 잘리거나 눌리지 않는 버튼이 그림에 남는다. 내보내기 전용으로 따로 그린다.
 *
 * **비율은 4:5 로 고정한다.** 실제 픽셀 크기는 플랫폼이 정한다 —
 * `platform.saveImage(el, name)` 에 크기 인자가 없고, 웹은 pixelRatio 5, 토스는 3(실패하면 2)이다.
 * 그래서 432×540 으로 그리면 웹 2160×2700, 토스 1296×1620 이 나오고 비율은 어디서나 같다.
 *
 * 넣지 않는 것: 개인별 전체 순위, 가장 갈린 곡 상세, 긴 참가자 목록, 모든 쌍의 숫자, 버튼.
 * 공유 이미지는 "우리 이만큼 닮았다"만 말하면 된다. 나머지는 링크를 열면 있다.
 */

export const SHARE_CARD_W = 432;
export const SHARE_CARD_H = 540;

export default function TogetherResultShareCard({
  id,
  artistLabel,
  trackCount,
  participantCount,
  groupRate,
  participants,
  pairs,
  myKey,
  artistImage,
  roomName,
}: {
  id: string;
  artistLabel: string;
  trackCount: number;
  participantCount: number;
  groupRate: number | null;
  participants: GraphParticipant[];
  pairs: PairMatch[];
  myKey: string;
  /** 인라인(data:)으로 바꿔서 넘긴다. 원격 주소를 그대로 주면 캡처가 빈 칸으로 찍힐 수 있다. */
  artistImage?: string | null;
  /** 방 이름을 따로 적은 경우에만. 기본값(아티스트명)은 아래에 이미 있으니 두 번 적지 않는다. */
  roomName?: string | null;
}) {
  return (
    <div
      id={id}
      className="relative overflow-hidden bg-[var(--app-bg)] flex flex-col"
      style={{ width: SHARE_CARD_W, height: SHARE_CARD_H }}
    >
      {artistImage && (
        /*
         * 위쪽은 거의 가리지 않는다 — 처음엔 전체를 흐리게 덮었더니 아티스트가 아니라
         * 얼룩처럼 보였다. 대신 글자를 사진이 잦아든 아래쪽에서 시작한다.
         */
        <div className="absolute inset-x-0 top-0 h-[232px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artistImage} alt="" aria-hidden className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--app-bg)]/10 via-[var(--app-bg)]/75 to-[var(--app-bg)]" />
        </div>
      )}

      <div className={`relative px-9 flex flex-col ${artistImage ? "pt-[136px]" : "pt-12"}`}>
        {roomName && <p className="type-caption text-navy/70 mb-1 truncate">{roomName}</p>}
        <p className="type-body-strong text-navy">
          {artistLabel} · {trackCount}곡
        </p>
        <p className="type-caption text-navy/70 mt-0.5">{participantCount}명이 같이 소트한 결과</p>

        {groupRate !== null && (
          <div className="mt-3 flex items-baseline gap-2">
            <span className="type-display font-num tabular-nums text-navy leading-none">{groupRate}%</span>
            <span className="type-caption font-semibold text-navy/70">종합 일치율</span>
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-6">
        <TasteRelationGraph
          participants={participants}
          pairs={pairs}
          myKey={myKey}
          selectedKey={null}
          onSelect={() => {}}
          onOpenMore={() => {}}
          trackCount={trackCount}
          compact
        />
      </div>

      <div className="relative px-9 pb-7">
        {/* 3차 글자의 하한은 /65 다(docs/design-system/color.md 대비 표). /50 은 플레이스홀더·아이콘용. */}
        <p className="type-caption text-navy/65">Sortify · 같이 소트하기</p>
      </div>
    </div>
  );
}
