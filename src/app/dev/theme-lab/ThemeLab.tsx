"use client";

/**
 * 테마 시안 비교. 색은 전부 CSS 변수(--t-*)에서 읽어 와 **지금 적용된 테마의 실제 값**으로
 * 대비를 계산한다 — 문서의 숫자와 화면이 어긋나면 여기서 바로 보인다.
 */

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  ConfirmSheet,
  EmptyState,
  RankList,
  SectionTitle,
  Sheet,
  Switch,
  Toast,
  UnderlineTabs,
  dangerButton,
  primaryButton,
  secondaryButton,
  textLink,
  useToast,
} from "@/components/space/SpaceUI";
import FeedbackModal from "@/components/FeedbackModal";

const THEMES = [
  { id: "legacy", label: "지금 (cream · navy)" },
  { id: "toss-white", label: "A. 흰 바탕 + 회색 면" },
  { id: "sky-tint", label: "B. 옅은 하늘빛 바탕" },
] as const;

const WORDMARKS = [
  { id: "playfair", label: "Playfair Display", note: "지금 · 세리프 · OFL · 38 KB" },
  { id: "pretendard", label: "Pretendard ExtraBold", note: "추가 없음 · 본문과 같은 서체" },
  { id: "wanted", label: "Wanted Sans Std", note: "추가 없음 · 숫자용으로 이미 번들(82 KB)" },
  { id: "nunito", label: "Nunito", note: "둥근 끝 · OFL · 39 KB" },
  { id: "quicksand", label: "Quicksand", note: "둥근 기하 · OFL · 28 KB" },
  { id: "outfit", label: "Outfit", note: "기하 산세리프 · OFL · 32 KB" },
  { id: "jakarta", label: "Plus Jakarta Sans", note: "현대 산세리프 · OFL · 27 KB" },
] as const;

const WORDMARK_FONT: Record<string, string> = {
  playfair: "var(--font-playfair)",
  pretendard: "var(--font-pretendard)",
  wanted: "var(--font-wanted)",
  nunito: "var(--font-nunito)",
  quicksand: "var(--font-quicksand)",
  outfit: "var(--font-outfit)",
  jakarta: "var(--font-jakarta)",
};

/** 역할 → CSS 변수. 대비는 항상 "바탕(cream) 위 글자" 기준. */
const SWATCHES = [
  { v: "--t-cream", name: "cream", role: "화면·시트 바탕" },
  { v: "--background", name: "background", role: "앱 바깥 바탕" },
  { v: "--t-navy", name: "navy", role: "글자 · 주 버튼 면" },
  { v: "--t-charcoal", name: "charcoal", role: "본문 대체(레거시)" },
  { v: "--t-point", name: "point", role: "강조 선·면 (글자 금지)" },
  { v: "--t-point-ink", name: "point-ink", role: "강조 글자" },
  { v: "--t-danger", name: "danger", role: "잃는 행동 · 오류" },
  { v: "--t-brand", name: "brand (2차 제안)", role: "주 버튼·링크 전용 파랑" },
  { v: "--t-ink", name: "ink (2차 제안)", role: "본문 전용 글자색" },
];

const LOGO_ONLY = [
  { hex: "#4C9EFE", name: "하트 밝은 파랑" },
  { hex: "#4063FB", name: "하트 진한 파랑" },
  { hex: "#6577FD", name: "보라빛 파랑" },
  { hex: "#A0F0FC", name: "하늘" },
  { hex: "#81F0F8", name: "음표 민트" },
  { hex: "#FDA84B", name: "점 밝은 주황" },
  { hex: "#FE7045", name: "점 진한 주황" },
];

/** #rgb · #rrggbb · rgb(r g b) 를 읽는다. 빌드된 CSS 는 #FFFFFF 를 #fff 로 줄여 둔다. */
function parse(color: string): [number, number, number] | null {
  const c = color.trim();
  const short = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return [short[1], short[2], short[3]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const rgb = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}
const toHex = (color: string) => {
  const p = parse(color);
  return p ? "#" + p.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase() : color;
};
function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number | null {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** navy/70 처럼 바탕 위에 불투명도로 얹은 색의 실제 값 */
function over(fg: string, alpha: number, bg: string): string {
  const a = parse(fg);
  const b = parse(bg);
  if (!a || !b) return fg;
  return "#" + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

const Ratio = ({ value }: { value: number | null }) =>
  value === null ? null : (
    <span className={`type-caption font-num tabular-nums ${value >= 4.5 ? "text-navy/70" : "text-danger"}`}>
      {value.toFixed(2)}:1{value < 4.5 ? " · 글자 불가" : ""}
    </span>
  );

const SAMPLE_TRACKS = [
  { title: "Feel My Rhythm", artistName: "Red Velvet" },
  { title: "Psycho", artistName: "Red Velvet" },
  { title: "Bad Boy", artistName: "Red Velvet" },
  { title: "Queendom", artistName: "Red Velvet" },
];

const SCREENS = [
  { href: "/", label: "홈" },
  { href: "/explore?mode=single", label: "아티스트 고르기" },
  { href: "/tracks?mode=single", label: "곡 고르기" },
  { href: "/worldcup?mode=single", label: "월드컵" },
  { href: "/dev/result-lab", label: "취향표 템플릿 점검" },
  { href: "/explore-taste", label: "내 취향 스페이스" },
  { href: "/archive", label: "우리의 취향 아카이브" },
  { href: "/together", label: "같이 소트하기" },
];

export default function ThemeLab() {
  const [theme, setTheme] = useState("legacy");
  const [wordmark, setWordmark] = useState("playfair");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"a" | "b">("a");
  const [on, setOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const { toast, showToast } = useToast();

  const readVars = useCallback(() => {
    const cs = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const s of SWATCHES) next[s.v] = cs.getPropertyValue(s.v).trim();
    setVars(next);
  }, []);

  useEffect(() => {
    const d = document.documentElement;
    setTheme(d.getAttribute("data-theme") ?? "legacy");
    setWordmark(d.getAttribute("data-wordmark") ?? "playfair");
    readVars();
  }, [readVars]);

  const apply = (kind: "theme" | "wordmark", value: string) => {
    const d = document.documentElement;
    const isDefault = value === "legacy" || value === "playfair";
    if (isDefault) d.removeAttribute(`data-${kind}`);
    else d.setAttribute(`data-${kind}`, value);
    try {
      localStorage.setItem(`sortify_${kind}`, value);
    } catch {}
    if (kind === "theme") setTheme(value);
    else setWordmark(value);
    readVars();
  };

  const bg = vars["--t-cream"] ?? "#FFFFFF";
  const navy = vars["--t-navy"] ?? "#000000";

  return (
    <main className="min-h-screen bg-cream text-navy px-5 py-8 max-w-[760px] mx-auto flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="type-caption text-navy/70">design/logo-theme · 개발용</p>
        <h1 className="type-title-1">테마 시안 비교</h1>
        <p className="type-sub text-navy/70 break-keep">
          고른 테마와 워드마크는 이 브라우저에 저장돼요. 아래 화면 링크로 이동해도 그대로 유지돼요.
        </p>
      </header>

      {/* 전환 */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="바탕과 색" />
        <div className="flex flex-col gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => apply("theme", t.id)}
              className={`${theme === t.id ? primaryButton : secondaryButton} w-full`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 워드마크 */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="워드마크 서체" />
        <ul className="divide-y divide-navy/10">
          {WORDMARKS.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => apply("wordmark", w.id)}
                className="w-full flex items-center gap-4 py-4 text-left cursor-pointer"
              >
                <Image src="/logo-mark.png" alt="" width={48} height={48} className="rounded-xl shrink-0" />
                <span className="flex-1 min-w-0">
                  <span
                    className="block text-4xl font-bold tracking-tight leading-none"
                    style={{ fontFamily: WORDMARK_FONT[w.id], fontWeight: w.id === "playfair" ? 700 : 800 }}
                  >
                    Sortify
                  </span>
                  <span className="block type-caption text-navy/70 mt-1.5">
                    {w.label} · {w.note}
                  </span>
                </span>
                <span className={`type-sub font-semibold shrink-0 ${wordmark === w.id ? "text-point-ink" : "text-navy/40"}`}>
                  {wordmark === w.id ? "적용 중" : "적용"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-navy/5 p-6 flex flex-col items-center gap-2">
          <p className="type-caption text-navy/70">홈에서 보이는 모습 (font-wordmark)</p>
          <p className="font-wordmark text-5xl font-bold tracking-tight">Sortify</p>
          <p className="type-sub text-navy/70 text-center">
            좋아하는 곡 중에서도,
            <br />더 마음이 가는 곡을 찾는 곳, Sortify
          </p>
        </div>
      </section>

      {/* 색 견본 */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="역할 색" count={SWATCHES.length} />
        <ul className="divide-y divide-navy/10">
          {SWATCHES.map((s) => {
            const hex = vars[s.v] ?? "";
            return (
              <li key={s.v} className="flex items-center gap-3 py-3">
                <span className="w-11 h-11 rounded-xl border border-navy/10 shrink-0" style={{ background: `var(${s.v})` }} />
                <span className="flex-1 min-w-0">
                  <span className="block type-body-strong">{s.name}</span>
                  <span className="block type-caption text-navy/70">{s.role}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block type-caption font-num text-navy/70">{toHex(hex)}</span>
                  <Ratio value={contrast(hex, bg)} />
                </span>
              </li>
            );
          })}
        </ul>

        <SectionTitle title="글자 단계 (바탕 위 실제 대비)" className="mt-4" />
        <ul className="flex flex-col gap-2">
          {[
            { cls: "text-navy", label: "기본 text-navy", a: 1 },
            { cls: "text-navy/70", label: "보조 text-navy/70 — 정보 글자의 가장 옅은 단계", a: 0.7 },
            { cls: "text-navy/40", label: "비활성 text-navy/40 — 정보를 담지 않는다", a: 0.4 },
          ].map((row) => (
            <li key={row.cls} className="flex items-baseline justify-between gap-3">
              <span className={`type-body ${row.cls}`}>{row.label}</span>
              <Ratio value={contrast(over(navy, row.a, bg), bg)} />
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3">
            <span className="type-body text-point-ink">강조 글자 text-point-ink</span>
            <Ratio value={contrast(vars["--t-point-ink"] ?? "", bg)} />
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span className="type-body text-danger">오류 · 잃는 행동 text-danger</span>
            <Ratio value={contrast(vars["--t-danger"] ?? "", bg)} />
          </li>
        </ul>

        <SectionTitle title="로고 전용 색 — 면·그림에만, 글자·버튼 금지" className="mt-4" />
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {LOGO_ONLY.map((c) => (
            <div key={c.hex} className="flex flex-col gap-1">
              <span className="h-12 rounded-xl" style={{ background: c.hex }} />
              <span className="type-caption text-navy/70 leading-tight">{c.name}</span>
              <Ratio value={contrast(c.hex, "#FFFFFF")} />
            </div>
          ))}
        </div>
        <div
          className="h-20 rounded-2xl flex items-end p-4"
          style={{ background: "linear-gradient(135deg, #A0F0FC 0%, #4C9EFE 45%, #4063FB 100%)" }}
        >
          <span className="type-caption text-white">그라데이션은 빈 상태·공유 카드 같은 그림 자리에만</span>
        </div>
      </section>

      {/* 부품 */}
      <section className="flex flex-col gap-5">
        <SectionTitle title="공용 부품" />
        <div className="flex flex-col gap-2">
          <button className={`${primaryButton} w-full`}>소트 시작하기 · primaryButton</button>
          <button className={`${secondaryButton} w-full`}>취소 · secondaryButton</button>
          <button className={`${dangerButton} w-full`}>저장하지 않고 나가기 · dangerButton</button>
          <button className={`${primaryButton} w-full`} disabled>
            비활성
          </button>
          <button className={`${textLink} self-center mt-1`}>계속하기 · textLink</button>
        </div>

        <div className="rounded-2xl border border-line p-4 flex flex-col gap-2">
          <p className="type-caption text-navy/70">2차 제안 — 글자(ink)와 주 버튼(brand)을 나눈 경우. 아직 어떤 화면도 쓰지 않는다.</p>
          <button className="inline-flex items-center justify-center h-12 px-6 rounded-full bg-brand text-white type-body-strong w-full">
            소트 시작하기 · bg-brand
          </button>
          <p className="type-body text-ink">본문은 text-ink. 파랑이 아니라 거의 검정에 가까운 회색이에요.</p>
          <p className="type-sub text-brand">링크·강조 글자는 text-brand</p>
          <div className="h-12 rounded-xl bg-fill flex items-center px-4 type-sub text-ink">면 bg-fill · 선 border-line</div>
        </div>

        <UnderlineTabs
          tabs={[
            { id: "a", label: "내 취향표", count: 3 },
            { id: "b", label: "들어볼 곡", count: 12 },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div className="flex items-center justify-between">
          <span className="type-body">취향표 공개</span>
          <Switch checked={on} onChange={() => setOn((v) => !v)} label="공개" />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="type-sub text-navy/70">입력</span>
          <input
            placeholder="아티스트 검색"
            className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none type-body text-navy placeholder:text-navy/40"
          />
        </label>

        <div>
          <SectionTitle title="목록 행 · 순위" />
          <RankList tracks={SAMPLE_TRACKS} />
        </div>

        <div className="w-full h-1.5 bg-navy/10 rounded-full overflow-hidden">
          <div className="h-full bg-point rounded-full" style={{ width: "62%" }} />
        </div>

        <EmptyState title="아직 들어볼 곡이 없어요" desc="월드컵에서 모르는 곡을 위로 올려 빼면 여기에 모여요." />

        <div className="flex flex-col gap-2">
          <button className={`${secondaryButton} w-full`} onClick={() => setSheet(true)}>
            나가기 시트 열기
          </button>
          <button className={`${secondaryButton} w-full`} onClick={() => setConfirm(true)}>
            삭제 확인 시트 열기
          </button>
          <button className={`${secondaryButton} w-full`} onClick={() => setFeedback(true)}>
            제보 창 열기
          </button>
          <button className={`${secondaryButton} w-full`} onClick={() => showToast("취향표를 저장했어요")}>
            토스트
          </button>
          <button className={`${secondaryButton} w-full`} onClick={() => showToast("곡을 불러오지 못했어요", "error")}>
            오류 토스트
          </button>
        </div>
      </section>

      {/* 실제 화면 */}
      <section className="flex flex-col gap-3">
        <SectionTitle title="실제 화면에서 보기" />
        <p className="type-sub text-navy/70 break-keep">
          같은 테마가 유지돼요. 색을 직접 적은 곳(hex)은 테마를 따라오지 않아요 — 그런 곳은 문서의 목록에 있어요.
        </p>
        <ul className="divide-y divide-navy/10">
          {SCREENS.map((s) => (
            <li key={s.href}>
              <a href={s.href} className="flex items-center justify-between py-3 type-body-strong">
                {s.label}
                <span className="type-caption text-navy/70">{s.href}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        closeLabel="계속하기"
        header={
          <>
            <h2 className="type-title-1 text-navy">월드컵을 그만둘까요?</h2>
            <p className="type-sub text-navy/70 mt-1 whitespace-pre-line break-keep">
              {"128강 중 64강까지 진행했어요.\n임시저장하면 24시간 동안 보관되고, 저장하지 않으면 진행 내역이 사라져요."}
            </p>
          </>
        }
        footer={
          <div className="flex flex-col gap-2">
            <button className={`${primaryButton} w-full`}>임시저장하고 나가기</button>
            <button className={`${dangerButton} w-full`}>저장하지 않고 나가기</button>
            <button className={`${textLink} self-center mt-2`} onClick={() => setSheet(false)}>
              계속하기
            </button>
          </div>
        }
      />
      <ConfirmSheet
        open={confirm}
        title="취향표를 삭제할까요?"
        desc="삭제하면 되돌릴 수 없어요."
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
      <FeedbackModal isOpen={feedback} onClose={() => setFeedback(false)} kind="data_error" contextLabel="Red Velvet" />
      <Toast toast={toast} />
    </main>
  );
}
