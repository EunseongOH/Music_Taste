"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artworkChain, artworkKind, resolveArtworkDataUrl, type ArtworkKind, type TrackArtwork } from "./trackArtwork";

/**
 * 곡 하나의 그림을 **한 번** 정한다. 같은 곡을 두 자리(슬리브·LP 라벨)에 그릴 때 이 값을
 * 나눠 쓰면 두 자리가 서로 다른 칸에 머무는 일이 없다.
 *
 * 불러오다 실패한 주소는 기억해 두고 다음 칸으로 간다. 마지막 칸은 data URI 라 실패하지 않는다.
 */
export function useTrackArtwork(track: TrackArtwork | null | undefined): {
  src: string;
  kind: ArtworkKind;
  onError: () => void;
} {
  const chain = useMemo(() => artworkChain(track), [track]);
  const [failed, setFailed] = useState<readonly string[]>([]);
  const src = chain.find((u) => !failed.includes(u)) ?? chain[chain.length - 1];
  const onError = useCallback(() => {
    setFailed((f) => (f.includes(src) ? f : [...f, src]));
  }, [src]);
  return { src, kind: artworkKind(track, src), onError };
}

/**
 * 내보내기 카드용 순위. 곡마다 사다리를 끝까지 받아 본 뒤 **data URL 하나로** 굳힌다.
 *
 * html-to-image 는 저장할 때 카드 안 그림을 다시 받는다. 원격 주소가 남아 있으면 그 자리에서
 * 404 가 나 빈 칸·깨진 그림이 된다. 그래서 캡처 전에 끝낸다.
 *
 * `whenReady` — 저장 단추는 화면이 뜨자마자 누를 수 있다. 굳힌 결과가 **화면에 반영된 뒤**
 * 풀리는 약속이라, 기다린 다음 DOM 을 잡으면 된다(시간을 재서 기다리지 않는다).
 */
export function useResolvedArtwork<T extends TrackArtwork>(tracks: readonly T[]): {
  resolved: T[] | null;
  whenReady: () => Promise<void>;
} {
  const key = tracks.map((t) => `${t.id}\u0001${artworkChain(t).slice(0, -1).join("\u0002")}`).join("\n");
  const [done, setDone] = useState<{ key: string; tracks: T[] } | null>(null);
  const ready = done?.key === key;

  useEffect(() => {
    let alive = true;
    void Promise.all(
      tracks.map(async (t) => ({
        ...t,
        albumImage: await resolveArtworkDataUrl(t),
        // 굳힌 뒤에는 원격 후보를 남기지 않는다 — 대체 그림으로 굳었어도 아티스트 주소로 되돌아가지 않게.
        albumImageFallbacks: undefined,
        artistImage: undefined,
      }))
    ).then((r) => {
      if (alive) setDone({ key, tracks: r });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key 가 tracks 의 그림 전부를 담는다
  }, [key]);

  const readyRef = useRef(false);
  const waiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    readyRef.current = ready;
    if (ready) for (const w of waiters.current.splice(0)) w();
  }, [ready]);

  const whenReady = useCallback(
    () => (readyRef.current ? Promise.resolve() : new Promise<void>((r) => waiters.current.push(r))),
    []
  );

  return { resolved: ready ? done!.tracks : null, whenReady };
}
