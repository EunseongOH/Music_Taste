"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 화면 맨 위 레이어. 내용을 `document.body` 바로 아래로 옮겨 그린다.
 *
 * 왜 필요한가: 모달을 쓰는 화면이 제 나름의 **쌓임 맥락**을 만들어 두는 경우가 있다.
 * 월드컵 화면의 `<main>` 은 `relative z-10` 이라 그 안의 모든 것이 z-10 안에서만
 * 겨룬다. 그래서 모달에 아무리 큰 z-index 를 줘도 그 화면의 다른 요소(후보 앨범
 * `z-50`)나 바깥의 레이어(`.bg-grain` 은 body 아래 `z-index:50`)를 못 넘는다.
 * 숫자를 올리는 것으로는 안 되고, **자리를 옮겨야** 한다.
 *
 * 덤으로 조상의 `overflow`·`transform` 에도 매이지 않는다.
 *
 * 서버에서는 `document` 가 없으므로 붙은 뒤에만 그린다.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/**
 * 모달이 열려 있는 동안 뒤 화면이 스크롤되지 않게 한다.
 *
 * 모달 **안쪽** 스크롤은 그대로 둔다 — 바깥만 잠근다. 닫히거나 화면을 떠나면
 * 원래 값으로 되돌린다(빈 문자열로 덮지 않는다 — 다른 곳이 정해 둔 값일 수 있다).
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [active]);
}
