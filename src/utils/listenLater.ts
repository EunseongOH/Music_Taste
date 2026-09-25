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
 *
 * **뜻에는 주인이 있다.** 한 기기를 여러 계정이 쓸 수 있으므로, 적어 둔 줄마다
 * 누구의 뜻인지(`ownerUserId`) 함께 적는다.
 *
 *   로그인 상태에서 확정   그 계정의 것. 쓰기가 실패해도 그 계정의 것으로 남는다
 *   게스트로 확정          주인 없음. 처음 실제로 로그인한 계정이 **이 기기에 먼저 적고** 가져간다
 *   다른 계정으로 로그인    남의 줄은 건드리지 않는다. 그 사람이 다시 로그인할 때 옮긴다
 *
 * 누가 로그인했는지는 여기서 추측하지 않는다 — AuthProvider(와 그 `user` 를 받는 화면)가
 * 확인한 id 를 받아 쓴다.
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
  /** 누구의 뜻인가. 게스트로 확정해 아직 아무 계정도 가져가지 않았으면 null. */
  ownerUserId: string | null;
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
export function normalizeListenLaterTrack(
  track: TrackLike | null | undefined,
  ownerUserId: string | null = null
): PendingListenLaterTrack | null {
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
    ownerUserId,
  };
}

/** 같은 뜻인가 — 같은 계정의 같은 곡. 계정이 다르면 같은 곡이라도 다른 뜻이다. */
const sameIntent = (a: PendingListenLaterTrack, b: PendingListenLaterTrack) =>
  a.trackId === b.trackId && a.ownerUserId === b.ownerUserId;

function read(): PendingListenLaterTrack[] {
  try {
    const raw = safeLocalStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 옛 형식·손상된 줄은 조용히 버린다. 한 줄 때문에 전부를 잃지 않는다.
    return parsed
      .filter((t): t is PendingListenLaterTrack => Boolean(t && typeof t.trackId === "string" && typeof t.title === "string"))
      // 주인 칸이 없거나 망가졌으면 게스트 뜻으로 본다 — 버리면 뜻을 잃는다.
      .map((t) => ({ ...t, ownerUserId: typeof t.ownerUserId === "string" && t.ownerUserId ? t.ownerUserId : null }));
  } catch {
    return [];
  }
}

/** 적었으면 true. 계정에 가져가는 일은 이 결과를 보고 나서만 한다. */
function write(list: PendingListenLaterTrack[]): boolean {
  try {
    safeLocalStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    /* 못 적으면 이번 기기에서는 못 이어간다. 월드컵 진행을 막을 일은 아니다 */
    return false;
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
 * `ownerUserId` 는 확정한 순간 로그인한 계정 — 게스트면 null. 기본값을 두지 않는다:
 * 부르는 쪽이 매번 누구의 뜻인지 말하게 한다.
 * 같은 계정이 같은 곡을 여러 판에서 또 빼도 한 번만 남는다 — 처음 확정한 시각을 지킨다.
 */
export function rememberPendingListenLater(track: TrackLike | null | undefined, ownerUserId: string | null): void {
  const row = normalizeListenLaterTrack(track, ownerUserId || null);
  if (!row) return;
  const list = read();
  if (list.some((t) => sameIntent(t, row))) return;
  write([...list, row]);
}

/**
 * 한 계정으로 옮겨진 곡만 뺀다. 그 사이 새로 들어온 곡도, **다른 계정의 같은 곡도**
 * 건드리지 않는다.
 */
export function removeFlushedPending(ownerUserId: string | null, trackIds: readonly string[]): void {
  if (trackIds.length === 0) return;
  const done = new Set(trackIds);
  write(read().filter((t) => !(t.ownerUserId === ownerUserId && done.has(t.trackId))));
}

/**
 * 게스트 뜻을 이 계정의 것으로 **이 기기에 먼저** 적는다. DB 쓰기보다 앞선다 —
 * 그래야 쓰기가 실패하고 다른 계정이 로그인해도 주인이 바뀌지 않는다.
 *
 * 이 계정에 같은 곡이 이미 있으면 하나로 합친다. 시각은 **먼저 확정한 쪽**을 지킨다
 * (`remember` 의 "처음 확정한 시각" 과 같은 규칙).
 *
 * 적지 못했으면 false — 그때는 가져간 것으로 치지 않는다.
 */
function claimGuestPending(userId: string): boolean {
  const list = read();
  if (!list.some((t) => t.ownerUserId === null)) return true;
  const next: PendingListenLaterTrack[] = [];
  for (const t of list) {
    const row = t.ownerUserId === null ? { ...t, ownerUserId: userId } : t;
    const i = next.findIndex((n) => sameIntent(n, row));
    if (i < 0) next.push(row);
    else if (row.addedAt < next[i].addedAt) next[i] = { ...next[i], addedAt: row.addedAt };
  }
  return write(next);
}

export type FlushResult =
  /** 옮길 것이 없었다 */
  | { status: "empty" }
  /** 계정이 없다(게스트). 뜻은 그대로 남는다 */
  | { status: "no-user" }
  /** 옮겼다 */
  | { status: "flushed"; count: number }
  /** 실패했다. 뜻은 그대로 남는다 */
  | { status: "failed"; error: unknown };

/** 검사에서 갈아 끼울 수 있게 밖으로 뺀다. 기본값은 실제 Supabase 다. */
export interface FlushDeps {
  upsert?: (userId: string, rows: PendingListenLaterTrack[]) => Promise<{ error: unknown | null }>;
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
 * 돌고 있는 옮기기, **계정마다 하나.** 같은 로그인에서 AuthProvider 가 user 를 여러 번
 * 갱신하므로 이 함수는 여러 번 불린다는 전제로 만든다. 같은 계정끼리는 하나로 묶고,
 * 다른 계정은 남의 것에 올라타지 않는다 — A 의 옮기기 결과를 B 가 받으면 안 된다.
 *
 * 둘이 동시에 돌아도 저장소를 망가뜨리지 않는다: 읽고-고쳐-적는 자리마다 사이에
 * await 가 없어서 한 덩어리로 돈다. 각자 제 줄만 쓰고 지운다.
 */
const inFlight = new Map<string, Promise<FlushResult>>();

/**
 * 한 번 부르면 **큐가 빌 때까지** 훑는다. 옮기는 동안 새로 확정된 곡이 들어와도
 * 다음 누군가가 불러 주기를 기다리지 않는다.
 *
 * 끝없이 돌지 않게 바퀴 수를 묶는다 — 곡이 계속 들어오는 상황이면 남은 것은 다음
 * 기회에 옮긴다(큐에 그대로 있으므로 잃지 않는다).
 */
const MAX_ROUNDS = 5;

/**
 * 적어 둔 곡을 `userId` 계정으로 옮긴다.
 *
 * `userId` 는 **부르는 쪽이 인증 경계에서 확인한 계정**이다(AuthProvider 의 `user.id`).
 * 한 번 시작한 옮기기는 끝날 때까지 이 계정으로만 쓴다 — 중간에 세션을 다시 읽어
 * 다른 계정으로 이어 쓰지 않는다. (그 사이 세션이 바뀌면 DB 의 RLS 가 쓰기를 막고,
 * 실패로 끝나 줄은 그대로 남는다.)
 *
 *   1. 게스트 줄을 이 계정 것으로 이 기기에 먼저 적는다(시작할 때 한 번만)
 *   2. 이 계정 줄만 사진을 찍어 옮긴다
 *   3. 성공하면 사진에 있던 것만 지운다. 실패하면 아무것도 지우지 않는다
 *
 * 다른 계정의 줄은 읽지도 쓰지도 지우지도 않는다.
 */
export function flushPendingListenLater(userId: string | null, deps: FlushDeps = {}): Promise<FlushResult> {
  if (!userId) return Promise.resolve(read().length === 0 ? { status: "empty" } : { status: "no-user" });

  // 같은 계정이 돌고 있으면 그것에 올라탄다. 그쪽이 큐가 빌 때까지 훑으므로 새로 들어온 것도 간다.
  const running = inFlight.get(userId);
  if (running) return running;

  const upsert = deps.upsert ?? defaultUpsert;

  const run = async (): Promise<FlushResult> => {
    const snapshot = read().filter((t) => t.ownerUserId === userId);
    if (snapshot.length === 0) return { status: "empty" };

    try {
      const { error } = await upsert(userId, snapshot);
      if (error) return { status: "failed", error };
    } catch (error) {
      return { status: "failed", error };
    }

    // 사진에 있던 것만 지운다. 그 사이 들어온 곡도, 다른 계정의 줄도 남는다.
    removeFlushedPending(userId, snapshot.map((t) => t.trackId));
    return { status: "flushed", count: snapshot.length };
  };

  const p = (async (): Promise<FlushResult> => {
    /*
     * 게스트 줄은 **시작할 때 한 번만** 가져간다. 부른 쪽이 방금 로그인을 확인한 순간이
     * 이때뿐이다 — 옮기는 사이 로그아웃하고 게스트로 새로 확정한 곡을 이 계정이
     * 나중 바퀴에서 집어 가면 안 된다.
     */
    if (!claimGuestPending(userId)) {
      return { status: "failed", error: new Error("게스트 뜻을 이 계정 것으로 적지 못했다") };
    }
    let result = await run();
    let moved = result.status === "flushed" ? result.count : 0;
    /*
     * 옮기는 사이에 새로 확정된 곡이 있으면 이어서 옮긴다. 성공했을 때만 계속한다 —
     * 실패·계정 없음이면 큐를 그대로 두고 나가야 한다.
     */
    for (
      let round = 1;
      round < MAX_ROUNDS && result.status === "flushed" && read().some((t) => t.ownerUserId === userId);
      round++
    ) {
      result = await run();
      if (result.status === "flushed") moved += result.count;
    }
    return moved > 0 && result.status !== "failed" ? { status: "flushed" as const, count: moved } : result;
  })().finally(() => {
    inFlight.delete(userId);
  });

  inFlight.set(userId, p);
  return p;
}
