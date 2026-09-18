"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { safeSessionStorage } from "@/utils/storage";
import * as platform from "@/utils/platform";
import { averageRate, matchRate } from "@/utils/togetherMatch";
import { fetchChallenge, fetchEntries, participantKey, saveEntry, type ChallengeEntry, type SortChallenge } from "@/utils/togetherDb";
import { Cover, RankList, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";

interface StoredTrack {
  id?: string;
  i?: string;
}

/** 방금 끝낸 소트의 순위(곡 id 배열). 없으면 null. */
function rankingFromSession(): { ids: string[]; skipped: number } | null {
  try {
    const raw = safeSessionStorage.getItem("worldcup_ranking");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTrack[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const ids = parsed.map((t) => t.id || t.i || "").filter(Boolean);
    const skipped = Number(safeSessionStorage.getItem("worldcup_skipped_count")) || 0;
    return { ids, skipped };
  } catch {
    return null;
  }
}

/**
 * 같이 소트하기 — 결과·일치율(실험). 문서: docs/together-sort.md
 *
 * 소트를 막 끝내고 오면 그 순위를 저장하고, 같은 링크로 줄 세운 사람들과의 일치율을 보여준다.
 */
export default function TogetherResultPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { toast, showToast } = useToast();
  const code = params.code as string;

  const [challenge, setChallenge] = useState<SortChallenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);

  useEffect(() => {
    if (!code || isLoading) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const found = await fetchChallenge(code);
      if (!alive || !found) {
        if (alive) {
          setChallenge(null);
          setEntries([]);
        }
        return;
      }

      // 방금 끝낸 순위가 있으면 내 기록으로 저장한다(다시 했으면 덮어쓴다).
      const fresh = rankingFromSession();
      const key = participantKey(user?.id);
      if (fresh && fresh.ids.length > 1) {
        const trackIds = new Set(found.tracks.map((t) => t.id));
        const ids = fresh.ids.filter((id) => trackIds.has(id));
        // 이 챌린지의 곡으로 한 소트일 때만 저장한다(다른 월드컵 기록이 남아 있을 수 있다).
        if (ids.length > 1) {
          await saveEntry({
            challengeId: found.id,
            participantKey: key,
            nickname: user?.user_metadata?.nickname ?? null,
            ranking: ids,
            skippedCount: fresh.skipped,
          });
          safeSessionStorage.removeItem("together_code");
        }
      }

      const list = await fetchEntries(found.id);
      if (!alive) return;
      setChallenge(found);
      setEntries(list);

      // 같이 하는 사람이 끝나는 대로 일치율이 채워지도록 몇 초마다 다시 읽는다.
      timer = setInterval(async () => {
        const next = await fetchEntries(found.id);
        if (alive) setEntries(next);
      }, 8000);
    })();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [code, isLoading, user]);

  const key = participantKey(user?.id);
  const mine = entries?.find((e) => e.participant_key === key) ?? null;

  const others = useMemo(() => {
    if (!entries || !mine) return [];
    return entries
      .filter((e) => e.participant_key !== key)
      .map((e) => ({ entry: e, match: matchRate(mine.ranking, e.ranking) }))
      .sort((a, b) => b.match.rate - a.match.rate);
  }, [entries, mine, key]);

  const average = averageRate(others.map((o) => o.match.rate));

  if (entries === null) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <p className="type-sub text-navy/70">일치율을 계산하고 있어요</p>
      </main>
    );
  }

  if (!challenge) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="type-title-2 text-navy">링크를 열 수 없어요</p>
        <p className="type-sub text-navy/70">지워졌거나 잘못된 링크예요.</p>
        <button onClick={() => router.push("/")} className={`${primaryButton} mt-6`}>
          홈으로 가기
        </button>
      </main>
    );
  }

  if (!mine) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="type-title-2 text-navy">아직 줄 세우지 않았어요</p>
        <p className="type-sub text-navy/70">같은 곡으로 줄 세우면 다른 사람과의 일치율이 보여요.</p>
        <button onClick={() => router.push(`/together/${code}`)} className={`${primaryButton} mt-6`}>
          곡 보러 가기
        </button>
      </main>
    );
  }

  const byId = new Map(challenge.tracks.map((t) => [t.id, t]));
  const myTracks = mine.ranking.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/together/${challenge.code}`;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-32">
      <p className="type-caption text-navy/70">같이 소트하기 · {challenge.title}</p>
      <h1 className="type-title-1 text-navy mt-1">
        {others.length === 0 ? "아직 나 혼자예요" : average !== null ? `평균 일치율 ${average}%` : ""}
      </h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        {others.length === 0
          ? `코드 ${challenge.code} 를 알려 주세요. 옆 사람이 끝나면 여기에 바로 뜹니다.`
          : `${others.length}명과 비교했어요 · 몇 초마다 새로 확인해요.`}
      </p>

      {/* 내 1위 */}
      {myTracks[0] && (
        <div className="flex items-center gap-3 mt-6">
          <Cover src={myTracks[0].albumImage} alt={myTracks[0].title} size={56} />
          <div className="min-w-0">
            <p className="type-caption font-semibold text-point-ink">내 1위</p>
            <p className="type-body-strong text-navy truncate">{myTracks[0].title}</p>
            <p className="type-caption text-navy/70 truncate">{myTracks[0].artistName}</p>
          </div>
        </div>
      )}

      {/* 사람별 일치율 */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="type-title-2 text-navy">사람별 일치율</h2>
          <ul className="mt-2 flex flex-col divide-y divide-navy/10">
            {others.map(({ entry, match }) => {
              const gapTrack = match.biggestGap ? byId.get(match.biggestGap.id) : null;
              return (
                <li key={entry.id} className="py-3 flex items-start gap-3">
                  <span className="type-title-2 font-num tabular-nums text-point-ink w-14 shrink-0">{match.rate}%</span>
                  <div className="min-w-0">
                    <p className="type-body-strong text-navy truncate">
                      {entry.nickname || "익명 리스너"}
                      {entry.participant_key === challenge.creator_id ? " · 만든 사람" : ""}
                    </p>
                    <p className="type-caption text-navy/70 break-keep">
                      {match.common}곡 비교 · 1위 {match.sameTop ? "같음" : "다름"} · TOP 5 중 {match.topFiveOverlap}곡 겹침
                    </p>
                    {gapTrack && (
                      <p className="type-caption text-navy/70 break-keep">
                        가장 갈린 곡 · {gapTrack.title} (내 {match.biggestGap!.mine}위 / 상대 {match.biggestGap!.theirs}위)
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 내 순위 */}
      <section className="mt-8">
        <h2 className="type-title-2 text-navy">
          내 순위 <span className="text-navy/70 font-semibold">{myTracks.length}곡</span>
        </h2>
        <div className="mt-2">
          <RankList tracks={myTracks} />
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
        <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
          <button
            onClick={async () => {
              const how = await platform.copyText(link);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
            className={`${primaryButton} w-full`}
          >
            링크 복사해서 더 불러오기
          </button>
          <button onClick={() => router.push(`/together/${challenge.code}`)} className={`${secondaryButton} w-full`}>
            곡 목록 보기
          </button>
        </div>
      </div>
      <Toast toast={toast} />
    </main>
  );
}
