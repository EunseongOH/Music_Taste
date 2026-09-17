"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { createChallenge } from "@/utils/togetherDb";
import * as platform from "@/utils/platform";
import { Cover, EmptyState, SectionTitle, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";

/** tournament_results 에서 필요한 열만. 클라이언트에는 DB 타입이 없어 여기서 좁힌다. */
interface SavedRow {
  id: string;
  title: string;
  artist_name: string | null;
  is_single_artist: boolean;
  created_at: string;
  ranking: unknown;
}

interface MyCard {
  id: string;
  title: string;
  artist_name: string | null;
  is_single_artist: boolean;
  created_at: string;
  tracks: RankedTrack[];
}

/**
 * 같이 소트하기 — 만들기(실험). 문서: docs/together-sort.md
 *
 * 이미 끝낸 내 취향표에서 곡 세트를 가져오고, 뺄 곡을 끄고 링크를 만든다.
 * Spotify 를 부르지 않는다(저장된 취향표의 곡 정보만 쓴다).
 */
export default function TogetherNewPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { toast, showToast } = useToast();

  // 로그인 사용자의 취향표. null = 아직 안 불러옴(로딩 상태를 따로 두지 않는다).
  const [cards, setCards] = useState<MyCard[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [madeCode, setMadeCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await createClient()
        .from("tournament_results")
        .select("id,title,artist_name,is_single_artist,created_at,ranking")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!alive) return;
      setCards(
        ((data ?? []) as SavedRow[]).map((r) => ({
          id: r.id,
          title: r.title,
          artist_name: r.artist_name,
          is_single_artist: !!r.is_single_artist,
          created_at: r.created_at,
          tracks: normalizeRanking(r.ranking),
        }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const picked = (cards ?? []).find((c) => c.id === pickedId) ?? null;
  const chosen = useMemo(() => (picked ? picked.tracks.filter((t) => !off.has(t.id)) : []), [picked, off]);

  const pick = (card: MyCard) => {
    setPickedId(card.id);
    setOff(new Set());
    setTitle(card.artist_name || card.tracks[0]?.artistName || card.title);
  };

  const make = async () => {
    if (!user || !picked || chosen.length < 4) return;
    setBusy(true);
    const made = await createChallenge({
      creatorId: user.id,
      creatorNickname: user.user_metadata?.nickname ?? null,
      artistName: picked.artist_name || picked.tracks[0]?.artistName || null,
      title: title.trim() || picked.title,
      tracks: chosen,
      sourceResultId: picked.id,
    });
    setBusy(false);
    if (!made) {
      showToast("링크를 만들지 못했어요. 다시 시도해 주세요.", "error");
      return;
    }
    setMadeCode(made.code);
  };

  const link = madeCode ? `${window.location.origin}/together/${madeCode}` : "";

  if (isLoading || (user && cards === null)) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <p className="type-sub text-navy/70">불러오고 있어요</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="type-title-2 text-navy">로그인이 필요해요</p>
        <p className="type-sub text-navy/70">내 취향표에서 곡을 가져와 링크를 만들어요.</p>
        <button onClick={() => router.push("/")} className={primaryButton}>
          홈으로 가기
        </button>
      </main>
    );
  }

  if (madeCode) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-12">
        <h1 className="type-title-1 text-navy">링크가 만들어졌어요</h1>
        <p className="type-body text-navy/70 mt-2 break-keep">
          이 링크를 받은 사람은 같은 곡으로 소트할 수 있어요.{"\n"}둘 다 끝내면 서로의 일치율이 보여요.
        </p>
        <p className="mt-6 p-4 rounded-2xl bg-navy/5 type-sub text-navy break-all">{link}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={async () => {
              const how = await platform.copyText(link);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
            className={`${primaryButton} w-full`}
          >
            링크 복사하기
          </button>
          <button onClick={() => router.push(`/together/${madeCode}`)} className={`${secondaryButton} w-full`}>
            링크 화면 열어 보기
          </button>
        </div>
        <Toast toast={toast} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-28">
      <h1 className="type-title-1 text-navy">같이 소트하기 만들기</h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        내 취향표에서 곡을 가져와요. 빼고 싶은 곡은 끄면 돼요.
      </p>

      {(cards ?? []).length === 0 ? (
        <div className="mt-10">
          <EmptyState title="저장된 취향표가 없어요" desc="월드컵을 끝내고 취향표를 저장하면 여기에서 고를 수 있어요." />
        </div>
      ) : (
        <>
          <SectionTitle title="취향표 고르기" className="mt-8 mb-2" />
          <ul className="flex flex-col divide-y divide-navy/10">
            {(cards ?? []).map((card) => (
              <li key={card.id}>
                <button onClick={() => pick(card)} className="w-full flex items-center gap-3 py-3 text-left cursor-pointer">
                  <Cover src={card.tracks[0]?.albumImage} alt={card.title} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="block type-body-strong text-navy truncate">{card.title}</span>
                    <span className="block type-caption text-navy/70">
                      {card.tracks.length}곡 · {card.is_single_artist ? "최애 곡 줄 세우기" : "믹스 매치 월드컵"}
                    </span>
                  </span>
                  <span className={`type-caption ${pickedId === card.id ? "text-point-ink font-semibold" : "text-navy/70"}`}>
                    {pickedId === card.id ? "고름" : "고르기"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {picked && (
        <>
          <SectionTitle title="곡 고르기" count={chosen.length} className="mt-8 mb-3" />
          <label className="flex flex-col gap-1 mb-4">
            <span className="type-caption text-navy/70">링크에 보일 이름</span>
            <input
              id="together-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
              className="h-11 px-3 rounded-xl bg-white border border-navy/15 type-body text-navy"
            />
          </label>

          <ul className="flex flex-col divide-y divide-navy/10">
            {picked.tracks.map((track) => {
              const isOff = off.has(track.id);
              return (
                <li key={track.id} className="flex items-center gap-3 py-2.5">
                  <Cover src={track.albumImage} alt={track.title} size={36} />
                  <span className={`flex-1 min-w-0 ${isOff ? "opacity-40" : ""}`}>
                    <span className="block type-body-strong text-navy truncate">{track.title}</span>
                    <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
                  </span>
                  <button
                    onClick={() =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (next.has(track.id)) next.delete(track.id);
                        else next.add(track.id);
                        return next;
                      })
                    }
                    className={`h-8 px-3 rounded-full type-caption cursor-pointer ${isOff ? "bg-navy/5 text-navy/70" : "bg-navy text-cream"}`}
                  >
                    {isOff ? "뺐어요" : "넣음"}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
            <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
              {chosen.length < 4 && <p className="type-caption text-point-ink text-center">최소 4곡이 필요해요</p>}
              <button onClick={make} disabled={busy || chosen.length < 4} className={`${primaryButton} w-full`}>
                {busy ? "만드는 중" : `${chosen.length}곡으로 링크 만들기`}
              </button>
            </div>
          </div>
        </>
      )}
      <Toast toast={toast} />
    </main>
  );
}
