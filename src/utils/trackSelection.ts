import { betterTitle, songKey } from "./songKey.ts";

/**
 * 곡 고르기의 **선택 규칙 한 곳**.
 *
 * 같은 곡을 리패키지·라이브·일본어판으로 여러 번 낸 아티스트에서 앨범을 통째로 고르면
 * 같은 곡이 여러 번 담긴다. 그래서 고를 때 `songKey` 로 묶고, 판 표기가 없는 쪽을 남긴다.
 *
 * 전에는 이 규칙이 "아티스트 전체 선택" 버튼 안에 인라인으로 들어 있었다. 앨범 단위
 * 선택을 더하면서 규칙이 둘로 갈라지면, 화면에 적는 곡 수와 월드컵에 실제로 올라가는
 * 곡 수가 다시 어긋난다(뉴진스에서 46곡이라 적고 28곡만 넘어간 적이 있다).
 */

export interface SelectableTrack {
  id: string;
  title: string;
  duration?: number | string;
}

export interface SelectableAlbum {
  id: string;
  title: string;
  image: string;
  tracks: SelectableTrack[];
}

/** 선택 목록에 넣는 한 줄. 월드컵으로 그대로 넘어간다. */
export interface TrackMeta {
  id: string;
  title: string;
  duration?: number | string;
  artistName: string;
  albumTitle: string;
  albumImage: string;
  albumId: string;
}

export interface Selection {
  ids: Set<string>;
  meta: Record<string, TrackMeta>;
}

/**
 * 앨범 하나를 통째로 고르거나 뺀다.
 *
 * `toggleTrack` 을 곡 수만큼 이어 부르지 않는다 — 그 함수는 지금 closure 의 Set 을 보고
 * 새 Set 을 만들기 때문에, 연달아 부르면 앞선 선택이 덮인다. 한 번에 계산한다.
 *
 * **중복 규칙을 지킨다.** 이미 같은 곡이 다른 판으로 들어가 있으면, 판 표기가 없는 쪽만
 * 남긴다. 그래서 "이 앨범 전체 선택" 을 눌러도 위쪽 곡 수가 앨범 곡 수만큼 늘지 않을 수
 * 있다 — 그게 맞다. 실제로 월드컵에 올라가는 수와 같아진다.
 */
export function setAlbumSelected(
  current: Selection,
  artistName: string,
  album: SelectableAlbum,
  on: boolean,
  /** 미발매 앨범은 중복을 가리지 않고 통째로 넣는다(기존 "전체 선택" 과 같은 규칙). */
  opts: { dedupe?: boolean } = {}
): Selection {
  const dedupe = opts.dedupe ?? true;
  const ids = new Set(current.ids);
  const meta = { ...current.meta };

  if (!on) {
    // 이 앨범의 곡만 뺀다. 다른 앨범에서 고른 곡은 건드리지 않는다.
    for (const track of album.tracks) {
      ids.delete(track.id);
      delete meta[track.id];
    }
    return { ids, meta };
  }

  // 이미 고른 곡들의 "곡 키 -> 트랙 id" 표. 같은 곡이 두 번 담기지 않게 한다.
  const taken = new Map<string, string>();
  if (dedupe) {
    for (const id of ids) {
      const m = meta[id];
      if (m?.title) taken.set(songKey(m.artistName ?? artistName, m.title), id);
    }
  }

  for (const track of album.tracks) {
    if (dedupe) {
      const key = songKey(artistName, track.title);
      const already = taken.get(key);
      if (already) {
        const prev = meta[already];
        // 이미 있는 쪽이 더 깔끔한 제목이면 그대로 둔다.
        if (!prev || betterTitle(prev.title, track.title) <= 0) continue;
        ids.delete(already);
        delete meta[already];
      }
      taken.set(key, track.id);
    }
    ids.add(track.id);
    meta[track.id] = {
      id: track.id,
      title: track.title,
      duration: track.duration,
      artistName,
      albumTitle: album.title,
      albumImage: album.image,
      albumId: album.id,
    };
  }
  return { ids, meta };
}

/**
 * 이 앨범의 곡이 **모두** 선택돼 있는가.
 *
 * 중복 규칙 때문에 앨범의 어떤 곡은 다른 판으로 들어가 있을 수 있다. 그때 이 앨범의
 * 트랙 id 로는 안 잡히지만 사용자에게는 "이미 고른 곡" 이다. 그래서 id 뿐 아니라
 * **곡 키로도** 본다 — 그러지 않으면 버튼이 "전체 선택" 에서 영영 안 바뀐다.
 */
export function albumPickedCount(
  current: Selection,
  artistName: string,
  album: SelectableAlbum
): number {
  const keys = new Set<string>();
  for (const id of current.ids) {
    const m = current.meta[id];
    keys.add(m?.title ? songKey(m.artistName ?? artistName, m.title) : id);
  }
  let n = 0;
  for (const track of album.tracks) {
    if (current.ids.has(track.id) || keys.has(songKey(artistName, track.title))) n++;
  }
  return n;
}
