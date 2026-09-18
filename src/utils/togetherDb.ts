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
  title: string;
  tracks: RankedTrack[];
  sourceResultId: string | null;
}): Promise<SortChallenge | null> {
  const supabase = createClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("sort_challenges")
      .insert({
        code,
        creator_id: input.creatorId,
        creator_nickname: input.creatorNickname,
        artist_name: input.artistName,
        title: input.title,
        tracks: input.tracks,
        source_result_id: input.sourceResultId,
      })
      .select("*")
      .single();
    if (!error) return data as SortChallenge;
    // 23505 = unique 위반(코드 중복). 그 밖의 오류는 바로 알린다.
    if (error.code !== "23505") {
      console.error("[together] 챌린지를 만들지 못했어요:", error.message);
      return null;
    }
  }
  return null;
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
