"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import { fetchChallenge, fetchEntries, participantKey, type ChallengeEntry, type SortChallenge } from "@/utils/togetherDb";
import { Cover, primaryButton, secondaryButton } from "@/components/space/SpaceUI";

/**
 * 같이 소트하기 — 초대 화면(실험). 문서: docs/together-sort.md
 *
 * 링크를 받은 사람이 곡 세트를 보고 같은 곡으로 소트를 시작한다.
 * 월드컵 화면을 그대로 쓰되 `?challenge=1` 로 열어, 진행 중인 이어하기를 건드리지 않는다.
 */
export default function TogetherInvitePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const code = params.code as string;

  const [challenge, setChallenge] = useState<SortChallenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    (async () => {
      const found = await fetchChallenge(code);
      if (!alive) return;
      setChallenge(found);
      setEntries(found ? await fetchEntries(found.id) : []);
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  const mine = entries?.find((e) => e.participant_key === participantKey(user?.id));

  const start = () => {
    if (!challenge) return;
    const tracks = JSON.stringify(challenge.tracks);
    // 월드컵 화면이 읽는 자리에 이 챌린지의 곡 세트를 심는다. 진행 중이던 기록은 비운다.
    safeSessionStorage.setItem("worldcup_tracks", tracks);
    safeLocalStorage.setItem("worldcup_tracks", tracks);
    safeSessionStorage.removeItem("worldcup_progress");
    safeLocalStorage.removeItem("worldcup_progress");
    safeSessionStorage.setItem("together_code", challenge.code);
    router.push("/worldcup?mode=single&challenge=1");
  };

  if (entries === null) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <p className="type-sub text-navy/70">불러오고 있어요</p>
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

  const creator = challenge.creator_nickname || "리스너";

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-32">
      <p className="type-caption text-navy/70">같이 소트하기</p>
      <h1 className="type-title-1 text-navy mt-1 break-keep">{challenge.title}</h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        {creator}님이 고른 {challenge.tracks.length}곡이에요.{"\n"}같은 곡으로 줄 세우면 서로 얼마나 비슷한지 볼 수 있어요.
      </p>

      <p className="type-caption text-navy/70 mt-6">
        지금까지 {entries.length}명이 줄 세웠어요
      </p>

      <ul className="mt-4 flex flex-col divide-y divide-navy/10">
        {challenge.tracks.map((track) => (
          <li key={track.id} className="flex items-center gap-3 py-2.5">
            <Cover src={track.albumImage} alt={track.title} size={40} />
            <span className="flex-1 min-w-0">
              <span className="block type-body-strong text-navy truncate">{track.title}</span>
              <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
        <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
          <button onClick={start} className={`${primaryButton} w-full`}>
            {mine ? "다시 줄 세우기" : "같은 곡으로 줄 세우기"}
          </button>
          {mine && (
            <button onClick={() => router.push(`/together/${challenge.code}/result`)} className={`${secondaryButton} w-full`}>
              일치율 보기
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
