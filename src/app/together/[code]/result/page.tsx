"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { safeSessionStorage } from "@/utils/storage";
import * as platform from "@/utils/platform";
import { saveCompletedResult } from "@/utils/worldcupDb";
import { buildPairwiseMatches, groupMatchRate, matchRate, otherKey, partnersOf, pickHighlightEdges } from "@/utils/togetherMatch";
import TasteRelationGraph from "@/components/together/TasteRelationGraph";
import ParticipantSheet from "@/components/together/ParticipantSheet";
import {
  rememberedNickname, fetchChallenge, fetchEntries, participantKey, saveEntry, type ChallengeEntry, type SortChallenge } from "@/utils/togetherDb";
import { RankList, Sheet, Toast, primaryButton, secondaryButton, textLink, useToast } from "@/components/space/SpaceUI";
import TogetherPairDetail from "@/components/together/TogetherPairDetail";
import TogetherResultShareCard from "@/components/together/TogetherResultShareCard";
import { useInlinedCovers } from "@/utils/useInlinedCovers";

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
 * 소트를 막 끝내고 오면 그 순위를 저장하고, 같은 링크로 소트한 사람들과의 일치율을 보여준다.
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
            // 소트 시작 전에 받아 둔 이름. 로그인하지 않은 사람도 이름이 남는다
            // (예전에는 프로필 닉네임만 봐서 전부 "익명 리스너"로 나왔다).
            nickname: user?.user_metadata?.nickname ?? rememberedNickname() ?? null,
            ranking: ids,
            skippedCount: fresh.skipped,
          });
          safeSessionStorage.removeItem("together_code");

          /*
           * 같이 소트한 것도 **내 취향표로 남긴다.** 참여한 사람마다 각자의 취향표가 생긴다.
           *
           * 예전에는 남기지 않았다(월드컵이 `?challenge=1` 이면 저장을 건너뛴다). 그래서
           * 같이 소트하기로 한 소트는 아무리 해도 내 취향 스페이스에 안 쌓였다.
           *
           * 기준은 혼자 할 때와 같은 16곡이다 — 방은 4곡부터 만들 수 있어서, 조건 없이
           * 남기면 4곡짜리 취향표가 계속 쌓인다. "모르는 곡"으로 뺀 곡도 더해서 센다.
           *
           * 제목에 시각까지 적는다. 같은 방을 하루에 두 번 하면 날짜만으로는 구분이 안 되고,
           * 가져온 원본 취향표와도 같은 이름이 된다. 덮어쓰지 않고 **늘 새로 남긴다** —
           * 다시 소트한 결과는 이전 것과 별개다.
           */
          const byTrackId = new Map(found.tracks.map((t) => [t.id, t]));
          const ranked = ids.map((id) => byTrackId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
          if (user && ranked.length + fresh.skipped >= 16) {
            const d = new Date();
            const p = (n: number) => String(n).padStart(2, "0");
            const stamp = `${String(d.getFullYear()).slice(-2)}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
            const artist = found.artist_name || ranked[0]?.artistName || found.title;
            await saveCompletedResult(ranked, ranked.slice(1), `${artist} sort_${stamp}`, {
              isSingleArtist: true,
              artistId: found.artist_id ?? null,
              artistName: found.artist_name ?? null,
            });
          }
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

  /* ── 그룹 계산. 화면은 여기서 나온 값만 쓴다(utils/togetherMatch.ts) ── */

  const participants = useMemo(
    () => (entries ?? []).map((e) => ({ key: e.participant_key, nickname: e.nickname })),
    [entries]
  );
  const pairs = useMemo(
    () => buildPairwiseMatches((entries ?? []).map((e) => ({ key: e.participant_key, nickname: e.nickname, ranking: e.ranking }))),
    [entries]
  );
  const groupRate = useMemo(() => groupMatchRate(pairs), [pairs]);
  const myPartners = useMemo(() => partnersOf(pairs, key), [pairs, key]);

  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showAllMine, setShowAllMine] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 공유 카드 안의 아티스트 사진. 저장 시점에 다시 내려받으면 빈 칸으로 찍힐 수 있다. */
  const heroForCard = challenge?.artist_image || null;
  const inlined = useInlinedCovers(heroForCard ? [heroForCard] : []);

  /*
   * 고른 사람은 기억하되 **자리를 계산으로 정한다**(상태를 고쳐 맞추지 않는다).
   * 그러면 두 가지가 저절로 해결된다 — 들어오자마자 아무도 안 골라진 상태가 없고,
   * 고른 사람이 자료에서 사라져도(드문 예외) 다음 사람으로 조용히 넘어간다.
   */
  const selectedKey = useMemo(() => {
    if (myPartners.length === 0) return null;
    if (picked && myPartners.some((p) => otherKey(p, key) === picked)) return picked;
    return otherKey(myPartners[0], key);
  }, [myPartners, picked, key]);

  /** 고른 사람의 쌍과 기록. 상세 비교는 이 둘만 있으면 된다. */
  const selectedPair = useMemo(
    () => (selectedKey ? myPartners.find((p) => otherKey(p, key) === selectedKey) ?? null : null),
    [myPartners, selectedKey, key]
  );
  const selectedEntry = useMemo(
    () => (selectedKey ? entries?.find((e) => e.participant_key === selectedKey) ?? null : null),
    [entries, selectedKey]
  );

  /* 옆 사람이 끝나면 화면이 저절로 바뀐다. 무엇이 바뀌었는지 한 줄로 알려 준다. */
  const seenCount = useRef<number | null>(null);
  useEffect(() => {
    if (!entries) return;
    const before = seenCount.current;
    seenCount.current = entries.length;
    if (before !== null && entries.length > before) {
      showToast(`새 결과가 반영됐어요 · ${entries.length}명이 함께했어요`);
    }
  }, [entries, showToast]);

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
        <p className="type-title-2 text-navy">아직 소트하지 않았어요</p>
        <p className="type-sub text-navy/70">같은 곡으로 소트하면 다른 사람과의 일치율이 보여요.</p>
        <button onClick={() => router.push(`/together/${code}`)} className={`${primaryButton} mt-6`}>
          곡 보러 가기
        </button>
      </main>
    );
  }

  const byId = new Map(challenge.tracks.map((t) => [t.id, t]));
  const myTracks = mine.ranking.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/together/${challenge.code}`;

  /* 아티스트 사진이 없는 방(마이그레이션 전)에서는 그 아티스트의 앨범 재킷을 쓴다.
     둘 다 없으면 사진 없이 간다 — 상관없는 사진을 채우지 않는다. */
  const heroImage = challenge.artist_image || myTracks[0]?.albumImage || null;
  const artistLabel = challenge.artist_name || challenge.title;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col pb-32">
      {/* ── Hero ── */}
      <header className="relative">
        {/* 사진이 없으면 사진 자리를 비워 두지 않는다 — 빈 280px 은 고장으로 읽힌다. */}
        {heroImage && (
          /* 바깥 감싸개(LayoutWrapper px-6)의 24px 밖으로 빼낸다 — 사진은 화면 끝까지 닿아야 한다. */
          <div className="relative h-[280px] overflow-hidden -mx-6 w-[calc(100%+3rem)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
            {/* 아래로 갈수록 바탕색에 잠기게 — 사진과 글이 같은 면 위에 있어 보여야 한다. */}
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--app-bg)]/30 via-[var(--app-bg)]/80 to-[var(--app-bg)]" />
          </div>
        )}

        <div className={`relative ${heroImage ? "-mt-24" : "pt-10"}`}>
          <p className="type-caption text-navy/70">
            {artistLabel} · {challenge.tracks.length}곡
          </p>
          <p className="type-body text-navy/70 mt-0.5">같이 소트한 결과</p>
          {groupRate !== null ? (
            <>
              <p className="type-display font-num tabular-nums text-navy mt-2 leading-none">{groupRate}%</p>
              <p className="type-body-strong text-navy mt-1">종합 일치율</p>
            </>
          ) : (
            <p className="type-title-1 text-navy mt-2 break-keep">
              {others.length === 0 ? "아직 나 혼자예요" : "아직 비교할 곡이 모자라요"}
            </p>
          )}
          <p className="type-body text-navy/70 mt-2">
            {entries.length}명이 함께했어요
          </p>
        </div>
      </header>

      <div>

      {/* ── 관계도 ── */}
      {others.length === 0 ? (
        /* 나만 끝낸 상태. 실패 화면처럼 보이지 않게, 다음에 할 일을 준다. */
        <section className="mt-8 rounded-2xl border border-dashed border-navy/20 px-5 py-8 text-center">
          <p className="type-body-strong text-navy break-keep">같이 소트할 사람을 불러 보세요</p>
          <p className="type-caption text-navy/70 mt-1 break-keep">
            한 명만 더 끝내도 취향이 얼마나 닮았는지 바로 보여요.
          </p>
          <button
            onClick={async () => {
              const how = await platform.copyText(link);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
            className={`${primaryButton} mt-5`}
          >
            링크 복사하기
          </button>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="type-title-2 text-navy">우리의 취향 관계도</h2>
          <p className="type-caption text-navy/70 mt-0.5 break-keep">
            이름을 누르면 나와 무엇이 같고 달랐는지 볼 수 있어요.
          </p>
          <TasteRelationGraph
            participants={participants}
            pairs={pairs}
            myKey={key}
            selectedKey={selectedKey}
            onSelect={setPicked}
            onOpenMore={() => setSheetOpen(true)}
            trackCount={challenge.tracks.length}
          />
          {/* 그림으로만 끝내지 않는다. 선이 무엇을 뜻하는지 글로도 적는다. */}
          <GraphLegend pairs={pairs} participants={participants} trackCount={challenge.tracks.length} />
        </section>
      )}

      {/* 고른 사람과 나 */}
      {selectedPair && selectedEntry && (
        <TogetherPairDetail
          pair={selectedPair}
          myKey={key}
          myRanking={mine.ranking}
          theirRanking={selectedEntry.ranking}
          theirName={selectedEntry.nickname?.trim() || "익명 리스너"}
          byId={byId}
        />
      )}

      {/* 내 소트 결과 — 처음에는 TOP 5 만. 이미 아는 내 순위보다 위쪽이 새로운 정보다. */}
      <section className="mt-10">
        <h2 className="type-title-2 text-navy">
          내 소트 결과 <span className="text-navy/70 font-semibold">{myTracks.length}곡</span>
        </h2>
        <div className="mt-2">
          <RankList tracks={showAllMine ? myTracks : myTracks.slice(0, 5)} />
        </div>
        {myTracks.length > 5 && (
          <button type="button" onClick={() => setShowAllMine((v) => !v)} className={`${textLink} mt-3`}>
            {showAllMine ? "접기" : `전체 ${myTracks.length}곡 보기`}
          </button>
        )}
      </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
        <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
          <button onClick={() => setShareOpen(true)} className={`${primaryButton} w-full`}>
            결과 공유하기
          </button>
          <button onClick={() => setInviteOpen(true)} className={`${secondaryButton} w-full`}>
            친구 더 초대하기
          </button>
        </div>
      </div>

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        closeLabel="닫기"
        header={
          <>
            <h2 className="type-title-2 text-navy">결과 공유하기</h2>
            <p className="type-caption text-navy/70 mt-0.5">이 링크를 열면 우리 결과를 같이 볼 수 있어요.</p>
          </>
        }
      >
        <ul className="flex flex-col divide-y divide-navy/10">
          {/*
            `share()` 는 못 열면 false 를 준다(지원하지 않는 브라우저·토스 버전).
            그때는 조용히 복사로 넘어간다 — 눌렀는데 아무 일도 안 일어나는 것이 제일 나쁘다.
            어느 쪽을 했는지는 토스트가 말해 준다.
          */}
          <SheetAction
            label="친구에게 보내기"
            onClick={async () => {
              const sent = await platform.share({
                title: "같이 소트하기",
                text: `${artistLabel} ${challenge.tracks.length}곡, 우리 취향이 얼마나 닮았는지 보세요`,
                url: link,
              });
              setShareOpen(false);
              if (!sent) {
                const how = await platform.copyText(link);
                showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
              }
            }}
          />
          <SheetAction
            label={saving ? "이미지를 만들고 있어요" : "결과 이미지 저장"}
            onClick={async () => {
              if (saving) return;
              const el = document.getElementById(SHARE_CARD_ID);
              if (!el) return;
              setSaving(true);
              try {
                await platform.saveImage(el, `${artistLabel}_Sortify_together.png`);
                setShareOpen(false);
                showToast("이미지를 저장했어요");
              } catch (e) {
                // 토스 구버전은 저장 자체를 지원하지 않는다(PlatformError 로 이유가 온다).
                showToast(e instanceof Error ? e.message : "이미지를 저장하지 못했어요", "error");
              } finally {
                setSaving(false);
              }
            }}
          />
          <SheetAction
            label="링크 복사하기"
            onClick={async () => {
              const how = await platform.copyText(link);
              setShareOpen(false);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
          />
        </ul>
      </Sheet>

      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        closeLabel="닫기"
        header={
          <>
            <h2 className="type-title-2 text-navy">친구 더 초대하기</h2>
            <p className="type-caption text-navy/70 mt-0.5 break-keep">
              같은 곡으로 소트하면 관계도에 바로 들어와요.
            </p>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <p className="type-caption text-navy/70">코드</p>
          <p className="type-title-1 font-num tracking-wider text-navy">{challenge.code}</p>
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-navy/10 border-t border-navy/10">
          <SheetAction
            label="링크 복사하기"
            onClick={async () => {
              const how = await platform.copyText(link);
              setInviteOpen(false);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
          />
          <SheetAction
            label="곡 목록 보기"
            onClick={() => router.push(`/together/${challenge.code}`)}
          />
        </ul>
      </Sheet>

      <ParticipantSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        participants={participants}
        pairs={pairs}
        myKey={key}
        selectedKey={selectedKey}
        onPick={(k) => {
          setPicked(k);
          setSheetOpen(false);
        }}
      />
      {/*
        공유 이미지용 카드. 화면 밖에 두되 마운트는 해 둔다 — display:none 이면 크기가 0 이라
        캡처가 빈 이미지가 된다(취향표 내보내기가 쓰는 방식 그대로).
      */}
      <div className="absolute top-[-9999px] left-[-9999px] pointer-events-none select-none" aria-hidden>
        <TogetherResultShareCard
          id={SHARE_CARD_ID}
          artistLabel={artistLabel}
          trackCount={challenge.tracks.length}
          participantCount={entries.length}
          groupRate={groupRate}
          participants={participants}
          pairs={pairs}
          myKey={key}
          artistImage={heroForCard ? inlined[heroForCard] ?? heroForCard : null}
          /* 방 이름을 따로 적은 경우에만. 기본값은 아티스트명이라 두 번 적게 된다. */
          roomName={challenge.title && challenge.title !== challenge.artist_name ? challenge.title : null}
        />
      </div>

      <Toast toast={toast} />
    </main>
  );
}

/** 공유 카드를 캡처할 때 찾는 이름. */
const SHARE_CARD_ID = "together-share-card";

/** 공유·초대 시트의 한 줄. 손가락에 맞는 높이와 포커스 표시를 한곳에서 지킨다. */
function SheetAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full min-h-[52px] -mx-6 px-6 flex items-center type-body-strong text-navy text-left cursor-pointer hover:bg-navy/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--t-point-ink)]"
      >
        {label}
      </button>
    </li>
  );
}

/**
 * 관계도에 그린 선을 글로도 적는다.
 *
 * 선 모양과 색으로만 말하면 색을 구분하기 어려운 사람에게는 아무것도 전해지지 않는다.
 * 어차피 "누가 누구와 닮았나"는 이 화면에서 가장 궁금한 것이라 글로도 적을 값어치가 있다.
 */
function GraphLegend({
  pairs,
  participants,
  trackCount,
}: {
  pairs: ReturnType<typeof buildPairwiseMatches>;
  participants: { key: string; nickname: string | null }[];
  trackCount: number;
}) {
  const { highest, lowest } = useMemo(
    () => pickHighlightEdges(pairs, trackCount),
    [pairs, trackCount]
  );
  const name = (k: string) => participants.find((p) => p.key === k)?.nickname?.trim() || "익명 리스너";
  const single = pairs.filter((p) => p.comparable).length === 1;
  if (highest.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-col">
      {single ? (
        <LegendRow label="두 사람" pair={highest[0]} name={name} />
      ) : (
        <>
          {highest.map((p) => (
            <LegendRow key={`${p.aKey}-${p.bKey}`} label="가장 닮은 조합" pair={p} name={name} />
          ))}
          {lowest && <LegendRow label="가장 다른 조합" pair={lowest} name={name} dashed />}
        </>
      )}
    </ul>
  );
}

function LegendRow({
  label,
  pair,
  name,
  dashed,
}: {
  label: string;
  pair: ReturnType<typeof buildPairwiseMatches>[number];
  name: (k: string) => string;
  dashed?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 py-1">
      {/* 관계도에 그린 선과 같은 모양. 색만으로 가르지 않으니 여기서도 실선·파선을 그대로 쓴다. */}
      <span
        aria-hidden
        className="w-6 h-0 shrink-0"
        style={{
          borderTopWidth: dashed ? 1.5 : 2,
          borderTopStyle: dashed ? "dashed" : "solid",
          borderTopColor: dashed ? "rgb(var(--t-ink-rgb) / 0.5)" : "var(--t-point-ink)",
        }}
      />
      <span className="type-caption text-navy/70 shrink-0">{label}</span>
      <span className="type-caption text-navy truncate">
        {name(pair.aKey)} · {name(pair.bKey)}
      </span>
      <span className="type-caption font-num tabular-nums text-navy/70 ml-auto shrink-0">{pair.rate}%</span>
    </li>
  );
}
