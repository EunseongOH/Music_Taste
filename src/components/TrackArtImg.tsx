"use client";

import React from "react";
import type { TrackArtwork } from "@/utils/trackArtwork";
import { useTrackArtwork } from "@/utils/useTrackArtwork";

/**
 * 곡 그림 `<img>`. 재킷 → 다른 재킷 → 아티스트 사진 → 대체 그림 순으로, 실제로 불러오다
 * 실패하면 다음 칸으로 간다. 목록처럼 곡마다 훅을 부를 수 없는 자리에서 쓴다.
 */
export function TrackArtImg({
  track,
  ...props
}: { track: TrackArtwork | null | undefined } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError">) {
  const art = useTrackArtwork(track);
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- 부르는 쪽이 alt 를 준다
  return <img {...props} src={art.src} onError={art.onError} data-artwork={art.kind} />;
}
