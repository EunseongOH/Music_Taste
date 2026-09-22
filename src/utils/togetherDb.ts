"use client";

import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage } from "@/utils/storage";
import { makeCode } from "@/utils/togetherMatch";
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
  created_at: string;
}

/** 이 기기의 참여자 키. 로그인했으면 그 사용자 id 를 그대로 쓴다. */
export function participantKey(userId?: string | null): string {
  if (userId) return userId;
  const saved = safeLocalStorage.getItem("together_participant");
  if (saved) return saved;
  const made = `anon_${crypto.randomUUID()}`;
  safeLocalStorage.setItem("together_participant", made);
  return made;
}

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

export async function fetchChallenge(code: string): Promise<SortChallenge | null> {
  const { data, error } = await createClient().from("sort_challenges").select("*").eq("code", code).maybeSingle();
  if (error) {
    console.error("[together] 챌린지를 불러오지 못했어요:", error.message);
    return null;
  }
  return (data as SortChallenge) ?? null;
}

export async function fetchEntries(challengeId: string): Promise<ChallengeEntry[]> {
  const { data, error } = await createClient()
    .from("sort_challenge_entries")
    .select("*")
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

/** 같은 사람이 다시 하면 덮어쓴다. */
export async function saveEntry(input: {
  challengeId: string;
  participantKey: string;
  nickname: string | null;
  ranking: string[];
  skippedCount: number;
}): Promise<boolean> {
  const { error } = await createClient()
    .from("sort_challenge_entries")
    .upsert(
      {
        challenge_id: input.challengeId,
        participant_key: input.participantKey,
        nickname: input.nickname,
        ranking: input.ranking,
        skipped_count: input.skippedCount,
      },
      { onConflict: "challenge_id,participant_key" }
    );
  if (error) {
    console.error("[together] 참여 기록을 저장하지 못했어요:", error.message);
    return false;
  }
  return true;
}
