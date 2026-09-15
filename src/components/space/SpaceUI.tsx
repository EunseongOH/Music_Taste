"use client";

/**
 * 내 취향 스페이스 · 우리의 취향 아카이브 · 프로필 창이 같이 쓰는 UI 조각.
 *
 * 박스(테두리·그림자 카드) 대신 글자 위계와 구분선으로 구역을 나눈다.
 * 글자는 docs/design-system/typography.md 의 type-* 토큰만 쓴다.
 * 범용 컴포넌트 라이브러리가 아니다 — 세 화면에서 반복되는 것만 모았다.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// 버튼 · 링크 클래스 (컴포넌트로 감쌀 만큼 로직이 없어 문자열로 둔다)
// ---------------------------------------------------------------------------

/** 주 버튼: navy 알약. */
export const primaryButton =
  "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-navy text-cream type-body-strong active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-50";

/** 보조 버튼: 옅은 면. */
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-navy/5 text-navy type-body-strong active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-50";

/** 글자 링크. */
export const textLink =
  "inline-flex items-center gap-1 type-sub text-navy border-b border-navy/20 pb-0.5 cursor-pointer hover:border-navy transition-colors";

// ---------------------------------------------------------------------------
// 날짜
// ---------------------------------------------------------------------------

/** 2026.09.13 / Sep 13, 2026 */
export function formatDate(iso: string, locale: "ko" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (locale === "en") {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// 탭 · 섹션 제목 · 빈 상태
// ---------------------------------------------------------------------------

export function UnderlineTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number | null }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex border-b border-navy/10">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 py-3 type-body-strong transition-colors cursor-pointer ${
              selected ? "text-navy" : "text-navy/70 hover:text-navy"
            }`}
          >
            {tab.label}
            {tab.count != null && <span className="ml-1">{tab.count}</span>}
            {selected && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-point" />}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({
  title,
  count,
  action,
  className = "",
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="type-title-2 text-navy">
        {title}
        {count != null && <span className="ml-1.5 text-navy/70">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-14 text-center flex flex-col items-center">
      <p className="type-title-2 text-navy">{title}</p>
      {desc && <p className="type-sub text-navy/70 mt-1.5 max-w-[300px]">{desc}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 커버 · 아바타
// ---------------------------------------------------------------------------

/** 앨범 커버. 이미지가 없으면 같은 크기의 옅은 면만 둔다(아이콘을 넣지 않는다). */
export function Cover({ src, alt, size }: { src?: string | null; alt: string; size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-navy/5"
      style={{ width: size, height: size }}
    >
      {src && <Image src={src} alt={alt} width={size} height={size} className="object-cover w-full h-full" />}
    </div>
  );
}

export function Avatar({ src, alt, size }: { src?: string | null; alt: string; size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-navy/5"
      style={{ width: size, height: size }}
    >
      <Image
        src={src || "/default-profile.png"}
        alt={alt}
        width={size}
        height={size}
        className="object-cover w-full h-full"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 스위치
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-point" : "bg-navy/20"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// 순위 목록
// ---------------------------------------------------------------------------

export interface RankTrack {
  id?: string;
  title: string;
  artistName: string;
  albumImage?: string;
}

/** 취향표 순위. 1~3위 숫자만 강조색, 나머지는 보조색. */
export function RankList({ tracks }: { tracks: RankTrack[] }) {
  return (
    <ol className="divide-y divide-navy/10">
      {tracks.map((track, idx) => (
        <li key={`${track.id ?? ""}-${idx}`} className="flex items-center gap-3 py-2.5">
          <span
            className={`w-7 shrink-0 text-center type-title-2 font-serif ${
              idx < 3 ? "text-point-ink" : "text-navy/70"
            }`}
          >
            {idx + 1}
          </span>
          <Cover src={track.albumImage} alt={track.title} size={40} />
          <div className="flex-1 min-w-0">
            <p className="type-body-strong text-navy truncate">{track.title}</p>
            <p className="type-caption text-navy/70 truncate">{track.artistName}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// 하단 시트 · 확인 시트
// ---------------------------------------------------------------------------

/**
 * 하단 시트(토스 앱 방식). 상세 보기와 확인에 같이 쓴다.
 *
 * ⚠️ `fixed bottom-0` 과 `p-6` 을 한 줄 className 에 둔다. 토스 빌드의 safe-area 보정
 * (toss/app/src/toss.css) 이 이 조합에만 걸리고, bundle-check 가 한 줄 단위로 검사한다.
 */
export function Sheet({
  open,
  onClose,
  header,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[999] bg-navy/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 left-0 right-0 z-[1000] mx-auto w-full max-w-[430px] max-h-[90vh] flex flex-col bg-cream rounded-t-[1.75rem] p-6"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div className="flex-1 min-w-0">{header}</div>
              <button
                onClick={onClose}
                aria-label={closeLabel}
                className="-mr-2 -mt-1 w-9 h-9 flex items-center justify-center rounded-full text-navy hover:bg-navy/5 cursor-pointer shrink-0"
              >
                <X size={20} strokeWidth={2.25} />
              </button>
            </div>
            {children && <div className="flex-1 min-h-0 overflow-y-auto mt-4 -mx-6 px-6">{children}</div>}
            {footer && <div className="shrink-0 pt-4">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ConfirmSheet({
  open,
  title,
  desc,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  danger = false,
  busy = false,
}: {
  open: boolean;
  title: string;
  desc?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={cancelLabel}
      header={
        <>
          <h2 className="type-title-1 text-navy">{title}</h2>
          {desc && <p className="type-sub text-navy/70 mt-1">{desc}</p>}
        </>
      }
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className={`${secondaryButton} flex-1`}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`${primaryButton} flex-1 ${danger ? "!bg-red-700" : ""}`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 토스트
// ---------------------------------------------------------------------------

export type ToastState = { text: string; tone: "info" | "error" } | null;

/** 몇 초 뒤 사라지는 알림. `window.alert` 대신 쓴다(토스 WebView 에서 네이티브 알림이 어색하다). */
export function useToast(duration = 3000) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (text: string, tone: "info" | "error" = "info") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ text, tone });
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [duration]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { toast, showToast };
}

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          aria-live="polite"
          className="fixed left-0 right-0 z-[1100] flex justify-center px-4 pointer-events-none"
          // 토스 미니앱은 --sai-top 으로 상단 안전 영역을 준다(노치 아래에 뜨게).
          style={{ top: "calc(1rem + var(--sai-top, 0px))" }}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
        >
          <p
            className={`max-w-[400px] px-4 py-3 rounded-2xl type-sub ${
              toast.tone === "error" ? "bg-red-900 text-red-50" : "bg-navy text-cream"
            }`}
          >
            {toast.text}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
