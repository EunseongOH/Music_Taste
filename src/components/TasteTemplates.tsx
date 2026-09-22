/* eslint-disable @next/next/no-img-element -- 이미지로 저장되는 카드라 next/image 의 지연 로딩을 쓰지 않는다 */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LIST_FEATURE_H,
  LIST_TOP_GAP,
  MOSAIC_LIST_GAP,
  MOSAIC_LIST_ROW_H,
  RECORD_GROUP_RATIO,
  RECORD_INFO_H,
  mosaicLayout,
  shapeSvg,
  type ListPage,
  type RecordPage,
  type Shape,
} from "@/components/result/exportLayout";

/**
 * 9:16 취향표 카드(450×800).
 *
 * 화면에 보이는 카드와 이미지로 저장되는 카드가 **같은 컴포넌트**다. 화면에서는
 * `ScaledCard` 로 폭에 맞춰 줄여 보여주고, 저장은 오프스크린의 원래 크기 카드를
 * html-to-image 로 찍는다. 장 나누기·배치는 `exportLayout.ts` 가 정한다.
 *
 * 저장 이미지는 고정 크기라 글자 크기를 px 로 박아 둔다(타이포 토큰은 화면용).
 * 최소 11px — 5배 저장이라 실제 이미지에서는 55px 이다.
 */

export interface CardTrack {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

export interface CardMeta {
  /** 카드 제목. 한 아티스트면 아티스트명, 여럿이면 "○○ 외 n명" */
  heading: string;
  single: boolean;
  /** "2026.09.15" */
  date: string;
  total: number;
  locale: "ko" | "en";
}

const text = {
  ko: {
    single: "최애 곡 소트하기",
    multi: "믹스 매치 월드컵",
    count: (n: number) => `${n}곡`,
    side: (k: number, from: number, to: number) => `${"ABCDEFGH"[k]}면 · ${from}–${to}위`,
    range: (from: number, to: number) => `${from}–${to}위`,
    winner: "1위",
    more: (n: number) => `외 ${n}곡`,
    lineup: "취향 라인업",
    // 페스티벌의 "헤드라이너" 자리. 서비스에서 이미 쓰는 말(최애 곡 소트하기)로 부른다.
    headliner: "최애 곡",
    fine: (label: string, total: number, shown: number) =>
      `${label} · 전체 ${total}곡${shown < total ? ` 중 TOP ${shown}` : ""}`,
  },
  en: {
    single: "My favorites",
    multi: "Mix match world cup",
    count: (n: number) => `${n} songs`,
    side: (k: number, from: number, to: number) => `Side ${"ABCDEFGH"[k]} · ${from}–${to}`,
    range: (from: number, to: number) => `${from}–${to}`,
    winner: "No. 1",
    more: (n: number) => `+${n} more`,
    lineup: "Taste lineup",
    headliner: "Top pick",
    fine: (label: string, total: number, shown: number) =>
      `${label} · ${shown < total ? `Top ${shown} of ` : ""}${total} songs`,
  },
};

/** 곡 목록에서 카드 제목을 만든다. */
export function cardHeading(tracks: CardTrack[], locale: "ko" | "en"): { heading: string; single: boolean } {
  const artists = [...new Set(tracks.map((t) => t.artistName).filter(Boolean))];
  if (artists.length <= 1) return { heading: artists[0] ?? "Sortify", single: true };
  const rest = artists.length - 1;
  return { heading: locale === "en" ? `${artists[0]} +${rest}` : `${artists[0]} 외 ${rest}명`, single: false };
}

// ---------------------------------------------------------------------------
// 공통 틀
// ---------------------------------------------------------------------------

function CardFrame({
  meta,
  sub,
  page,
  pages,
  children,
}: {
  meta: CardMeta;
  sub?: string;
  page?: number;
  pages?: number;
  children: React.ReactNode;
}) {
  const t = text[meta.locale];
  return (
    <div className="w-[450px] h-[800px] bg-cream text-navy flex flex-col px-8 pt-9 pb-[26px] overflow-hidden">
      <header className="flex flex-col gap-1 mb-5">
        <p className="text-[12px] leading-[18px] text-navy/70">
          {meta.date} · {meta.single ? t.single : t.multi} · {t.count(meta.total)}
        </p>
        <h2 className="text-[26px] leading-[31px] font-extrabold tracking-[-0.03em] truncate">{meta.heading}</h2>
        {sub && <p className="text-[13px] leading-[18px] font-semibold text-point-ink">{sub}</p>}
      </header>
      <div className="flex-1 min-h-0 relative">{children}</div>
      <CardFooter page={page} pages={pages} />
    </div>
  );
}

function CardFooter({ page, pages }: { page?: number; pages?: number }) {
  return (
    <footer className="flex items-baseline gap-2 mt-4 text-[12px] leading-[18px] text-navy/70">
      <span className="text-[15px] font-extrabold tracking-[-0.04em] text-navy newtone:font-wordmark">Sortify</span>
      <span>sortify.kr</span>
      {pages && pages > 1 && (
        <span className="ml-auto font-num tabular-nums text-[13px] font-semibold">
          {page}/{pages}
        </span>
      )}
    </footer>
  );
}

function Cover({ src, size, round = false, className = "" }: { src: string; size: number; round?: boolean; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      className={`block object-cover shrink-0 ${round ? "rounded-full" : "rounded-[3px]"} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

const rankColor = (rank: number) => (rank <= 3 ? "text-point-ink" : "text-navy/70");

// ---------------------------------------------------------------------------
// 리스트형 — 모든 행에 앨범 재킷
// ---------------------------------------------------------------------------

/**
 * 행 높이 하나로 재킷·순위·글자 크기를 정한다. 곡이 적어 행이 커지면 모두 함께 커진다.
 * 56px 이상이면 제목·아티스트를 두 줄로, 그보다 작으면 한 줄로 잇는다.
 */
function rowStyle(h: number) {
  const stacked = h >= 56;
  return {
    stacked,
    img: stacked ? Math.min(96, h - 12) : Math.min(36, h - 6),
    rank: stacked ? Math.round(Math.min(34, 16 + h * 0.14)) : h >= 31 ? 15 : 13,
    title: stacked ? (h >= 90 ? 20 : 17) : h >= 31 ? 14 : 13,
    artist: stacked ? (h >= 90 ? 14 : 13) : 12,
    rankCol: stacked && h >= 90 ? 40 : 30,
  };
}

function ListRow({ track, rank, height, single }: { track: CardTrack; rank: number; height: number; single: boolean }) {
  const s = rowStyle(height);
  return (
    <li className="grid items-center gap-x-3" style={{ height, gridTemplateColumns: `${s.rankCol}px auto 1fr` }}>
      <span className={`font-num tabular-nums font-bold text-right ${rankColor(rank)}`} style={{ fontSize: s.rank, lineHeight: 1 }}>
        {rank}
      </span>
      <Cover src={track.albumImage} size={s.img} />
      <span className={`min-w-0 flex ${s.stacked ? "flex-col" : "items-baseline gap-2"}`}>
        <b className={`truncate ${height < 31 ? "font-semibold" : "font-bold"}`} style={{ fontSize: s.title, lineHeight: 1.3 }}>
          {track.title}
        </b>
        {!single && (
          <i className="not-italic truncate text-navy/70 shrink-[2]" style={{ fontSize: s.artist, lineHeight: 1.3 }}>
            {track.artistName}
          </i>
        )}
      </span>
    </li>
  );
}

export function ListCard({
  tracks,
  meta,
  page,
  index,
  count,
}: {
  tracks: CardTrack[];
  meta: CardMeta;
  page: ListPage;
  index: number;
  count: number;
}) {
  const t = text[meta.locale];
  const part = tracks.slice(page.from, page.to);
  const row = (track: CardTrack, i: number, height: number) => (
    <ListRow key={`${track.id}-${page.from + i}`} track={track} rank={page.from + i + 1} height={height} single={meta.single} />
  );
  return (
    <CardFrame meta={meta} sub={count > 1 ? t.side(index, page.from + 1, page.to) : undefined} page={index + 1} pages={count}>
      <ol className="flex flex-col">
        {page.hasFeature ? (
          <>
            {part.slice(0, 3).map((tr, i) => row(tr, i, LIST_FEATURE_H))}
            {part.length > 3 && <li aria-hidden style={{ height: LIST_TOP_GAP }} />}
            {part.slice(3).map((tr, i) => row(tr, i + 3, page.rowH))}
          </>
        ) : (
          part.map((tr, i) => row(tr, i, page.rowH))
        )}
      </ol>
    </CardFrame>
  );
}

// ---------------------------------------------------------------------------
// 레코드형 — 1위는 슬리브에서 반쯤 나온 LP
// ---------------------------------------------------------------------------

export const DISC_BACKGROUND =
  "radial-gradient(circle, transparent 0 19%, rgba(255,255,255,0.08) 19% 19.6%, transparent 19.6%), " +
  "repeating-radial-gradient(circle, #161616 0 1.5px, #232323 1.5px 3px)";

function MiniRecord({ src, size }: { src: string; size: number }) {
  return (
    <span className="relative shrink-0 rounded-full overflow-hidden" style={{ width: size, height: size }}>
      <Cover src={src} size={size} round />
      <span className="absolute inset-0 m-auto w-[5px] h-[5px] rounded-full bg-cream" />
    </span>
  );
}

/** 리스트형과 같은 크기 규칙(rowStyle)에 커버만 작은 레코드로. */
function RecordRow({ track, rank, height, single }: { track: CardTrack; rank: number; height: number; single: boolean }) {
  const s = rowStyle(height);
  return (
    <li className="grid items-center gap-x-3" style={{ height, gridTemplateColumns: `${s.rankCol}px auto 1fr` }}>
      <span className={`font-num tabular-nums font-bold text-right ${rankColor(rank)}`} style={{ fontSize: s.rank, lineHeight: 1 }}>
        {rank}
      </span>
      <MiniRecord src={track.albumImage} size={s.img} />
      <span className={`min-w-0 flex ${s.stacked ? "flex-col" : "items-baseline gap-2"}`}>
        <b className="truncate font-semibold" style={{ fontSize: s.title, lineHeight: 1.3 }}>
          {track.title}
        </b>
        {!single && (
          <i className="not-italic truncate text-navy/70 shrink-[2]" style={{ fontSize: s.artist, lineHeight: 1.3 }}>
            {track.artistName}
          </i>
        )}
      </span>
    </li>
  );
}

export function RecordCard({
  tracks,
  meta,
  page,
  index,
  count,
}: {
  tracks: CardTrack[];
  meta: CardMeta;
  page: RecordPage;
  index: number;
  count: number;
}) {
  const t = text[meta.locale];
  const top = tracks[0];
  const from = page.hero ? 1 : page.from;
  const rows = tracks.slice(from, page.to);
  const sleeve = page.sleeve;
  // LP 는 슬리브보다 조금 작게, 슬리브 오른쪽으로 반쯤 나오게.
  const disc = Math.round(sleeve * 0.93);
  return (
    <CardFrame meta={meta} sub={page.hero ? undefined : t.range(page.from + 1, page.to)} page={index + 1} pages={count}>
      {page.hero && top && (
        <>
          {/* 슬리브와 빠져나온 LP 를 한 묶음으로 가운데 둔다. */}
          <div className="relative mb-4 mx-auto" style={{ width: Math.round(sleeve * RECORD_GROUP_RATIO), height: sleeve }}>
            <div
              className="absolute rounded-full"
              style={{ left: Math.round(sleeve * 0.51), top: Math.round((sleeve - disc) / 2), width: disc, height: disc, background: DISC_BACKGROUND }}
            >
              <Cover src={top.albumImage} size={Math.round(disc * 0.35)} round className="absolute inset-0 m-auto" />
              <span className="absolute inset-0 m-auto w-[6px] h-[6px] rounded-full bg-cream" />
            </div>
            <Cover
              src={top.albumImage}
              size={sleeve}
              className="absolute left-0 top-0 !rounded-none shadow-[0_10px_24px_-10px_rgba(var(--t-ink-rgb),0.45)]"
            />
          </div>
          <div className="mb-4 flex flex-col justify-end items-center text-center gap-1" style={{ height: RECORD_INFO_H }}>
            <span className="text-[13px] leading-[18px] font-bold text-point-ink">{t.winner}</span>
            <h3 className="text-[26px] leading-[31px] font-extrabold tracking-[-0.03em] line-clamp-2 break-keep">{top.title}</h3>
            <p className="text-[14px] leading-[20px] text-navy/70 truncate max-w-full">{top.artistName}</p>
          </div>
        </>
      )}
      <ol className="flex flex-col">
        {rows.map((tr, i) => (
          <RecordRow key={`${tr.id}-${from + i}`} track={tr} rank={from + i + 1} height={page.rowH} single={meta.single} />
        ))}
      </ol>
    </CardFrame>
  );
}

/** 2단 번호 목록. 모자이크형에서 커버만으로 곡을 알 수 없을 때 붙인다. */
function RankTitleList({ tracks, count, rows, locale, className = "", style }: { tracks: CardTrack[]; count: number; rows: number; locale: "ko" | "en"; className?: string; style?: React.CSSProperties }) {
  const t = text[locale];
  return (
    <div className={`shrink-0 ${className}`} style={{ marginTop: MOSAIC_LIST_GAP, ...style }}>
      <ol className="grid grid-cols-2 gap-x-4 grid-flow-col" style={{ gridTemplateRows: `repeat(${rows}, ${MOSAIC_LIST_ROW_H}px)` }}>
        {tracks.slice(0, count).map((tr, i) => (
          <li key={`${tr.id}-${i}`} className="flex items-baseline gap-1.5 min-w-0" style={{ fontSize: 12, lineHeight: `${MOSAIC_LIST_ROW_H}px` }}>
            <span className={`font-num tabular-nums font-bold w-[18px] text-right shrink-0 ${rankColor(i + 1)}`}>{i + 1}</span>
            <span className="truncate font-semibold">{tr.title}</span>
          </li>
        ))}
      </ol>
      {count < tracks.length && (
        <p className="text-navy/70" style={{ fontSize: 12, lineHeight: `${MOSAIC_LIST_ROW_H}px` }}>
          {t.more(tracks.length - count)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 모자이크형 — 커버를 모양 틀 안에
// ---------------------------------------------------------------------------

function maskStyle(shape: Shape): React.CSSProperties {
  // base64 — `<`·`#`·`"` 가 style 속성과 html-to-image 의 XML 직렬화를 지나며 깨지지 않게.
  const url = `url("data:image/svg+xml;base64,${btoa(shapeSvg(shape))}")`;
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
}

export function MosaicCard({ tracks, meta, shape }: { tracks: CardTrack[]; meta: CardMeta; shape: Shape }) {
  const t = text[meta.locale];
  const layout = useMemo(() => mosaicLayout(tracks.length, shape), [tracks.length, shape]);
  const overlay = layout.labelMode === "overlay";
  const top = tracks[0];

  return (
    <CardFrame meta={meta}>
      <div className="h-full flex flex-col justify-center">
        <div className="relative mx-auto shrink-0" style={{ width: layout.width, height: layout.height, ...maskStyle(shape) }}>
          {layout.cells.map((c, i) => {
            const box = { left: c.x, top: c.y, width: c.w, height: c.h };
            if (c.rank === null) {
              // 곡이 없는 채움 칸: 놓인 곡의 커버를 옅게 깔아 실루엣을 끊기지 않게 한다.
              // 순위 표시가 없으니 곡으로 읽히지 않는다.
              const filler = tracks.length ? tracks[i % Math.min(tracks.length, layout.shown || 1)] : null;
              return (
                <div key={i} className="absolute overflow-hidden bg-[#E9E3D9] newtone:bg-navy/[0.06]" style={box}>
                  {filler && <img src={filler.albumImage} alt="" crossOrigin="anonymous" className="block w-full h-full object-cover opacity-30" />}
                </div>
              );
            }
            const track = tracks[c.rank];
            const rank = c.rank + 1;
            return (
              <div key={i} className="absolute overflow-hidden" style={box}>
                <img src={track.albumImage} alt="" crossOrigin="anonymous" className="block w-full h-full object-cover" />
                {overlay ? (
                  <div className="absolute inset-0 bg-navy/45 flex flex-col items-center justify-center text-center px-2 gap-0.5">
                    <span className="font-num font-bold text-white" style={{ fontSize: rank === 1 ? 18 : 15, lineHeight: 1 }}>
                      {rank}
                    </span>
                    <span className="font-bold text-white line-clamp-2 break-keep" style={{ fontSize: 13, lineHeight: 1.25 }}>
                      {track.title}
                    </span>
                  </div>
                ) : (
                  // 순위 숫자: 작은 반투명 칩을 왼쪽 아래 모서리에(모양에 잘리는 칸만 가운데).
                  // 타일이 작으면 10위까지만 단다 — 나머지는 아래 목록으로.
                  rank <= layout.badgeCount && (
                    <span
                      className={`absolute min-w-[16px] h-[13px] px-[3px] rounded-[3px] font-num tabular-nums font-bold flex items-center justify-center ${
                        rank === 1 ? "bg-point text-white" : "bg-navy/75 text-white"
                      } ${c.cornerSafe ? "left-[3px] bottom-[3px]" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`}
                      style={{ fontSize: 10, lineHeight: 1 }}
                    >
                      {rank}
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {overlay && top ? (
          <div className="mt-6 flex flex-col gap-1">
            <span className="text-[13px] leading-[18px] font-bold text-point-ink">{t.winner}</span>
            <h3 className="text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] line-clamp-2 break-keep">{top.title}</h3>
            {!meta.single && <p className="text-[14px] leading-[20px] text-navy/70 truncate">{top.artistName}</p>}
          </div>
        ) : (
          <RankTitleList tracks={tracks} count={layout.listCount} rows={layout.listRows} locale={meta.locale} />
        )}
      </div>
    </CardFrame>
  );
}

// ---------------------------------------------------------------------------
// 포스터형 — 페스티벌 라인업 문법
// ---------------------------------------------------------------------------

/** 가장 작은 글자 하한. 이보다 작아져야 하면 곡 수를 줄인다(TOP N). */
const POSTER_MIN_FONT = 11;

function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-point-ink font-num font-bold tracking-[0.1em]" style={{ fontSize: "calc(11px * var(--k))" }}>
      <span className="flex-1 h-px bg-navy/20" />
      {children}
      <span className="flex-1 h-px bg-navy/20" />
    </div>
  );
}

/**
 * 곡명을 •로 잇는다. 제목은 inline-block 이라 줄이 제목 중간에서 끊기지 않는다.
 * 양끝 맞춤은 곡이 적은 줄에서 간격이 크게 벌어져 가운데 정렬 + text-wrap: balance 로 둔다.
 */
function joined(list: CardTrack[]) {
  return list.map((tr, i) => (
    <React.Fragment key={`${tr.id}-${i}`}>
      {i > 0 && (
        <>
          {" "}
          <span className="text-point newtone:text-point-ink">•</span>{" "}
        </>
      )}
      <span className="inline-block max-w-full">{tr.title}</span>
    </React.Fragment>
  ));
}

/** 곡 수가 바뀌면 부모가 key 를 바꿔 새로 그린다(줄여 둔 TOP N 을 초기화). */
export function PosterCard({ tracks, meta }: { tracks: CardTrack[]; meta: CardMeta }) {
  const t = text[meta.locale];
  const [count, setCount] = useState(tracks.length);
  const rootRef = useRef<HTMLDivElement>(null);
  const billRef = useRef<HTMLDivElement>(null);

  /**
   * 글자 크기 배율 --k 를 줄여 가며 본문에 맞춘다. 가장 작은 글자가 11px 아래로
   * 가야 한다면 곡 수를 줄인다(TOP N). DOM 을 직접 재므로 폰트가 준비된 뒤에 한다.
   */
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const root = rootRef.current;
      const bill = billRef.current;
      if (!root || !bill || cancelled) return;
      // 곡이 적으면 크게 시작해서(최대 1.8배) 넘치지 않을 때까지 줄인다.
      let k = 1.8;
      root.style.setProperty("--k", String(k));
      while (bill.scrollHeight > bill.clientHeight + 1 && k > 0.4) {
        k -= 0.02;
        root.style.setProperty("--k", String(k));
      }
      const smallestBase = count > 30 ? 11.5 : count > 10 ? 13.5 : count > 3 ? 17 : 25;
      if (smallestBase * k < POSTER_MIN_FONT && count > 10) setCount((c) => Math.max(10, c - 4));
    };
    if (document.fonts?.ready) document.fonts.ready.then(run);
    else run();
    return () => {
      cancelled = true;
    };
  }, [count, tracks]);

  const shown = tracks.slice(0, count);
  const tier = (from: number, to: number) => shown.slice(from, Math.min(to, shown.length));

  return (
    <div ref={rootRef} className="w-[450px] h-[800px] bg-cream text-navy flex flex-col px-8 pt-9 pb-[26px] overflow-hidden text-center">
      <div className="flex flex-col items-center gap-[3px] pb-2">
        <p className="text-[11px] leading-[16px] font-semibold tracking-[0.18em] text-point-ink">Sortify {t.lineup}</p>
        <h2 className="text-[32px] leading-[1] font-extrabold tracking-[-0.05em] truncate max-w-full">{meta.heading}</h2>
        <p className="font-num text-[11px] leading-[16px] font-semibold tracking-[0.12em] text-navy/70">{meta.date.replace(/\./g, " . ")}</p>
        <div className="self-stretch h-[3px] border-y border-navy mt-2" />
      </div>

      <div
        ref={billRef}
        className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden"
        style={{ gap: "calc(11px * var(--k, 1))", padding: "calc(10px * var(--k, 1)) 0" }}
      >
        {shown[0] && (
          <div className="flex flex-col" style={{ gap: "calc(3px * var(--k, 1))" }}>
            <Band>{t.headliner}</Band>
            <div className="font-extrabold tracking-[-0.05em] break-keep text-balance" style={{ fontSize: "calc(50px * var(--k, 1))", lineHeight: 1 }}>
              {shown[0].title}
            </div>
            {!meta.single && <div className="text-navy/70" style={{ fontSize: "calc(12px * var(--k, 1))" }}>{shown[0].artistName}</div>}
          </div>
        )}
        {shown.length > 1 && (
          <div className="flex flex-col" style={{ gap: "calc(3px * var(--k, 1))" }}>
            <Band>2 — {Math.min(3, shown.length)}</Band>
            <div className="font-extrabold tracking-[-0.04em] break-keep" style={{ fontSize: "calc(25px * var(--k, 1))", lineHeight: 1.08 }}>
              {joined(tier(1, 3))}
            </div>
          </div>
        )}
        {shown.length > 3 && (
          <div className="flex flex-col" style={{ gap: "calc(3px * var(--k, 1))" }}>
            <Band>4 — {Math.min(10, shown.length)}</Band>
            <div className="font-bold tracking-[-0.03em] break-keep text-balance" style={{ fontSize: "calc(17px * var(--k, 1))", lineHeight: 1.22 }}>
              {joined(tier(3, 10))}
            </div>
          </div>
        )}
        {shown.length > 10 && (
          <div className="flex flex-col" style={{ gap: "calc(3px * var(--k, 1))" }}>
            <Band>11 — {Math.min(30, shown.length)}</Band>
            <div className="font-semibold tracking-[-0.02em] break-keep text-balance" style={{ fontSize: "calc(13.5px * var(--k, 1))", lineHeight: 1.3 }}>
              {joined(tier(10, 30))}
            </div>
          </div>
        )}
        {shown.length > 30 && (
          <div className="flex flex-col" style={{ gap: "calc(3px * var(--k, 1))" }}>
            <Band>31 — {shown.length}</Band>
            <div className="font-medium text-navy/70 break-keep text-balance" style={{ fontSize: "calc(11.5px * var(--k, 1))", lineHeight: 1.35 }}>
              {joined(tier(30, shown.length))}
            </div>
          </div>
        )}
      </div>

      <p className="pt-2 border-t border-navy/20 text-[11px] leading-[16px] tracking-[0.06em] text-navy/70">
        {t.fine(meta.single ? t.single : t.multi, tracks.length, shown.length)} · sortify.kr
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 화면용 축소 틀
// ---------------------------------------------------------------------------

/** 450×800 카드를 부모 폭에 맞춰 줄여 보여준다(최대 원래 크기). */
export function ScaledCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / 450));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={`w-full ${className}`}>
      <div
        className="relative overflow-hidden rounded-[6px] shadow-[0_1px_2px_rgba(var(--t-ink-rgb),0.08),0_12px_32px_-12px_rgba(var(--t-ink-rgb),0.28)] mx-auto"
        style={{ width: 450 * scale, height: 800 * scale }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: 450, height: 800, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
