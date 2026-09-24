"use client";

import { useEffect, useRef } from "react";

/**
 * 화면 아래 고정된 버튼 바가 마지막 콘텐츠를 가리지 않게 한다.
 *
 * 전에는 본문에 `pb-32` 같은 고정값을 적어 두었다. 그 값은 **버튼 한 개짜리 바**에만
 * 맞는다 — 버튼이 둘·셋이 되면 바는 168px, 224px 가 되는데 여백은 128px 그대로라
 * 마지막 곡이 바 뒤로 숨었다. 버튼 수·글자 길이·locale·safe area 가 모두 바 높이를
 * 바꾸므로, 고정값으로는 맞출 수 없다.
 *
 * 그래서 **바의 실제 높이를 재서** 본문이 그만큼 비우게 한다.
 *
 *   const dock = useDockClearance();
 *   …
 *   <DockSpacer />              ← 스크롤되는 본문의 맨 끝
 *   <div ref={dock} className="fixed bottom-0 …">…</div>
 *
 * **safe area 를 따로 더하지 않는다.** 앱인토스에서는 `toss.css` 가 바 자신의
 * padding-bottom 에 `--sai-bottom` 을 더하고 있어, `offsetHeight` 에 이미 들어 있다.
 * 여기서 한 번 더 더하면 토스에서만 빈 공간이 크게 뜬다.
 */

/** 바가 없을 때(아직 안 뜬 첫 프레임)의 기본값. 예전 pb-32 와 같다. */
const FALLBACK = "8rem";
/** 마지막 콘텐츠와 바 사이의 숨 쉴 틈. */
const GAP = 16;

/**
 * 고정 바에 달 ref. 높이를 재서 `--dock-h` 로 내보낸다.
 *
 * 화면마다 바는 하나뿐이라 문서 뿌리에 적는다. 화면을 떠나면 지운다 —
 * 남겨 두면 바가 없는 다음 화면이 까닭 없이 아래가 비어 보인다.
 */
export function useDockClearance<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty("--dock-h");
      return;
    }
    const apply = () => root.style.setProperty("--dock-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--dock-h");
    };
  });

  return ref;
}

/**
 * 스크롤되는 본문 **맨 끝**에 두는 빈 칸.
 *
 * 본문 래퍼에 padding 을 주지 않고 자리를 차지하는 요소를 두는 이유는, 실제로
 * 스크롤되는 것이 어느 요소인지 화면마다 다르기 때문이다. 마지막 자식으로 두면
 * 어느 쪽이 스크롤되든 그만큼 더 내려간다.
 */
export function DockSpacer({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`shrink-0 ${className}`}
      style={{ height: `calc(var(--dock-h, ${FALLBACK}) + ${GAP}px)` }}
    />
  );
}
