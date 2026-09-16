"use client";

import { useEffect, useState } from "react";

/**
 * 앨범 커버를 data URL 로 미리 받아 둔다. 내보내기 카드 전용이다.
 *
 * html-to-image 는 저장할 때마다 카드 안의 이미지를 **다시 내려받는다**. 타일이
 * 수십 개인 모양 모자이크에서는 그중 하나만 늦어도 빈 칸이 생긴다
 * (toss/baseline/capture.mjs 의 "일부 이미지가 누락" 주석이 같은 현상이다).
 * 미리 data URL 로 바꿔 두면 저장 시점에는 네트워크가 필요 없다.
 *
 * i.scdn.co 는 `Access-Control-Allow-Origin: *` 이라 fetch 로 받을 수 있다.
 * 실패한 커버는 지도에 넣지 않는다 — 호출부가 원래 주소를 그대로 쓰면 되고,
 * 그건 지금(항상 원격에서 받는) 동작과 같다.
 */
export function useInlinedCovers(urls: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = urls.filter(Boolean).join("|");

  useEffect(() => {
    const unique = [...new Set(key.split("|").filter((u) => u && !u.startsWith("data:")))];
    if (unique.length === 0) return;
    let alive = true;

    (async () => {
      const entries = await Promise.all(
        unique.map(async (url) => {
          try {
            const res = await fetch(url, { mode: "cors", cache: "force-cache" });
            if (!res.ok) return null;
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            return [url, dataUrl] as const;
          } catch {
            return null;
          }
        })
      );
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setMap((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      alive = false;
    };
  }, [key]);

  return map;
}
