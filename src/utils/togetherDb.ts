"use client";

import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage } from "@/utils/storage";
import { makeCode } from "@/utils/togetherMatch";
import { deviceClaimSecret, deviceParticipantKey } from "@/utils/togetherIdentity";
import type { RankedTrack } from "@/utils/ranking";

/**
 * 같이 소트하기 — 저장소 접근. 문서: docs/together-sort.md
 * 실험 기능이라 `/together/*` 화면에서만 쓴다.
 */

export interface SortChallenge {
  id: string;
  code: string;
  creator_id: string | null;
  creator_nickname: string | null;
  artist_name: string | null;
  /** 방을 만들 때 고른 아티스트(초대 화면 배경). 마이그레이션 전 방은 없다. */
  artist_id?: string | null;
  artist_image?: string | null;
  title: string;
  tracks: RankedTrack[];
  source_result_id: string | null;
  created_at: string;
}

export interface ChallengeEntry {
  id: string;
  challenge_id: string;
  participant_key: string;
  nickname: string | null;
  /** 곡 id 배열(1위부터) */
  ranking: string[];
  skipped_count: number;
  /**
   * 직접 소트한 것이 아니라 **이전 취향표를 불러온** 기록인가.
   * 방장이 내 취향표로 방을 만들 때만 true 다. 다시 소트하면 false 로 덮인다.
   */
  imported?: boolean;
  created_at: string;
}

/* 참여 신원은 utils/togetherIdentity.ts 가 맡는다 — 로그인해도 바뀌지 않는다. */

/**
 * 내가 만든 링크인가.
 *
 * `creator_id` 만으로는 모자란다 — 링크는 로그인 없이도 만들 수 있어서(`createChallenge`
 * 의 `creatorId: user?.id ?? null`) 비로그인으로 만들면 그 칸이 비어 있다. 그래서 만들 때
 * 코드를 기기에도 남기고, 둘 중 하나만 맞아도 방장으로 본다.
 */
const MINE_KEY = "together_mine";

function mineCodes(): string[] {
  try {
    const raw = safeLocalStorage.getItem(MINE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberMine(code: string): void {
  // 오래된 것부터 버린다. 기기에 무한정 쌓을 이유가 없다.
  const next = [...mineCodes().filter((c) => c !== code), code].slice(-50);
  safeLocalStorage.setItem(MINE_KEY, JSON.stringify(next));
}

export function isMine(challenge: Pick<SortChallenge, "code" | "creator_id">, userId?: string | null): boolean {
  if (challenge.creator_id && userId && challenge.creator_id === userId) return true;
  return mineCodes().includes(challenge.code);
}

/**
 * 방을 찾는다. **없는 것(null)과 못 읽은 것(throw)을 가른다** — UX-014.
 * 예전에는 둘 다 null 이라, 연결이 끊긴 초대 링크가 "지워졌거나 잘못된 링크"로 보이거나
 * 화면이 "불러오고 있어요"에 멈췄다. 부르는 쪽은 throw 를 받아 "불러오지 못했어요 · 다시 시도"를 보여 준다.
 */
export async function fetchChallenge(code: string): Promise<SortChallenge | null> {
  const { data, error } = await createClient().from("sort_challenges").select("*").eq("code", code).maybeSingle();
  if (error) {
    console.error("[together] 챌린지를 불러오지 못했어요:", error.message);
    throw new Error(error.message);
  }
  return (data as SortChallenge) ?? null;
}

export async function fetchEntries(challengeId: string): Promise<ChallengeEntry[]> {
  /*
   * **남의 계정 정보를 화면에 내려보내지 않는다.** 관계도·참가자 목록에 필요한 것만
   * 고른다 — `user_id` 와 `claim_token_hash` 는 여기 실리면 안 된다.
   */
  const { data, error } = await createClient()
    .from("sort_challenge_entries")
    .select("id,challenge_id,participant_key,nickname,ranking,skipped_count,imported,created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[together] 참여 기록을 불러오지 못했어요:", error.message);
    return [];
  }
  return (data ?? []) as ChallengeEntry[];
}

/** 코드가 겹치면 몇 번 다시 만든다(짧은 코드라 드물지만 확실히 하려고). */
export async function createChallenge(input: {
  /** 로그인하지 않았으면 null — 링크는 누구나 만들 수 있다. */
  creatorId: string | null;
  creatorNickname: string | null;
  artistName: string | null;
  /** 초대 화면 배경에 쓸 아티스트. 아티스트를 골라 만든 방에만 있다. */
  artistId?: string | null;
  artistImage?: string | null;
  title: string;
  tracks: RankedTrack[];
  sourceResultId: string | null;
}): Promise<SortChallenge | null> {
  const supabase = createClient();
  /*
   * artist_id·artist_image 는 나중에 더해진 칸이다(20260922000000).
   * 아직 적용되지 않은 DB 에서는 그 칸을 넣으면 insert 가 통째로 실패한다 —
   * 그때는 칸 없이 한 번 더 시도해 방 만들기 자체는 되게 한다.
   */
  let withArtistColumns = true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const row: Record<string, unknown> = {
      code,
      creator_id: input.creatorId,
      creator_nickname: input.creatorNickname,
      artist_name: input.artistName,
      title: input.title,
      tracks: input.tracks,
      source_result_id: input.sourceResultId,
    };
    if (withArtistColumns) {
      row.artist_id = input.artistId ?? null;
      row.artist_image = input.artistImage ?? null;
    }
    const { data, error } = await supabase.from("sort_challenges").insert(row).select("*").single();
    if (!error) {
      const made = data as SortChallenge;
      rememberMine(made.code);
      return made;
    }
    /*
     * 그런 칸이 없다 = 마이그레이션 전이라는 뜻. 칸 없이 다시 시도한다.
     * PostgREST 는 스키마 캐시에 없는 칸을 PGRST204 로 돌려주고(메시지에 칸 이름이 있다),
     * 데이터베이스까지 간 경우에는 42703 이다. 둘 다 본다.
     */
    const noColumn =
      error.code === "PGRST204" ||
      error.code === "42703" ||
      /artist_id|artist_image/.test(error.message ?? "");
    if (noColumn && withArtistColumns) {
      withArtistColumns = false;
      continue;
    }
    // 23505 = unique 위반(코드 중복). 그 밖의 오류는 바로 알린다.
    if (error.code !== "23505") {
      console.error("[together] 챌린지를 만들지 못했어요:", error.message);
      return null;
    }
  }
  return null;
}

/*
 * 참여자 닉네임.
 *
 * 로그인하지 않아도 참여할 수 있어서, 이름을 안 받으면 일치율 화면에 전부
 * "익명 리스너"로 나온다 — 여러 명이 모여 하면 누가 누군지 알 수 없다.
 * 소트를 시작하기 전에 받아서 기기에 기억해 둔다(다음 방에서도 채워 준다).
 */
const NICK_KEY = "together_nickname";

export function rememberedNickname(): string {
  try {
    return safeLocalStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberNickname(name: string): void {
  try {
    safeLocalStorage.setItem(NICK_KEY, name.trim());
  } catch {
    /* 저장 못 해도 이번 참여에는 쓴다 */
  }
}

/**
 * 참여 기록을 남긴다. 같은 사람이 다시 하면 덮어쓴다.
 *
 * 표에 직접 쓰지 않고 `save_sort_challenge_entry` 함수를 지난다. 그 함수가
 *  - 고칠 자격을 확인하고(증명 · 계정 소유권 · 옛 기록)
 *  - 로그인 상태면 `user_id` 를 **auth.uid() 에서** 채우고
 *  - 이미 내 계정 기록이 있는 방이면 한 트랜잭션으로 하나로 합친다.
 *
 * 참여 키는 인자로 받지 않는다 — 이 기기의 키 하나뿐이고, 로그인해도 바뀌지 않는다.
 */
export async function saveEntry(input: {
  challengeId: string;
  nickname: string | null;
  ranking: string[];
  skippedCount: number;
  /** 이전 취향표를 불러온 것이면 true. 직접 소트한 저장은 반드시 false 로 덮어야 한다. */
  imported?: boolean;
}): Promise<string | null> {
  const { data, error } = await createClient().rpc("save_sort_challenge_entry", {
    p_challenge_id: input.challengeId,
    p_participant_key: deviceParticipantKey(),
    p_claim_token: deviceClaimSecret(),
    p_nickname: input.nickname,
    p_ranking: input.ranking,
    p_skipped_count: input.skippedCount,
    p_imported: input.imported ?? false,
  });
  if (error) {
    console.error("[together] 참여 기록을 저장하지 못했어요:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * 익명으로 남긴 기록에 계정 소유권을 붙인다. 붙은 기록의 id 를 돌려준다.
 *
 * 증명이 맞을 때만 붙는다. 증명이 없는 옛 기록은 조용히 null 이다 — 근거 없이
 * 붙이지 않는다. 그 기록은 화면에서 기기 신원으로 계속 "내 결과" 로 보인다.
 */
export async function claimEntry(challengeId: string): Promise<string | null> {
  const { data, error } = await createClient().rpc("claim_sort_challenge_entry", {
    p_challenge_id: challengeId,
    p_participant_key: deviceParticipantKey(),
    p_claim_token: deviceClaimSecret(),
  });
  if (error) {
    console.error("[together] 소유권을 붙이지 못했어요:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** 이 방에서 **내 계정이 가진** 기록의 id. 목록 조회에서 user_id 를 빼는 대신 이걸 쓴다. */
export async function fetchOwnedEntryId(challengeId: string): Promise<string | null> {
  const { data, error } = await createClient().rpc("my_sort_challenge_entry", {
    p_challenge_id: challengeId,
  });
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * 불러온 취향표를 **원래 언제 소트했는지**. "6월 3일" 처럼 쓸 문자열로 돌려준다.
 * 그 취향표를 지웠으면 null — 그때는 날짜 없이 "이전에 했던" 이라고만 말한다.
 */
export async function fetchResultDate(resultId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("tournament_results")
    .select("created_at")
    .eq("id", resultId)
    .maybeSingle();
  const at = (data as { created_at?: string } | null)?.created_at;
  if (!at) return null;
  return new Date(at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 내 취향 스페이스에 보여 줄 한 줄. 방 하나와 내가 그 방에서 한 소트. */
export interface MyChallenge {
  code: string;
  title: string;
  artistName: string | null;
  artistImage: string | null;
  trackCount: number;
  /** 지금까지 이 방에서 소트를 끝낸 사람 수 */
  people: number;
  /** 내가 이 방에서 소트한 시각 */
  sortedAt: string;
  iCreated: boolean;
}

/**
 * 내가 참여한 방 목록.
 *
 * 두 갈래로 찾아 합친다.
 *   1) **계정이 가진 기록**(`user_id`) — 다른 기기에서 로그인해도 찾힌다
 *   2) **이 기기의 참여 키** — 로그인하지 않은 사람, 그리고 증명이 없어 계정에 붙이지
 *      못한 옛 익명 기록이 이쪽으로 걸린다
 *
 * 옛 로그인 기록은 참여 키가 계정 uuid 그 자체였다. 그건 마이그레이션에서
 * `user_id` 로 옮겨 두었으므로 1번에 걸린다.
 *
 * 같은 방이 두 갈래에 다 있으면 한 번만 보여 준다.
 */
export async function fetchMyChallenges(userId?: string | null): Promise<MyChallenge[]> {
  const supabase = createClient();
  const device = deviceParticipantKey();

  const [byDevice, byAccount] = await Promise.all([
    supabase
      .from("sort_challenge_entries")
      .select("challenge_id, created_at")
      .eq("participant_key", device)
      .order("created_at", { ascending: false })
      .limit(50),
    /*
     * 계정이 가진 기록은 **RPC 에 묻는다.** 전에는 `user_id` 로 걸러 찾았는데, 그러려면
     * 그 컬럼을 누구나 읽을 수 있어야 했다. `user_id` 는 방을 건너 같은 계정을 잇는
     * 열쇠라서 공개할 것이 아니다. 소유는 밖에서 적어 보내는 것이 아니라 `auth.uid()`
     * 가 아는 것이므로, 묻는 자리를 서버로 옮겼다(20260925100000).
     */
    userId
      ? supabase.rpc("my_sort_challenge_rooms")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (byDevice.error) console.error("[together] 참여한 방을 불러오지 못했어요:", byDevice.error.message);
  if (byAccount.error) console.error("[together] 계정의 방을 불러오지 못했어요:", byAccount.error.message);

  type Row = { challenge_id: string; created_at: string };
  // 계정 기록을 앞에 둔다 — 같은 방이 둘 다 있으면 계정 쪽 시각을 쓴다.
  const merged = [...((byAccount.data ?? []) as Row[]), ...((byDevice.data ?? []) as Row[])];
  const seen = new Set<string>();
  const rows = merged
    .filter((r) => (seen.has(r.challenge_id) ? false : seen.add(r.challenge_id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.challenge_id))];
  const { data: rooms } = await supabase
    .from("sort_challenges")
    .select("id, code, title, artist_name, artist_image, tracks, creator_id")
    .in("id", ids);
  // 방마다 몇 명이 끝냈는지. 한 번에 읽어 방 수만큼 조회하지 않는다.
  const { data: all } = await supabase
    .from("sort_challenge_entries")
    .select("challenge_id")
    .in("challenge_id", ids);
  const people = new Map<string, number>();
  for (const r of (all ?? []) as { challenge_id: string }[]) {
    people.set(r.challenge_id, (people.get(r.challenge_id) ?? 0) + 1);
  }

  type Room = { id: string; code: string; title: string; artist_name: string | null;
                artist_image: string | null; tracks: unknown[] | null; creator_id: string | null };
  const roomOf = new Map(((rooms ?? []) as Room[]).map((r) => [r.id, r]));
  return rows
    .map((r) => {
      const room = roomOf.get(r.challenge_id);
      if (!room) return null;                       // 방이 지워졌으면 목록에서 뺀다
      return {
        code: room.code,
        title: room.title,
        artistName: room.artist_name,
        artistImage: room.artist_image,
        trackCount: (room.tracks ?? []).length,
        people: people.get(r.challenge_id) ?? 1,
        sortedAt: r.created_at,
        iCreated: !!room.creator_id && !!userId && room.creator_id === userId,
      } satisfies MyChallenge;
    })
    .filter((x): x is MyChallenge => x !== null);
}
