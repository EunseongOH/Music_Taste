import { coverPlaceholder } from "./coverPlaceholder.ts";

/**
 * 곡 한 줄의 그림. **실제 후보와 마지막 대체 그림을 나눠 둔다.**
 *
 *   1. 앨범 재킷 (albumImage)
 *   2. 같은 곡의 다른 재킷 (albumImageFallbacks — CAA 가 없을 때의 Deezer, 같은 곡의 다른 앨범)
 *   3. 아티스트 사진 (artistImage)
 *   4. coverPlaceholder — 네트워크가 필요 없는 data URI. 저장하지 않고 그릴 때만 만든다
 *
 * 주소가 있다고 그림이 있는 것이 아니다. Cover Art Archive 주소는 발매그룹 ID 로 계산해
 * 만들기 때문에 재킷이 없으면 404 가 난다. 그래서 후보를 **사다리로** 넘기고, 실제로
 * 불러오다 실패하면 다음 칸으로 간다(`useTrackArtwork`, `resolveArtworkDataUrl`).
 *
 * 새 필드는 모두 선택이다. 예전 순위(albumImage 하나뿐)도 그대로 읽힌다.
 */
export interface TrackArtwork {
  id?: string;
  title?: string;
  albumImage?: string | null;
  albumImageFallbacks?: string[];
  artistImage?: string | null;
}

/** 재킷 후보를 몇 개까지 들고 다니는가. 같은 곡이 앨범 열 장에 있어도 순위 JSON 이 불지 않게. */
const MAX_ALBUM_CANDIDATES = 4;

/**
 * `coverPlaceholder` 가 만든 그림인가. 예전 선택·순위에는 이것이 albumImage 자리에 들어가 있다.
 * 실제 재킷이 아니므로 아티스트 사진보다 뒤로 보낸다.
 */
export const isCoverPlaceholder = (url?: string | null): boolean =>
  !!url && url.startsWith("data:image/svg+xml") && url.includes("NO%20COVER");

/** 실제 재킷 후보만 — 빈 값·대체 그림 빼고, 중복 없이, 순서대로. */
export function albumCandidates(t: TrackArtwork | null | undefined): string[] {
  const out: string[] = [];
  for (const u of [t?.albumImage, ...(t?.albumImageFallbacks ?? [])]) {
    if (typeof u === "string" && u && !isCoverPlaceholder(u) && !out.includes(u)) out.push(u);
  }
  return out.slice(0, MAX_ALBUM_CANDIDATES);
}

/** 마지막 칸. 같은 곡이면 언제나 같은 그림이다. */
export const artworkPlaceholder = (t: TrackArtwork | null | undefined): string =>
  coverPlaceholder(t?.id || t?.title || "");

/** 그릴 순서 전체. 마지막은 언제나 대체 그림이라 비어 있지 않다. */
export function artworkChain(t: TrackArtwork | null | undefined): string[] {
  const chain = albumCandidates(t);
  if (t?.artistImage && !chain.includes(t.artistImage)) chain.push(t.artistImage);
  chain.push(artworkPlaceholder(t));
  return chain;
}

export type ArtworkKind = "album" | "artist" | "placeholder";

export function artworkKind(t: TrackArtwork | null | undefined, src: string): ArtworkKind {
  if (albumCandidates(t).includes(src)) return "album";
  if (t?.artistImage && src === t.artistImage) return "artist";
  return "placeholder";
}

/**
 * 같은 곡으로 묶인 여러 줄의 재킷을 **하나도 잃지 않고** 합친다.
 *
 * 대표 제목을 고른 줄이 재킷까지 가장 좋은 것은 아니다. 대표 줄에 재킷이 없고 별칭 줄에
 * 있으면, 대표 줄만 남길 때 재킷이 사라진다. 줄은 대표 순서대로 받는다(부르는 쪽이 정렬).
 */
export function mergeArtwork<T extends TrackArtwork & { artistId?: string }>(rows: readonly T[]): Pick<T, "albumImage" | "albumImageFallbacks" | "artistImage" | "artistId"> {
  const all: string[] = [];
  for (const r of rows) for (const u of albumCandidates(r)) if (!all.includes(u)) all.push(u);
  const kept = all.slice(0, MAX_ALBUM_CANDIDATES);
  const artist = rows.find((r) => r.artistImage);
  return {
    // 실제 재킷이 하나도 없으면 원래 값을 둔다(빈 값이거나 예전 대체 그림) — 없는 재킷을 만들지 않는다.
    albumImage: kept[0] ?? rows[0]?.albumImage ?? "",
    albumImageFallbacks: kept.length > 1 ? kept.slice(1) : undefined,
    ...(artist ? { artistImage: artist.artistImage, artistId: artist.artistId } : {}),
  } as Pick<T, "albumImage" | "albumImageFallbacks" | "artistImage" | "artistId">;
}

/**
 * 예전 초안·진행 중인 판의 곡에는 아티스트 사진이 없다. 이미 들고 있는 고른 아티스트 목록에서
 * 채운다 — 새로 부르지 않는다. 짝은 **아티스트 id 가 같거나 이름이 정확히 같을 때만**
 * (복원 화면이 곡을 아티스트에 거르는 규칙과 같다). 비슷한 이름으로 추측하지 않는다.
 */
export function withArtistImages<T extends { artistName?: string; artistId?: string; artistImage?: string | null }>(
  tracks: T[],
  artists: readonly { id?: string; name?: string; image?: string | null }[] | null | undefined
): T[] {
  if (!artists?.length) return tracks;
  return tracks.map((t) => {
    if (!t || typeof t !== "object" || t.artistImage) return t;
    const a =
      (t.artistId && artists.find((x) => x.id && x.id === t.artistId)) ||
      (t.artistName && artists.find((x) => x.name && x.name.toLowerCase() === t.artistName!.toLowerCase()));
    return a && a.image ? { ...t, artistImage: a.image, ...(a.id && !t.artistId ? { artistId: a.id } : {}) } : t;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 내보내기용: 사다리를 끝까지 **실제로** 받아 본 뒤 data URL 하나로 굳힌다
 * ──────────────────────────────────────────────────────────────────────── */

const fetched = new Map<string, Promise<string | null>>();

/** 주소 하나를 data URL 로. 실패(404·CORS·그림이 아님)는 null. 같은 주소는 한 번만 받는다. */
function fetchAsDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let p = fetched.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url, { mode: "cors", cache: "force-cache" });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) return null;
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
    fetched.set(url, p);
  }
  return p;
}

/**
 * 저장 이미지에 넣을 그림 하나. 재킷 → 다른 재킷 → 아티스트 순으로 받아 보고 처음 성공한 것,
 * 다 실패하면 대체 그림. **원격 주소를 돌려주지 않는다** — 캡처 도중에 다시 받다 깨지는 일이 없다.
 */
export async function resolveArtworkDataUrl(t: TrackArtwork): Promise<string> {
  const chain = artworkChain(t);
  for (const url of chain.slice(0, -1)) {
    const data = await fetchAsDataUrl(url);
    if (data) return data;
  }
  return chain[chain.length - 1];
}
