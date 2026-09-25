import { safeLocalStorage } from "./storage.ts";

/**
 * 들어볼 곡 — **사용자가 확정한 뜻을 먼저 적고, 계정에는 되는 대로 옮긴다.**
 *
 * 월드컵에서 곡을 위로 올려 "모르는 곡" 으로 빼면 3초 되돌리기 시간이 지난 뒤 확정된다.
 * 예전에는 그 순간 로그인 상태일 때만 DB 에 썼다.
 *
 *   게스트면          아무 데도 안 남는다. 나중에 로그인해도 되살릴 길이 없다
 *   로그인했는데 실패  console.error 하나 남기고 뜻이 사라진다
 *
 * 문제는 로그인 여부가 아니라 **network·DB 쓰기가 진실의 원천 노릇을 하고 있던 것**이다.
 * 확정된 뜻은 사용자의 것이지 서버의 것이 아니다. 그래서 순서를 뒤집는다.
 *
 *   확정 -> 이 기기에 적는다 -> 계정이 있으면 옮긴다 -> **옮겨진 것만** 지운다
 *
 * 월드컵 진행은 이것을 기다리지 않는다. 저장이 실패해도 판은 계속된다 — 다만 뜻은 남는다.
 *
 * 월드컵 임시저장의 `skipped_tracks` 와는 **다른 책임**이라 같이 두지 않는다.
 * 저쪽은 "진행 중인 판을 이어하기 위한 상태", 이쪽은 "계정에 아직 못 옮긴 확정된 뜻" 이다.
 */

/** 저장소 열쇠. 형식이 바뀌면 뒤에 붙인 번호를 올린다(옛 것을 읽다 터지지 않게). */
const KEY = "pending_listen_later_v1";

/** DB `listen_later_tracks` 에 넣는 데 필요한 만큼만 담는다. */
export interface PendingListenLaterTrack {
  trackId: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  albumImage: string | null;
  albumId: string | null;
  isUnreleased: boolean;
  /** 확정한 시각. 되돌아볼 때 쓰고, 저장 순서를 정하는 데도 쓴다. */
  addedAt: string;
}

/** 월드컵이 들고 있는 곡 모양. 필드가 없을 수 있어 넓게 받는다. */
interface TrackLike {
  id?: string;
  title?: string;
  artistName?: string;
  albumTitle?: string;
  albumImage?: string;
  albumId?: string;
}

/**
 * 곡 하나를 저장할 모양으로 만든다. id·제목이 없으면 null — 그건 담을 수 없다.
 *
 * 미발매곡 판별은 월드컵이 쓰던 규칙 그대로다: `/tracks` 화면이 미발매곡에 가상 앨범
 * id `al_unreleased_<id>` 를 붙인다. 의미가 달라지면 안 되므로 여기 한 곳에만 적는다.
 */
export function normalizeListenLaterTrack(track: TrackLike | null | undefined): PendingListenLaterTrack | null {
  const trackId = track?.id;
  const title = track?.title;
  if (!trackId || !title) return null;
  const albumId = track?.albumId ?? null;
  return {
    trackId,
    title,
    artistName: track?.artistName ?? null,
    albumTitle: track?.albumTitle ?? null,
    albumImage: track?.albumImage ?? null,
    albumId,
    isUnreleased: !!albumId?.startsWith("al_unreleased_"),
    addedAt: new Date().toISOString(),
  };
}

function read(): PendingListenLaterTrack[] {
  try {
    const raw = safeLocalStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 옛 형식·손상된 줄은 조용히 버린다. 한 줄 때문에 전부를 잃지 않는다.
    return parsed.filter((t): t is PendingListenLaterTrack => Boolean(t && typeof t.trackId === "string" && typeof t.title === "string"));
  } catch {
    return [];
  }
}

function write(list: PendingListenLaterTrack[]): void {
  try {
    safeLocalStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 못 적으면 이번 기기에서는 못 이어간다. 월드컵 진행을 막을 일은 아니다 */
  }
}

/** 아직 계정으로 못 옮긴 곡들. 확정한 순서대로. */
export function getPendingListenLater(): PendingListenLaterTrack[] {
  return read();
}

/**
 * 확정된 "모르는 곡" 을 적어 둔다.
 *
 * **되돌리기가 끝난 뒤에만** 부른다. 드래그 직후는 아직 뜻이 아니다.
 * 같은 곡을 여러 판에서 또 빼도 한 번만 남는다 — 처음 확정한 시각을 지킨다.
 */
export function rememberPendingListenLater(track: TrackLike | null | undefined): void {
  const row = normalizeListenLaterTrack(track);
  if (!row) return;
  const list = read();
  if (list.some((t) => t.trackId === row.trackId)) return;
  write([...list, row]);
}

/** 계정으로 옮겨진 곡만 뺀다. 그 사이 새로 들어온 곡은 건드리지 않는다. */
export function removeFlushedPending(trackIds: readonly string[]): void {
  if (trackIds.length === 0) return;
  const done = new Set(trackIds);
  write(read().filter((t) => !done.has(t.trackId)));
}

export type FlushResult =
  /** 옮길 것이 없었다 */
  | { status: "empty" }
  /** 계정이 없다. 뜻은 그대로 남는다 */
  | { status: "no-user" }
  /** 옮겼다 */
  | { status: "flushed"; count: number }
  /** 실패했다. 뜻은 그대로 남는다 */
  | { status: "failed"; error: unknown };

/** 검사에서 갈아 끼울 수 있게 밖으로 뺀다. 기본값은 실제 Supabase 다. */
export interface FlushDeps {
  /** 지금 로그인한 계정. 없으면 null. **저장소의 값을 믿지 않고 세션에서 가져온다.** */
  getUserId?: () => Promise<string | null>;
  upsert?: (userId: string, rows: PendingListenLaterTrack[]) => Promise<{ error: unknown | null }>;
}

async function defaultGetUserId(): Promise<string | null> {
  const { createClient } = await import("./supabase/client");
  const { data } = await createClient().auth.getUser();
  return data?.user?.id ?? null;
}

async function defaultUpsert(userId: string, rows: PendingListenLaterTrack[]): Promise<{ error: unknown | null }> {
  const { createClient } = await import("./supabase/client");
  const { error } = await createClient()
    .from("listen_later_tracks")
    .upsert(
      rows.map((t) => ({
        user_id: userId,
        track_id: t.trackId,
        title: t.title,
        artist_name: t.artistName,
        album_title: t.albumTitle,
        album_image: t.albumImage,
        album_id: t.albumId,
        is_unreleased: t.isUnreleased,
      })),
      // 같은 곡을 여러 번 빼도 DB 에는 한 줄. `UNIQUE(user_id, track_id)` 를 쓴다.
      { onConflict: "user_id,track_id", ignoreDuplicates: true }
    );
  return { error: error ?? null };
}

/**
 * 돌고 있는 옮기기. 같은 로그인에서 AuthProvider 가 user 를 여러 번 갱신하므로
 * 이 함수는 **여러 번 불린다는 전제**로 만든다. 겹쳐 돌지 않게 하나로 묶는다.
 */
let inFlight: Promise<FlushResult> | null = null;

/**
 * 한 번 부르면 **큐가 빌 때까지** 훑는다. 옮기는 동안 새로 확정된 곡이 들어와도
 * 다음 누군가가 불러 주기를 기다리지 않는다.
 *
 * 끝없이 돌지 않게 바퀴 수를 묶는다 — 곡이 계속 들어오는 상황이면 남은 것은 다음
 * 기회에 옮긴다(큐에 그대로 있으므로 잃지 않는다).
 */
const MAX_ROUNDS = 5;

/**
 * 적어 둔 곡을 계정으로 옮긴다.
 *
 * **시작할 때 사진을 한 장 찍고, 성공하면 그 사진에 있던 것만 지운다.** 옮기는 동안
 * 새로 확정된 곡이 들어와도 같이 지워지지 않는다. 실패하면 아무것도 지우지 않는다 —
 * 다음 로그인·다음 확정 때 다시 시도한다.
 */
export function flushPendingListenLater(deps: FlushDeps = {}): Promise<FlushResult> {
  // 돌고 있으면 그것에 올라탄다. 그쪽이 큐가 빌 때까지 훑으므로 새로 들어온 것도 간다.
  if (inFlight) return inFlight;

  const getUserId = deps.getUserId ?? defaultGetUserId;
  const upsert = deps.upsert ?? defaultUpsert;

  const run = async (): Promise<FlushResult> => {
    const snapshot = read();
    if (snapshot.length === 0) return { status: "empty" };

    let userId: string | null = null;
    try {
      userId = await getUserId();
    } catch (error) {
      return { status: "failed", error };
    }
    if (!userId) return { status: "no-user" };

    try {
      const { error } = await upsert(userId, snapshot);
      if (error) return { status: "failed", error };
    } catch (error) {
      return { status: "failed", error };
    }

    // 사진에 있던 것만 지운다. 그 사이 들어온 곡은 남는다.
    removeFlushedPending(snapshot.map((t) => t.trackId));
    return { status: "flushed", count: snapshot.length };
  };

  const p = (async () => {
    let result = await run();
    let moved = result.status === "flushed" ? result.count : 0;
    /*
     * 옮기는 사이에 새로 확정된 곡이 있으면 이어서 옮긴다. 성공했을 때만 계속한다 —
     * 실패·계정 없음이면 큐를 그대로 두고 나가야 한다.
     */
    for (let round = 1; round < MAX_ROUNDS && result.status === "flushed" && read().length > 0; round++) {
      result = await run();
      if (result.status === "flushed") moved += result.count;
    }
    return moved > 0 && result.status !== "failed" ? { status: "flushed" as const, count: moved } : result;
  })().finally(() => {
    inFlight = null;
  });

  inFlight = p;
  return p;
}
