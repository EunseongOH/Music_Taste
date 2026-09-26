"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { safeSessionStorage } from "@/utils/storage";
import * as platform from "@/utils/platform";
import { saveCompletedResult } from "@/utils/worldcupDb";
import { completionFor, markCompletion, type TogetherCompletion } from "@/utils/togetherCompletion";
import { buildPairwiseMatches, groupMatchRate, inferLegacySkipped, matchRate, otherKey, partnersOf, pickHighlightEdges } from "@/utils/togetherMatch";
import { personName } from "@/utils/togetherName";
import { DockSpacer, useDockClearance } from "@/components/space/BottomDock";
import { bindPendingClaim, clearPendingClaim, normalizeEntriesForViewer, rememberPendingClaim, resolveSelfIdentity } from "@/utils/togetherIdentity";
import TasteRelationGraph from "@/components/together/TasteRelationGraph";
import ParticipantSheet from "@/components/together/ParticipantSheet";
import {
  rememberedNickname, fetchChallenge, fetchEntries, saveEntry, claimEntry, fetchOwnedEntryId,
  linkTasteResult, type ChallengeEntry, type SortChallenge } from "@/utils/togetherDb";
import { RankList, Sheet, Toast, primaryButton, secondaryButton, textLink, useToast } from "@/components/space/SpaceUI";
import TogetherPairDetail from "@/components/together/TogetherPairDetail";
import TogetherResultShareCard from "@/components/together/TogetherResultShareCard";
import { useInlinedCovers } from "@/utils/useInlinedCovers";
import LoginModal from "@/components/LoginModal";

/**
 * 끝낸 판 하나를 저장하는 중인 것. **run 마다 하나.** 로그인 한 번에 AuthProvider 가
 * user 를 두세 번 갱신하고 개발 모드는 effect 를 두 번 돌린다 — 같은 판을 두 번
 * 보내지 않게 돌고 있는 것에 올라탄다.
 */
const processing = new Map<string, Promise<string | null>>();

/**
 * 끝낸 판을 저장한다. 참여 기록 -> 개인 취향표 순서로, 끝낸 단계는 쪽지에 적는다.
 * 실패한 단계는 적지 않는다 — 다음에 이 화면을 열 때 그 단계만 다시 한다.
 * 쪽지는 두 단계가 다 끝나면 지워진다(`markCompletion`).
 */
function processCompletion(
  found: SortChallenge,
  c: TogetherCompletion,
  user: { id: string; user_metadata?: { nickname?: string } } | null
): Promise<string | null> {
  const running = processing.get(c.runId);
  if (running) return running;

  const p = (async () => {
    // 이 방의 곡이 아닌 id 는 싣지 않는다. 출처 확인은 challengeId 로 이미 했다.
    const trackIds = new Set(found.tracks.map((t) => t.id));
    const ids = c.ranking.filter((id) => trackIds.has(id));
    let savedId: string | null = null;

    if (!c.entrySaved) {
      if (ids.length > 1) {
        savedId = await saveEntry({
          challengeId: found.id,
          // 소트 시작 전에 받아 둔 이름. 로그인하지 않은 사람도 이름이 남는다
          // (예전에는 프로필 닉네임만 봐서 전부 "익명 리스너"로 나왔다).
          nickname: user?.user_metadata?.nickname ?? rememberedNickname() ?? null,
          ranking: ids,
          // 이 방의 곡만 싣는다. 순위와 같은 기준이다.
          skippedTrackIds: c.skippedTrackIds.filter((id) => trackIds.has(id)),
        });
      }
      // 저장했거나, 저장할 순위가 아니다(곡 1개 이하). 어느 쪽이든 다시 하지 않는다.
      if (savedId || ids.length <= 1) {
        markCompletion(c.runId, { entrySaved: true });
        safeSessionStorage.removeItem("together_code");
      }
    }

    if (!c.tasteDone) {
      /*
       * 같이 소트한 것도 **내 취향표로 남긴다.** 참여한 사람마다 각자의 취향표가 생긴다.
       *
       * 예전에는 남기지 않았다(월드컵이 `?challenge=1` 이면 저장을 건너뛴다). 그래서
       * 같이 소트하기로 한 소트는 아무리 해도 내 취향 스페이스에 안 쌓였다.
       *
       * 기준은 혼자 할 때와 같은 16곡이다 — 방은 4곡부터 만들 수 있어서, 조건 없이
       * 남기면 4곡짜리 취향표가 계속 쌓인다. "모르는 곡"으로 뺀 곡도 더해서 센다.
       *
       * **한 판에 한 장.** 이 화면을 몇 번 열든(새로 고침·뒤로 가기·로그인으로 effect 가
       * 다시 돌든) 같은 run 이면 같은 id(`tasteResultId`)로 넣는다 — 두 번째는 PK 가 막는다.
       * 판을 처음 처리할 때 게스트였으면 남기지 않는다(예전과 같다). 다시 소트한 결과는
       * 새 run 이라 새로 남는다.
       *
       * 제목에 시각까지 적는다. 같은 방을 하루에 두 번 하면 날짜만으로는 구분이 안 되고,
       * 가져온 원본 취향표와도 같은 이름이 된다.
       */
      const byTrackId = new Map(found.tracks.map((t) => [t.id, t]));
      const ranked = ids.map((id) => byTrackId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
      if (!user || ranked.length + c.skipped < 16) {
        markCompletion(c.runId, { tasteDone: true });
      } else {
        const d = new Date(c.completedAt);
        const p2 = (n: number) => String(n).padStart(2, "0");
        const stamp = `${String(d.getFullYear()).slice(-2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
        const artist = found.artist_name || ranked[0]?.artistName || found.title;
        /*
         * `clearDraft` 를 주지 않는다. 같이 소트한 결과는 **내 개인 임시저장과 무관**하다.
         * 예전에는 결과를 저장하면 무조건 그 모드의 임시저장을 지워서, 같이 소트 한 번에
         * 혼자 하던 월드컵의 이어하기가 사라졌다.
         */
        const res = await saveCompletedResult(ranked, ranked.slice(1), `${artist} sort_${stamp}`, {
          isSingleArtist: true,
          artistId: found.artist_id ?? null,
          artistName: found.artist_name ?? null,
          id: c.tasteResultId,
        });
        /*
         * **잇는 것까지 끝나야 이 단계가 끝난 것이다.**
         *
         * 취향표는 남았는데 연결이 실패하면, 프로필의 완료 목록에 같은 활동이 두 줄로
         * 남는다. 그 상태로 `tasteDone` 을 적어 버리면 다시 시도할 길이 없다.
         *
         * 다시 와도 안전하다 — 취향표는 같은 `tasteResultId` 로 넣으므로 두 번째는 PK 가
         * 막고(23505 를 성공으로 본다), 연결만 다시 시도한다.
         */
        if (res.success && (await linkTasteResult(found.id, c.tasteResultId))) {
          markCompletion(c.runId, { tasteDone: true });
        }
      }
    }
    return savedId;
  })().finally(() => processing.delete(c.runId));

  processing.set(c.runId, p);
  return p;
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
  /** 이 방에서 내 계정이 가진 기록의 id. 목록에는 user_id 가 실리지 않으므로 따로 묻는다. */
  const [ownedId, setOwnedId] = useState<string | null>(null);

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

      /*
       * **이 화면을 여는 것은 읽기다.** 저장은 이 방에서 방금 끝낸 판의 쪽지가 있을 때만.
       *
       * 예전에는 세션에 남은 `worldcup_ranking` 을 곡이 겹치는지만 보고 저장했다. 그래서
       * 소트한 적 없는 방의 결과를 열기만 해도 다른 방·혼자 소트의 순위가 내 기록으로
       * 섰고, 로그아웃한 기기에서는 유령 참여자가 생겼고, 16곡 이상 방은 열 때마다
       * 취향표가 한 장씩 늘었다. 이제 출처(challengeId)와 끝낸 사람을 확인한다
       * (utils/togetherCompletion.ts).
       *
       * 이 effect 는 `user` 가 바뀔 때마다 다시 돈다. 같은 판이면 끝낸 단계는 건너뛰고,
       * 돌고 있는 저장에는 올라탄다.
       */
      const completion = completionFor(found.id, user?.id ?? null);
      if (completion) {
        const savedId = await processCompletion(found, completion, user);
        if (alive && savedId && user) setOwnedId(savedId);
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

  /*
   * 계정이 확인되면 **익명으로 남긴 기록에 소유권을 붙인다.**
   *
   * 로그인 성공 콜백이 아니라 여기서 한다 — OAuth 팝업이나 토큰 갱신은 콜백과 세션이
   * 서는 시점이 다르다. 이메일·가입·구글·카카오가 전부 같은 길을 지난다.
   *
   * 증명이 맞지 않는 옛 기록은 서버가 조용히 null 을 돌려준다. 그때도 화면은
   * 기기 키로 계속 내 결과를 찾으므로 아무것도 사라지지 않는다.
   */
  useEffect(() => {
    if (isLoading || !user || !challenge) return;
    let alive = true;
    (async () => {
      /*
       * **성공하기 전에 뜻을 지우지 않는다.** 집어 갈 때 이 계정을 쪽지에 먼저 적고,
       * 서버가 소유를 확인해 준 뒤에야 지운다. 실패하면 남아서 다음에 다시 시도한다.
       */
      const pending = bindPendingClaim(user.id);
      if (pending === challenge.id) {
        const claimed = await claimEntry(challenge.id);
        if (claimed) {
          clearPendingClaim(challenge.id);
          if (alive) {
            setOwnedId(claimed);
            setEntries(await fetchEntries(challenge.id));
            showToast("소트 결과를 내 계정에 저장했어요");
          }
          return;
        }
      }
      // 이미 내 계정 것이면 뜻은 이뤄진 것이다 — 그때도 지운다.
      const owned = await fetchOwnedEntryId(challenge.id);
      if (owned) clearPendingClaim(challenge.id);
      if (alive && owned) setOwnedId(owned);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isLoading, challenge?.id]);

  /* 고정 바의 실제 높이만큼 본문 끝을 비운다. */
  const dockRef = useDockClearance();

  /*
   * 이 화면을 보는 사람의 신원.
   *
   * 예전에는 `mine` 은 계정 소유 기록을 고르면서 `key` 는 기기 키를 그대로 썼다.
   * 둘이 다른 기록을 가리키면 **내 기록이 "남" 쪽에 남아** 나와 내가 100% 로 이어졌다.
   * 이제 관계 계산의 내 키는 **대표 기록에서** 온다.
   */
  const self = useMemo(
    () => resolveSelfIdentity(entries, { ownedEntryId: ownedId, userId: user?.id }),
    [entries, ownedId, user?.id]
  );
  const mine = self.primary;
  const key = self.primaryKey;

  /*
   * 같은 사람의 기록이 둘 이상 남아 있을 수 있다(옛 버그가 만든 행). 화면 계산은
   * **전부 이 목록으로** 한다 — 노드만 숨기고 계산에 남겨 두면 참가자 수와 종합
   * 일치율이 나와 나의 100% 에 끌려간다.
   */
  const shown = useMemo(() => normalizeEntriesForViewer(entries, self), [entries, self]);

  const others = useMemo(() => {
    if (!mine) return [];
    return shown
      .filter((e) => e.participant_key !== key)
      .map((e) => ({ entry: e, match: matchRate(mine.ranking, e.ranking) }))
      .sort((a, b) => b.match.rate - a.match.rate);
  }, [shown, mine, key]);

  /* ── 그룹 계산. 화면은 여기서 나온 값만 쓴다(utils/togetherMatch.ts) ── */

  const participants = useMemo(
    () => shown.map((e) => ({ key: e.participant_key, nickname: e.nickname })),
    [shown]
  );
  const pairs = useMemo(
    () => buildPairwiseMatches(shown.map((e) => ({ key: e.participant_key, nickname: e.nickname, ranking: e.ranking }))),
    [shown]
  );
  const groupRate = useMemo(() => groupMatchRate(pairs), [pairs]);
  const myPartners = useMemo(() => partnersOf(pairs, key), [pairs, key]);

  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showAllMine, setShowAllMine] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * 나가려는 사람에게 한 번만 띄우는 로그인 안내.
   *
   * 로그인하지 않으면 이 결과는 이 기기의 링크에만 남는다 — 링크를 잃으면 끝이다.
   * 나가기 직전이 그 사실이 가장 와닿는 순간이라 여기서 한 번 말한다.
   * 로그인한 사람에게는 띄우지 않는다(이미 취향표로 남아 있다).
   */
  const [askLogin, setAskLogin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  /** 안내를 이미 봤거나 나가기로 정했다 — 두 번 막지 않는다. */
  const leaving = useRef(false);
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

  /** 나가기. 안내를 한 번 띄우고, 두 번째부터는 그냥 나간다. */
  const leave = () => {
    if (user || leaving.current) return goHome();
    leaving.current = true;
    setAskLogin(true);
  };
  /**
   * **서비스 홈으로 나간다.** history 를 보지 않는다.
   *
   * 예전에는 history 가 있으면 `router.back()` 을 했다. 그런데 이 화면까지 오는 길이
   *   초대 화면 -> 월드컵 -> 결과
   * 라서, 뒤로 가면 같이 소트하기 안을 맴돌 뿐 밖으로 못 나갔다. "닫기" 는 "이전 화면"
   * 이 아니라 "여기서 나간다" 는 뜻이므로 갈 곳을 분명히 적는다.
   */
  const goHome = () => {
    leaving.current = true;
    router.push("/");
  };

  /*
   * 브라우저·기기 뒤로가기도 같은 안내를 지난다. 월드컵 나가기 가드와 같은 방식이다
   * (history 에 한 칸을 밀어 두고 popstate 를 받으면 되돌린다).
   */
  useEffect(() => {
    if (user) return;                       // 로그인했으면 막을 이유가 없다
    history.pushState(null, "", location.href);
    const onPop = () => {
      if (leaving.current) return;
      history.pushState(null, "", location.href);
      leaving.current = true;
      setAskLogin(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user]);

  /* 옆 사람이 끝나면 화면이 저절로 바뀐다. 무엇이 바뀌었는지 한 줄로 알려 준다. */
  const seenCount = useRef<number | null>(null);
  useEffect(() => {
    if (!entries) return;
    const before = seenCount.current;
    seenCount.current = shown.length;
    if (before !== null && shown.length > before) {
      showToast(`새 결과가 반영됐어요 · ${shown.length}명이 함께했어요`);
    }
  }, [entries, shown.length, showToast]);

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
  const challengeTrackIds = challenge.tracks.map((t) => t.id);
  /*
   * 그 사람이 **어떤 곡을 몰랐는가.** 적혀 있으면 그대로 쓰고, 적히기 전의 기록은
   * 셀 수 있을 때만 되살린다(`inferLegacySkipped`). 셀 수 없으면 아무 곡도
   * "모르는 곡" 이라고 하지 않는다 — 틀린 표시는 없는 표시보다 나쁘다.
   */
  const skippedOf = (e: { ranking: string[]; skipped_count: number; skipped_track_ids?: string[] } | null | undefined) => {
    if (!e) return [];
    if (Array.isArray(e.skipped_track_ids) && e.skipped_track_ids.length > 0) return e.skipped_track_ids;
    return inferLegacySkipped(e.ranking, e.skipped_count ?? 0, challengeTrackIds);
  };
  const myTracks = mine.ranking.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/together/${challenge.code}`;

  /* 아티스트 사진이 없는 방(마이그레이션 전)에서는 그 아티스트의 앨범 재킷을 쓴다.
     둘 다 없으면 사진 없이 간다 — 상관없는 사진을 채우지 않는다. */
  const heroImage = challenge.artist_image || myTracks[0]?.albumImage || null;
  const artistLabel = challenge.artist_name || challenge.title;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col">
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

        {/* 닫기. 사진 위에 올라가므로 바탕을 깔아 밝은 사진에서도 보이게 한다. */}
        <button
          type="button"
          onClick={leave}
          aria-label="닫기"
          className="absolute right-0 top-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--app-bg)]/70 backdrop-blur-sm text-navy hover:bg-[var(--app-bg)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-point-ink)]"
        >
          <X size={20} strokeWidth={2.25} />
        </button>

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
            {shown.length}명이 함께했어요
          </p>

          {/*
            계정에 남았다는 것을 **계속** 보여 준다. 토스트는 3초 뒤 사라져서, 새로 고치면
            "저장된 건가?" 를 다시 묻게 된다. 이 줄은 `ownedId` 로 그리므로 새로 고쳐도
            서버가 소유를 확인해 주면 그대로 다시 선다.
          */}
          {user && ownedId && (
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="type-caption text-navy/70 inline-flex items-center gap-1">
                <Check size={14} strokeWidth={2.5} aria-hidden />
                내 계정에 저장됐어요
              </span>
              <button type="button" onClick={() => router.push("/explore-taste")} className={textLink}>
                내 취향 스페이스에서 보기
              </button>
            </div>
          )}
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
          <GraphLegend pairs={pairs} participants={participants} myKey={key} trackCount={challenge.tracks.length} />
        </section>
      )}

      {/* 고른 사람과 나 */}
      {selectedPair && selectedEntry && (
        <TogetherPairDetail
          pair={selectedPair}
          myKey={key}
          myRanking={mine.ranking}
          theirRanking={selectedEntry.ranking}
          mySkippedIds={skippedOf(mine)}
          theirSkippedIds={skippedOf(selectedEntry)}
          challengeTrackIds={challengeTrackIds}
          theirName={personName(selectedEntry.nickname)}
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
      <DockSpacer />
      </div>

      <div ref={dockRef} className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
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
          participantCount={shown.length}
          groupRate={groupRate}
          participants={participants}
          pairs={pairs}
          myKey={key}
          artistImage={heroForCard ? inlined[heroForCard] ?? heroForCard : null}
          /* 방 이름을 따로 적은 경우에만. 기본값은 아티스트명이라 두 번 적게 된다. */
          roomName={challenge.title && challenge.title !== challenge.artist_name ? challenge.title : null}
        />
      </div>

      {/*
        나가기 직전의 로그인 안내. 막는 게 아니라 알려 주는 것이라 [그냥 나가기] 를 함께 둔다 —
        닫을 길이 없는 안내는 안내가 아니라 덫이다.
      */}
      <Sheet
        open={askLogin}
        onClose={() => setAskLogin(false)}
        closeLabel="닫기"
        header={
          <>
            <h2 className="type-title-2 text-navy break-keep">소트 결과를 남겨 두고 싶다면?</h2>
            {/*
              "링크가 만료되면" 이라고 쓰지 않는다 — 방에는 수명이 없다(만료 칸도, 지우는
              작업도 없다). 없는 만료를 말하면 곧 사라진다고 오해한다. 사실은 "이 링크로만"이다.
            */}
            <p className="type-caption text-navy/70 mt-1 break-keep">
              로그인하면 이 결과가 내 취향 스페이스에 남아요. 지금은 이 링크로만 다시 볼 수 있어요.
            </p>
          </>
        }
        footer={
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setAskLogin(false);
                /*
                 * 로그인 뒤에 붙일 기록을 적어 둔다. 로그인 방식마다(이메일·가입·
                 * 구글·카카오) 콜백 시점이 달라서, "콜백이 불렸다" 가 아니라
                 * **계정이 확인됐을 때** 붙이도록 위의 effect 가 이 쪽지를 읽는다.
                 */
                if (challenge) rememberPendingClaim(challenge.id);
                setLoginOpen(true);
              }}
              className={`${primaryButton} w-full`}
            >
              로그인하기
            </button>
            <button onClick={goHome} className={`${secondaryButton} w-full`}>
              그냥 나가기
            </button>
          </div>
        }
      />

      {/*
        로그인창은 이 화면 위에서 연다. 다른 화면으로 보내면 방금 본 결과를 잃는다 —
        로그인하고 돌아오면 그대로 이 결과이고, 그때부터 취향표로도 남는다.
      */}
      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setLoginOpen(false)}
      />

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
  myKey,
  trackCount,
}: {
  pairs: ReturnType<typeof buildPairwiseMatches>;
  participants: { key: string; nickname: string | null }[];
  myKey: string;
  trackCount: number;
}) {
  const { highest, lowest } = useMemo(
    () => pickHighlightEdges(pairs, trackCount),
    [pairs, trackCount]
  );
  const name = (k: string) => personName(participants.find((p) => p.key === k)?.nickname, k === myKey);
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
