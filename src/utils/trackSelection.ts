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
 * **중복 규칙은 `resolveCanonicalTracks` 하나만 쓴다.** 예전에는 여기에도 songKey
 * 중복 제거가 따로 적혀 있었는데, 규칙이 두 곳에 있으면 반드시 갈라진다. 그래서
 * "이 앨범 전체 선택" 을 눌러도 위쪽 곡 수가 앨범 곡 수만큼 늘지 않을 수 있다 —
 * 그게 맞다. 실제로 월드컵에 올라가는 수와 같아진다.
 */
export function setAlbumSelected(
  current: Selection,
  artistName: string,
  album: SelectableAlbum,
  on: boolean
): Selection {
  if (!on) return clearAllTracks(current, [album]);

  const ids = new Set(current.ids);
  const meta = { ...current.meta };
  for (const t of albumTrackMetas(artistName, album)) {
    ids.add(t.id);
    meta[t.id] = t;
  }
  return pruneToCanonical({ ids, meta });
}

/**
 * 이 앨범의 곡이 **몇 곡 골라져 있는가.**
 *
 * 중복 규칙 때문에 앨범의 어떤 곡은 다른 판으로 들어가 있을 수 있다. 그때 이 앨범의
 * 트랙 id 로는 안 잡히지만 사용자에게는 "이미 고른 곡" 이다. 그래서 id 뿐 아니라
 * **곡 키로도** 본다 — 그러지 않으면 단추가 "전체 선택" 에서 영영 안 바뀐다.
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

/* ─────────────────────────────────────────────────────────────────────────
 * canonical track — "월드컵에 실제로 올라가는 곡" 을 정하는 **한 자리**
 * ──────────────────────────────────────────────────────────────────────── */

/** 같은 곡으로 묶인 결과. 대표 한 줄 + 버리지 않은 다른 제목들. */
export interface CanonicalTrack extends TrackMeta {
  /**
   * 같은 곡으로 묶인 **다른 제목들.** 대표 제목은 빼고, 사전순으로 담는다.
   *
   * 버리지 않는 이유: 우리 DB 는 같은 녹음에 같은 id 를 주면서 앨범마다 제목 표기가
   * 다를 수 있다(볼빨간사춘기에서 `RED PLANET` 과 `Full Album RED PLANET` 이
   * "싸운날" / "Fight Day" 로 갈렸다). 대표만 남기고 나머지를 지우면 왜 한 곡이
   * 됐는지 아무도 되짚을 수 없다. 화면에 꼭 쓰지 않아도 근거는 남긴다.
   */
  aliases: string[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 둘 중 어느 쪽을 대표로 남길지. **총 순서**다 — 값이 같아도 갈라진다.
 *
 * `betterTitle` 만 쓰면 "판 표기도 없고 길이도 같은" 두 제목에서 승자가 정해지지 않아,
 * 들어온 순서에 따라 답이 달라진다. 제목 다음 id 로 갈라 순서와 무관하게 만든다.
 */
function better(a: TrackMeta, b: TrackMeta): number {
  return betterTitle(a.title, b.title) || cmp(a.title, b.title) || cmp(a.id, b.id);
}

/**
 * 월드컵에 올라갈 곡을 정한다. **화면에 적는 수도, 고르는 것도, 넘기는 것도 여기를 지난다.**
 *
 * 두 단계이고 **순서가 중요하다.**
 *
 *   1) **트랙 id** 로 합친다. 선택은 `Set<id>` 로 담기므로 id 가 같으면 애초에 한 곡이다.
 *   2) **songKey** 로 합친다. 같은 곡이 리패키지·라이브·일본어판으로 여러 번 나온 것을 묶는다.
 *
 * 1단계를 건너뛰면 머리말과 시작 단추의 수가 어긋난다 — 이게 "83 Tracks 인데 79 로
 * 시작" 의 실제 원인이었다. 머리말은 앨범의 raw 제목을 songKey 로 셌고(같은 id 가
 * 두 제목이면 2곡), 선택은 id 로 담았다(1곡). 재현: 볼빨간사춘기 84 vs 80.
 *
 * 결과는 **들어온 순서에 좌우되지 않는다.** 대표를 총 순서로 고르고 별칭을 사전순으로
 * 담는다. 배열의 나열 순서만 입력을 따른다(앨범 순서를 월드컵에 그대로 넘기기 위해).
 */
export function resolveCanonicalTracks(tracks: readonly TrackMeta[]): CanonicalTrack[] {
  // 1단계 — 트랙 id
  const byId = new Map<string, { best: TrackMeta; titles: Set<string> }>();
  for (const t of tracks) {
    if (!t?.id) continue;
    const g = byId.get(t.id);
    if (!g) {
      byId.set(t.id, { best: t, titles: new Set([t.title]) });
      continue;
    }
    g.titles.add(t.title);
    if (better(t, g.best) < 0) g.best = t;
  }

  // 2단계 — songKey
  const bySong = new Map<string, { best: TrackMeta; titles: Set<string> }>();
  for (const { best, titles } of byId.values()) {
    const key = songKey(best.artistName ?? "", best.title);
    const g = bySong.get(key);
    if (!g) {
      bySong.set(key, { best, titles: new Set(titles) });
      continue;
    }
    for (const x of titles) g.titles.add(x);
    if (better(best, g.best) < 0) g.best = best;
  }

  return [...bySong.values()].map(({ best, titles }) => ({
    ...best,
    aliases: [...titles].filter((x) => x !== best.title).sort(cmp),
  }));
}

/** 앨범 한 장의 수록곡을 `TrackMeta` 로 편다. 세는 쪽과 고르는 쪽이 같은 모양을 쓴다. */
export function albumTrackMetas(artistName: string, album: SelectableAlbum): TrackMeta[] {
  return album.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    artistName,
    albumTitle: album.title,
    albumImage: album.image,
    albumId: album.id,
  }));
}

/**
 * 이 아티스트에서 **고를 수 있는 곡 전부** (canonical universe).
 *
 * 수록곡을 아직 못 받은 앨범은 셈에 넣지 않는다. 앨범이 말하는 곡 수(`totalTracks`)를
 * 더해 확정 숫자처럼 보이면 안 된다 — 그 곡들은 고를 수도, 월드컵에 넣을 수도 없다.
 * 아직 받는 중인지는 화면이 `albumsSettled` 로 갈라 말한다.
 */
export function canonicalUniverse(
  artistName: string,
  albums: readonly (SelectableAlbum | null | undefined)[],
  unreleased: readonly SelectableAlbum[] = []
): CanonicalTrack[] {
  const metas: TrackMeta[] = [];
  for (const al of albums) if (al?.tracks?.length) metas.push(...albumTrackMetas(artistName, al));
  // 미발매곡도 같은 규칙으로 센다. 월드컵이 songKey 로 합치므로 여기서 따로 셀 이유가 없다.
  for (const al of unreleased) if (al?.tracks?.length) metas.push(...albumTrackMetas(artistName, al));
  return resolveCanonicalTracks(metas);
}

/** 고른 곡 중 월드컵에 실제로 올라가는 것. 하단 숫자와 `handleStartWorldCup` 이 같이 쓴다. */
export function canonicalSelection(current: Selection): CanonicalTrack[] {
  const metas: TrackMeta[] = [];
  for (const id of current.ids) {
    const m = current.meta[id];
    // 메타가 없으면 id 만으로 따로 센다 — 합칠 근거가 없으니 합치지 않는다.
    metas.push(m ?? { id, title: id, artistName: "", albumTitle: "", albumImage: "", albumId: "" });
  }
  return resolveCanonicalTracks(metas);
}

/**
 * 고른 곡 중 월드컵에 올라가지 못할 것을 **실제로 뺀다.**
 *
 * 화면의 수와 월드컵의 수를 맞추는 것만으로는 부족하다. 곡을 남겨 두고 세는 쪽에서만
 * 빼면, 사용자는 체크된 곡을 보면서 "이건 왜 안 나왔지" 를 겪는다. 안 올라갈 곡은
 * 애초에 체크가 풀려 있어야 한다.
 */
export function pruneToCanonical(current: Selection): Selection {
  const keep = new Set(canonicalSelection(current).map((t) => t.id));
  const ids = new Set<string>();
  const meta: Record<string, TrackMeta> = {};
  for (const id of current.ids) {
    if (!keep.has(id)) continue;
    ids.add(id);
    if (current.meta[id]) meta[id] = current.meta[id];
  }
  return { ids, meta };
}

/**
 * 이 아티스트의 곡을 전부 고른다.
 *
 * `canonicalUniverse` 와 **같은 함수**를 지나므로, 다 불러온 뒤에는
 * 머리말 수 = 고른 수 = 월드컵에 올라가는 수가 반드시 같다.
 */
export function selectAllTracks(
  current: Selection,
  artistName: string,
  albums: readonly (SelectableAlbum | null | undefined)[],
  unreleased: readonly SelectableAlbum[] = []
): Selection {
  const ids = new Set(current.ids);
  const meta = { ...current.meta };
  for (const t of canonicalUniverse(artistName, albums, unreleased)) {
    ids.add(t.id);
    meta[t.id] = t;
  }
  return pruneToCanonical({ ids, meta });
}

/** 이 아티스트의 곡을 전부 뺀다. 다른 아티스트에서 고른 곡은 건드리지 않는다. */
export function clearAllTracks(
  current: Selection,
  albums: readonly (SelectableAlbum | null | undefined)[],
  unreleased: readonly SelectableAlbum[] = []
): Selection {
  const ids = new Set(current.ids);
  const meta = { ...current.meta };
  for (const al of [...albums, ...unreleased]) {
    for (const t of al?.tracks ?? []) {
      ids.delete(t.id);
      delete meta[t.id];
    }
  }
  return { ids, meta };
}
