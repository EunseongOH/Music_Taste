"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { ListCard, RecordCard, MosaicCard, PosterCard, ScaledCard, cardHeading, type CardMeta } from "@/components/TasteTemplates";
import PyramidStage from "@/components/result/PyramidStage";
import { listPages, recordPages, mosaicLayout, SHAPES, type Shape } from "@/components/result/exportLayout";
import WinnerReveal from "@/components/result/WinnerReveal";
import fixture from "../../../../toss/baseline/fixture.json";

interface PublicCard {
  id: string;
  title: string;
  count: number;
  single: boolean;
  tracks: RankedTrack[];
}

const PRESETS = [1, 4, 9, 10, 12, 16, 20, 32, 48, 64, 80];
const SHAPE_NAME: Record<Shape, string> = { heart: "하트", star: "별", circle: "원", triangle: "피라미드" };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 원본 곡 수보다 많이 보고 싶으면 앞에서부터 반복한다(id 만 달리). */
function takeTracks(base: RankedTrack[], n: number): RankedTrack[] {
  if (base.length === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = base[i % base.length];
    return i < base.length ? t : { ...t, id: `${t.id}~${i}` };
  });
}

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 py-6 border-t border-navy/10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="type-title-2 text-navy">{title}</h2>
        {note && <p className="type-sub text-navy/70">{note}</p>}
      </div>
      <div className="flex gap-5 overflow-x-auto pb-3">{children}</div>
    </section>
  );
}

function Frame({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <figure className="shrink-0 w-[252px] flex flex-col gap-2 m-0">
      <ScaledCard>{children}</ScaledCard>
      {caption && <figcaption className="type-caption text-navy/70">{caption}</figcaption>}
    </figure>
  );
}

export default function ResultLab() {
  const router = useRouter();
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [source, setSource] = useState<string>("fixture");
  const [count, setCount] = useState(20);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const [revealKey, setRevealKey] = useState(0);
  const [introKey, setIntroKey] = useState(0);

  // 공개 취향표 최근 30개. DB 읽기만 한다(Spotify 호출 없음).
  useEffect(() => {
    createClient()
      .from("tournament_results")
      .select("id,title,ranking,is_single_artist")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }: { data: { id: string; title: string; ranking: unknown; is_single_artist: boolean }[] | null }) => {
        setCards(
          (data ?? []).map((r) => {
            const tracks = normalizeRanking(r.ranking);
            return { id: r.id, title: r.title, count: tracks.length, single: !!r.is_single_artist, tracks };
          })
        );
      });
  }, []);

  const picked = cards.find((c) => c.id === source);
  const base: RankedTrack[] = picked ? picked.tracks : (fixture as RankedTrack[]);
  const tracks = useMemo(() => takeTracks(base, count), [base, count]);
  const heading = cardHeading(tracks, locale);
  const single = picked ? picked.single || heading.single : heading.single;
  const meta: CardMeta = {
    heading: single ? tracks[0]?.artistName ?? heading.heading : heading.heading,
    single,
    date: today(),
    total: tracks.length,
    locale,
  };

  const lp = listPages(tracks.length);
  const rp = recordPages(tracks.length);

  const openResult = () => {
    sessionStorage.setItem("worldcup_ranking", JSON.stringify(tracks));
    sessionStorage.setItem("locale", locale);
    // preview=1: 결과 화면이 운영 DB 에 자동 저장하지 않는다.
    router.push(`/taste?preview=1${single ? "&mode=single" : ""}`);
  };

  return (
    <main className="w-full max-w-[1400px] mx-auto px-6 pb-24">
      <header className="sticky top-0 z-20 bg-[var(--app-bg)]/95 backdrop-blur py-5 flex flex-col gap-3 border-b border-navy/10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="type-title-1 text-navy">결과 템플릿 점검</h1>
          <p className="type-sub text-navy/70">개발·프리뷰 전용 · 곡 수를 바꾸면 모든 템플릿이 바로 다시 그려져요</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 type-sub text-navy">
            데이터
            <select
              id="lab-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                const c = cards.find((x) => x.id === e.target.value);
                setCount(c ? c.count : (fixture as RankedTrack[]).length);
              }}
              className="h-9 px-2 rounded-lg bg-white border border-navy/15 max-w-[320px]"
            >
              <option value="fixture">검사용 fixture · 카더가든 {(fixture as RankedTrack[]).length}곡</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {c.count}곡{c.single ? "" : " · 믹스"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 type-sub text-navy">
            곡 수
            <input
              id="lab-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="h-9 w-20 px-2 rounded-lg bg-white border border-navy/15 font-num tabular-nums"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`h-8 px-3 rounded-full type-caption font-num cursor-pointer ${count === n ? "bg-navy text-cream" : "bg-navy/5 text-navy"}`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(["ko", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`h-8 px-3 rounded-full type-caption cursor-pointer ${locale === l ? "bg-navy text-cream" : "bg-navy/5 text-navy"}`}
              >
                {l === "ko" ? "한국어" : "English"}
              </button>
            ))}
          </div>

          <button onClick={openResult} className="h-9 px-4 rounded-full bg-point text-white type-sub font-semibold cursor-pointer">
            이 데이터로 결과 화면 열기(저장·공유 점검)
          </button>
        </div>
        {base.length < count && (
          <p className="type-caption text-point-ink">원본이 {base.length}곡이라 {count}곡까지 앞에서부터 반복해서 채웠어요.</p>
        )}
      </header>

      <Row title="1위 공개" note="결승 상대 = 2위 곡, 고른 횟수 = 곡 수 − 1 로 가정">
        <div className="shrink-0 flex flex-col gap-2">
          <div className="w-[390px] h-[760px] rounded-[28px] overflow-hidden shadow-[0_0_0_6px_#1B1F2E] relative">
            {tracks[0] && (
              <WinnerReveal
                key={`${revealKey}-${tracks.length}-${locale}`}
                embedded
                champion={tracks[0]}
                runnerUp={tracks[1] ?? null}
                championOnLeft
                totalTracks={tracks.length}
                choices={Math.max(0, tracks.length - 1)}
                isSingleArtistMode={single}
                locale={locale}
                onContinue={openResult}
              />
            )}
          </div>
          <button onClick={() => setRevealKey((k) => k + 1)} className="self-start h-9 px-4 rounded-full bg-navy/5 text-navy type-sub cursor-pointer">
            모션 다시 보기
          </button>
        </div>
      </Row>

      <Row title="인트로 모션" note={`결과 화면 첫 진입 · ${(1 + Math.max(12, tracks.length * 1.2) + 1.5 + 1.2).toFixed(1)}초 · 끝나면 레코드형`}>
        <div className="shrink-0 flex flex-col gap-2">
          {/* 인트로는 화면 전체(fixed)를 덮는다 — transform 을 준 틀 안에 가둬 휴대폰 크기로 본다. */}
          <div className="w-[390px] h-[760px] rounded-[28px] overflow-hidden shadow-[0_0_0_6px_#1B1F2E] relative bg-[#F5F2ED]" style={{ transform: "translateZ(0)" }}>
            <PyramidStage key={`intro-${introKey}-${tracks.length}-${source}`} tracks={tracks} playing onDone={() => {}} skipLabel="건너뛰기" />
          </div>
          <button onClick={() => setIntroKey((k) => k + 1)} className="self-start h-9 px-4 rounded-full bg-navy/5 text-navy type-sub cursor-pointer">
            인트로 다시 보기
          </button>
        </div>
      </Row>

      <Row title="리스트형" note={lp.map((p) => `${p.from + 1}–${p.to}위 (행 ${p.rowH}px)`).join(" · ")}>
        {lp.map((p, i) => (
          <Frame key={`l-${i}`} caption={`${i + 1}장 · ${p.to - p.from}곡`}>
            <ListCard tracks={tracks} meta={meta} page={p} index={i} count={lp.length} />
          </Frame>
        ))}
      </Row>

      <Row title="레코드형" note={rp.map((p) => `${p.from + 1}–${p.to}위${p.hero ? ` (LP ${p.sleeve}px)` : ""} (행 ${p.rowH}px)`).join(" · ")}>
        {rp.map((p, i) => (
          <Frame key={`r-${i}`} caption={`${i + 1}장 · ${p.to - p.from}곡`}>
            <RecordCard tracks={tracks} meta={meta} page={p} index={i} count={rp.length} />
          </Frame>
        ))}
      </Row>

      <Row title="모자이크형" note="모양 4종을 나란히">
        {SHAPES.map((sh) => {
          const l = mosaicLayout(tracks.length, sh);
          const cap = `${SHAPE_NAME[sh]} · 타일 ${l.tile.toFixed(0)}px · ${l.shown < l.total ? `TOP ${l.shown}` : "전곡"} · ${l.labelMode === "overlay" ? "제목 겹치기" : "배지 + 목록"}`;
          return (
            <Frame key={sh} caption={cap}>
              <MosaicCard tracks={tracks} meta={meta} shape={sh} />
            </Frame>
          );
        })}
      </Row>

      <Row title="포스터형" note="글자 배율은 카드 안에서 자동으로 맞춰요">
        <Frame caption="1장">
          <PosterCard key={`poster-${tracks.length}-${source}`} tracks={tracks} meta={meta} />
        </Frame>
      </Row>
    </main>
  );
}
