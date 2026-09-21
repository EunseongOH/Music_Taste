"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Disc, ChevronDown } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";
import LoginModal from "@/components/LoginModal";
import ProfileHeader from "@/components/ProfileHeader";
import { displayNickname } from "@/utils/nickname";
import {
  Avatar,
  ConfirmSheet,
  Cover,
  EmptyState,
  RankList,
  SectionTitle,
  Sheet,
  Switch,
  Toast,
  UnderlineTabs,
  formatDate,
  primaryButton,
  textLink,
  useToast,
} from "@/components/space/SpaceUI";

interface Track {
  id?: string;
  i?: string;
  title: string;
  t?: string;
  artistName: string;
  a?: string;
  albumImage: string;
  m?: string;
}

interface TournamentResult {
  id: string;
  user_id: string;
  title: string;
  winner_track_id: string;
  winner_track_title: string;
  winner_track_artist: string;
  winner_track_image: string;
  total_candidates: number;
  ranking: Track[];
  is_public: boolean;
  is_single_artist: boolean;
  artist_id?: string;
  artist_name?: string;
  user_nickname: string;
  user_profile_image: string;
  created_at: string;
}

/** 월드컵에서 "모르는 곡"으로 뺀 곡 (listen_later_tracks). */
interface ListenLaterTrack {
  id: string;
  track_id: string;
  title: string;
  artist_name: string | null;
  album_image: string | null;
  is_unreleased: boolean;
  created_at: string;
}

const translations = {
  ko: {
    title: "내 취향 스페이스",
    intro: "완성한 취향표와 들어볼 곡을 모아 두고, 취향이 비슷한 사람을 찾아보세요.",
    tabArchive: "내 취향표",
    tabListen: "들어볼 곡",
    tabSocial: "취향 메이트",
    syncing: "불러오는 중이에요",
    close: "닫기",
    cancel: "취소",
    guestTitle: "로그인하고 내 취향을 모아 보세요",
    guestDesc: "완성한 취향표를 저장하고, 나와 취향이 비슷한 사람들의 취향표를 볼 수 있어요.",
    guestBtn: "로그인하고 시작하기",
    guestBrowse: "공개된 취향표 둘러보기",
    emptyArchiveTitle: "아직 완성한 취향표가 없어요",
    emptyArchiveDesc: "좋아하는 아티스트의 곡으로 첫 소트를 해 보세요.",
    playWorldCupBtn: "소트하러 가기",
    singleDiscography: "최애 곡 줄 세우기",
    mixLabel: "믹스 매치",
    winnerPrefix: "1위",
    publicLabel: "공개",
    privateLabel: "비공개",
    publicSwitchLabel: "공개 여부",
    togglePublicFailed: "공개 여부를 바꾸지 못했어요. 다시 시도해 주세요.",
    deleteBtn: "이 취향표 삭제",
    deleteConfirmTitle: "취향표를 삭제할까요?",
    deleteConfirm: "삭제하면 되돌릴 수 없어요.",
    deleteAction: "삭제",
    deleteSuccess: "취향표를 삭제했어요.",
    deleteFailed: "삭제하지 못했어요. 다시 시도해 주세요.",
    loadAndShare: "불러와서 공유하기",
    emptyListenTitle: "들어볼 곡이 없어요",
    emptyListenDesc: "월드컵에서 모르는 곡을 위로 올려 빼면 여기에 모여요.",
    listenUnreleased: "미발매",
    listenRemove: "목록에서 지우기",
    selectMatchBase: "기준 취향표",
    matchBaseDesc: "이 취향표의 1위 곡·아티스트와 TOP 10 순위로 취향이 비슷한 사람을 찾아요.",
    matesSameWinner: "같은 1위 곡",
    matesSameArtist: "같은 1위 아티스트",
    matesHighSync: "취향 싱크 높은 순",
    noMateSameWinner: "아직 1위 곡이 같은 사람이 없어요.",
    noMateSameArtist: "아직 1위 아티스트가 같은 사람이 없어요.",
    noMateSync: "아직 순위가 겹치는 사람이 없어요.",
    syncLabel: "취향 싱크",
    mateRecordTitle: "{nickname}님의 취향표",
    nicknameDefault: "음악팬",
    guestMatchGuideTitle: "취향표가 하나 있어야 해요",
    guestMatchGuideDesc: "완성한 취향표를 기준으로 비슷한 취향을 찾아요.",
    firstWorldCupBtn: "첫 취향표 만들기",
  },
  en: {
    title: "My Taste Space",
    intro: "Keep your taste cards and songs to listen to, and find people with similar taste.",
    tabArchive: "My Cards",
    tabListen: "Listen Later",
    tabSocial: "Taste Mates",
    syncing: "Loading",
    close: "Close",
    cancel: "Cancel",
    guestTitle: "Log in to collect your taste",
    guestDesc: "Save your taste cards and see cards from people with similar taste.",
    guestBtn: "Log in to start",
    guestBrowse: "Browse public taste cards",
    emptyArchiveTitle: "No taste cards yet",
    emptyArchiveDesc: "Play your first World Cup with songs from an artist you love.",
    playWorldCupBtn: "Play a World Cup",
    singleDiscography: "Favorite Songs Lineup",
    mixLabel: "Mix Match",
    winnerPrefix: "#1",
    publicLabel: "Public",
    privateLabel: "Private",
    publicSwitchLabel: "Visibility",
    togglePublicFailed: "Couldn't change visibility. Please try again.",
    deleteBtn: "Delete this card",
    deleteConfirmTitle: "Delete this taste card?",
    deleteConfirm: "This can't be undone.",
    deleteAction: "Delete",
    deleteSuccess: "Taste card deleted.",
    deleteFailed: "Couldn't delete. Please try again.",
    loadAndShare: "Load & share",
    emptyListenTitle: "Nothing to listen to yet",
    emptyListenDesc: "Songs you drag up to skip during a World Cup gather here.",
    listenUnreleased: "Unreleased",
    listenRemove: "Remove from list",
    selectMatchBase: "Base taste card",
    matchBaseDesc: "We match people by this card's #1 song, artist, and Top 10 ranking.",
    matesSameWinner: "Same #1 song",
    matesSameArtist: "Same #1 artist",
    matesHighSync: "Highest taste sync",
    noMateSameWinner: "No one shares your #1 song yet.",
    noMateSameArtist: "No one shares your #1 artist yet.",
    noMateSync: "No overlapping rankings yet.",
    syncLabel: "Taste sync",
    mateRecordTitle: "{nickname}'s taste card",
    nicknameDefault: "Music Fan",
    guestMatchGuideTitle: "You need one taste card",
    guestMatchGuideDesc: "We use your completed card to find similar taste.",
    firstWorldCupBtn: "Make my first card",
  }
};

export default function ExploreTastePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"archive" | "social" | "listen">("archive");
  const [completedResults, setCompletedResults] = useState<TournamentResult[]>([]);
  const [listenTracks, setListenTracks] = useState<ListenLaterTrack[]>([]);
  const [otherUsersResults, setOtherUsersResults] = useState<TournamentResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const { toast, showToast } = useToast();
  // 삭제 확인 시트에 올린 취향표 id
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getSafeLocale());
    }
  }, []);

  // Selected result for matching criteria
  const [selectedMatchBaseResultId, setSelectedMatchBaseResultId] = useState<string>("");

  // Detailed views
  const [selectedArchiveDetail, setSelectedArchiveDetail] = useState<TournamentResult | null>(null);
  const [selectedMateDetail, setSelectedMateDetail] = useState<TournamentResult | null>(null);
  const [mateDetailJaccard, setMateDetailJaccard] = useState<number | null>(null);

  // Fetch archives and public results
  const fetchData = async () => {
    if (!user) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      // 1. Fetch current user completed results
      const { data: myData, error: myError } = await supabase
        .from("tournament_results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (myError) throw myError;
      setCompletedResults(myData || []);

      if (myData && myData.length > 0) {
        setSelectedMatchBaseResultId(myData[0].id);
      }

      // 2. Fetch other users public results for social matching feed
      const { data: othersData, error: othersError } = await supabase
        .from("tournament_results")
        .select("*")
        .eq("is_public", true)
        .neq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (othersError) throw othersError;
      setOtherUsersResults(othersData || []);

      // 3. 들어볼 곡. 실패해도 위 두 탭은 보여야 하므로 따로 처리한다.
      const { data: listenData, error: listenError } = await supabase
        .from("listen_later_tracks")
        .select("id, track_id, title, artist_name, album_image, is_unreleased, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (listenError) console.error("[ExploreTaste] Error fetching listen later:", listenError.message);
      setListenTracks(listenData || []);
    } catch (err) {
      console.error("[ExploreTaste] Error fetching data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      fetchData();
    }
  }, [user, isLoading]);

  const handleRemoveListen = async (id: string) => {
    const prev = listenTracks;
    setListenTracks(prev.filter((tr) => tr.id !== id));
    const { error } = await supabase.from("listen_later_tracks").delete().eq("id", id);
    if (error) {
      console.error("[ExploreTaste] Error removing listen later:", error.message);
      setListenTracks(prev);
    }
  };

  // Toggle record public/private state real-time
  const handleTogglePublic = async (resultId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // Optimistic UI update
    setCompletedResults(prev => prev.map(r => r.id === resultId ? { ...r, is_public: newStatus } : r));

    try {
      const { error } = await supabase
        .from("tournament_results")
        .update({ is_public: newStatus })
        .eq("id", resultId);

      if (error) throw error;
    } catch (err) {
      console.error("[ExploreTaste] Toggle public state error:", err);
      // Revert on error
      setCompletedResults(prev => prev.map(r => r.id === resultId ? { ...r, is_public: currentStatus } : r));
      showToast(translations[locale].togglePublicFailed, "error");
    }
  };

  // Delete completed result
  const handleDeleteResult = async (resultId: string) => {
    // 확인은 ConfirmSheet 가 먼저 받는다(window.confirm 은 토스 WebView 에서 어색하다).
    try {
      const { error } = await supabase
        .from("tournament_results")
        .delete()
        .eq("id", resultId);

      if (error) throw error;

      setCompletedResults(prev => prev.filter(r => r.id !== resultId));
      if (selectedMatchBaseResultId === resultId) {
        const remaining = completedResults.filter(r => r.id !== resultId);
        setSelectedMatchBaseResultId(remaining.length > 0 ? remaining[0].id : "");
      }
      setPendingDeleteId(null);
      setSelectedArchiveDetail(null);
      showToast(translations[locale].deleteSuccess);
    } catch (err) {
      console.error("[ExploreTaste] Error deleting result:", err);
      setPendingDeleteId(null);
      showToast(translations[locale].deleteFailed, "error");
    }
  };

  // Normalize track fields for safe rendering (supporting compressed models as well)
  const getNormalizedTracks = (result: TournamentResult | null): Track[] => {
    if (!result) return [];
    const ranking = result.ranking || [];
    return ranking.map((t: any) => ({
      id: t.id || t.i,
      title: t.title || t.t,
      artistName: t.artistName || t.a,
      albumImage: t.albumImage || (t.m ? (t.m.startsWith("http") ? t.m : `https://i.scdn.co/image/${t.m}`) : "")
    }));
  };

  // Normalize standard tracks
  const getNormalizedTrackId = (track: any): string => {
    return track.id || track.i || "";
  };

  // Get Top 10 tracks helper
  const getTop10Ids = (result: TournamentResult): string[] => {
    const ranking = result.ranking || [];
    return ranking.slice(0, 10).map((t: any) => getNormalizedTrackId(t)).filter(Boolean);
  };

  // Rank-weighted similarity calculator (higher rank matches yield higher scores)
  const getJaccardSimilarity = (myResult: TournamentResult, otherResult: TournamentResult): number => {
    const myIds = getTop10Ids(myResult);
    const otherIds = getTop10Ids(otherResult);

    if (myIds.length === 0 || otherIds.length === 0) return 0;

    let accumulatedScore = 0;
    const maxScore = 55; // Sum of weights from 10 down to 1 (10+9+8+7+6+5+4+3+2+1)

    myIds.forEach((myId, i) => {
      const otherIndex = otherIds.indexOf(myId);
      if (otherIndex !== -1) {
        const myWeight = 10 - i;             // Rank 1 gets 10, Rank 10 gets 1
        const otherWeight = 10 - otherIndex; // Rank 1 gets 10, Rank 10 gets 1
        const rankDiffPenalty = 1 - Math.abs(i - otherIndex) / 10; // Closer ranks get higher multiplier
        
        accumulatedScore += ((myWeight + otherWeight) / 2) * rankDiffPenalty;
      }
    });

    return (accumulatedScore / maxScore) * 100;
  };

  // Filter and process matches based on selected match criteria
  const getMatesData = () => {
    const baseResult = completedResults.find(r => r.id === selectedMatchBaseResultId);
    if (!baseResult) return { songMates: [], artistMates: [], highSyncMates: [] };

    const songMates: TournamentResult[] = [];
    const artistMates: TournamentResult[] = [];
    const highSyncMates: { result: TournamentResult; score: number }[] = [];

    // Track seen user IDs per category to deduplicate (otherUsersResults is ordered by
    // created_at desc, so the first hit per user_id is always their most recent result)
    const seenSongMateUsers = new Set<string>();
    const seenArtistMateUsers = new Set<string>();
    const seenHighSyncUsers = new Set<string>();

    otherUsersResults.forEach(other => {
      // 1. Same winner song mate
      if (
        other.winner_track_id === baseResult.winner_track_id &&
        !seenSongMateUsers.has(other.user_id)
      ) {
        seenSongMateUsers.add(other.user_id);
        songMates.push(other);
      }

      // 2. Same winner artist mate
      if (
        other.winner_track_artist.toLowerCase().trim() === baseResult.winner_track_artist.toLowerCase().trim() &&
        !seenArtistMateUsers.has(other.user_id)
      ) {
        seenArtistMateUsers.add(other.user_id);
        artistMates.push(other);
      }

      // 3. High Jaccard Sync score (use the most recent result per user)
      if (!seenHighSyncUsers.has(other.user_id)) {
        const syncScore = getJaccardSimilarity(baseResult, other);
        if (syncScore > 0) {
          seenHighSyncUsers.add(other.user_id);
          highSyncMates.push({ result: other, score: syncScore });
        }
      }
    });

    // Sort high sync mates descending
    highSyncMates.sort((a, b) => b.score - a.score);

    return { songMates, artistMates, highSyncMates };
  };

  const { songMates, artistMates, highSyncMates } = getMatesData();
  const currentBaseResult = completedResults.find(r => r.id === selectedMatchBaseResultId);
  const t = locale === "en" ? translations.en : translations.ko;

  const tabs = [
    { id: "archive" as const, label: t.tabArchive, count: isLoadingData ? null : completedResults.length },
    { id: "listen" as const, label: t.tabListen, count: isLoadingData ? null : listenTracks.length },
    { id: "social" as const, label: t.tabSocial },
  ];

  const openMate = (mate: TournamentResult, score?: number) => {
    setSelectedMateDetail(mate);
    if (score !== undefined) setMateDetailJaccard(score);
    else if (currentBaseResult) setMateDetailJaccard(getJaccardSimilarity(currentBaseResult, mate));
  };

  /** 같은 1위 곡 · 같은 아티스트: 아바타와 닉네임만 가로로 나열한다. */
  const renderMateStrip = (title: string, mates: TournamentResult[], emptyText: string) => (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} count={mates.length} />
      {mates.length === 0 ? (
        <p className="type-sub text-navy/70">{emptyText}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto -mx-6 px-6 pb-1 scrollbar-none snap-x">
          {mates.map((mate) => {
            const name = displayNickname(mate.user_nickname, t.nicknameDefault);
            return (
              <button
                key={mate.id}
                onClick={() => openMate(mate)}
                className="w-[72px] shrink-0 snap-start flex flex-col items-center text-center cursor-pointer"
              >
                <Avatar src={mate.user_profile_image} alt={name} size={56} />
                <span className="type-caption text-navy font-semibold truncate w-full mt-2">{name}</span>
                <span className="type-caption text-navy/70">{formatDate(mate.created_at, locale)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  // 목록에서 공개 전환하면 상세도 따라가도록 목록의 최신 값을 쓴다.
  const archiveDetail = selectedArchiveDetail
    ? completedResults.find((x) => x.id === selectedArchiveDetail.id) ?? selectedArchiveDetail
    : null;
  const archiveTracks = getNormalizedTracks(archiveDetail);
  const mateTracks = getNormalizedTracks(selectedMateDetail);
  const modeLabel = (r: TournamentResult) => (r.is_single_artist ? t.singleDiscography : t.mixLabel);

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      <Toast toast={toast} />

      {/* Header Panel */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="type-title-1 text-navy">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileHeader locale={locale} />
        </div>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
        <p className="type-sub text-navy/70 pt-5 pb-4">{t.intro}</p>

        {/* 게스트는 탭이 의미가 없으므로(모든 탭이 같은 안내) 탭을 숨긴다. */}
        {(isLoadingData || user) && <UnderlineTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />}

        {isLoadingData && (
          <div className="py-24 flex flex-col items-center gap-3">
            <Disc className="animate-spin text-point" size={28} />
            <p className="type-sub text-navy/70">{t.syncing}</p>
          </div>
        )}

        {!isLoadingData && !user && (
          <EmptyState
            title={t.guestTitle}
            desc={t.guestDesc}
            action={
              <div className="flex flex-col items-center gap-4">
                <button onClick={() => setIsLoginModalOpen(true)} className={primaryButton}>
                  {t.guestBtn}
                </button>
                <button onClick={() => router.push("/archive")} className={textLink}>
                  {t.guestBrowse}
                </button>
              </div>
            }
          />
        )}

        {/* 내 취향표 */}
        {!isLoadingData && user && activeTab === "archive" && (
          completedResults.length === 0 ? (
            <EmptyState
              title={t.emptyArchiveTitle}
              desc={t.emptyArchiveDesc}
              action={
                <button onClick={() => router.push("/")} className={primaryButton}>
                  {t.playWorldCupBtn}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-navy/10">
              {completedResults.map((result) => (
                <li key={result.id} className="flex items-center gap-3 py-4">
                  <button
                    onClick={() => setSelectedArchiveDetail(result)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer"
                  >
                    <Cover src={result.winner_track_image} alt={result.winner_track_title} size={56} />
                    <div className="flex-1 min-w-0">
                      <p className="type-body-strong text-navy truncate">{result.title}</p>
                      <p className="type-sub text-navy/70 truncate">
                        {t.winnerPrefix} {result.winner_track_title} · {result.winner_track_artist}
                      </p>
                      <p className="type-caption text-navy/70 truncate">
                        {formatDate(result.created_at, locale)} · {modeLabel(result)}
                      </p>
                    </div>
                  </button>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Switch
                      checked={result.is_public}
                      onChange={() => handleTogglePublic(result.id, result.is_public)}
                      label={t.publicSwitchLabel}
                    />
                    <span className={`type-caption ${result.is_public ? "text-point-ink" : "text-navy/70"}`}>
                      {result.is_public ? t.publicLabel : t.privateLabel}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        {/* 들어볼 곡 */}
        {!isLoadingData && user && activeTab === "listen" && (
          listenTracks.length === 0 ? (
            <EmptyState title={t.emptyListenTitle} desc={t.emptyListenDesc} />
          ) : (
            <ul className="divide-y divide-navy/10">
              {listenTracks.map((tr) => (
                <li key={tr.id} className="flex items-center gap-3 py-3">
                  <Cover src={tr.album_image} alt={tr.title} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="type-body-strong text-navy truncate">{tr.title}</p>
                    <p className="type-sub text-navy/70 truncate">
                      {tr.artist_name}
                      {tr.is_unreleased && <span className="ml-1.5 type-caption text-navy">· {t.listenUnreleased}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveListen(tr.id)}
                    aria-label={t.listenRemove}
                    className="w-10 h-10 flex items-center justify-center rounded-full text-navy/70 hover:text-navy hover:bg-navy/5 cursor-pointer shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {/* 취향 메이트 */}
        {!isLoadingData && user && activeTab === "social" && (
          completedResults.length === 0 ? (
            <EmptyState
              title={t.guestMatchGuideTitle}
              desc={t.guestMatchGuideDesc}
              action={
                <button onClick={() => router.push("/")} className={primaryButton}>
                  {t.firstWorldCupBtn}
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-9 pt-6">
              {/* 기준 취향표 */}
              <section className="flex flex-col gap-3">
                <SectionTitle title={t.selectMatchBase} />
                <div className="relative">
                  <select
                    value={selectedMatchBaseResultId}
                    onChange={(e) => setSelectedMatchBaseResultId(e.target.value)}
                    aria-label={t.selectMatchBase}
                    className="w-full h-12 pl-0 pr-8 bg-transparent border-b-2 border-navy/20 appearance-none focus:outline-none focus:border-navy type-body-strong text-navy cursor-pointer"
                  >
                    {completedResults.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({formatDate(r.created_at, locale)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-navy" />
                </div>
                {currentBaseResult && (
                  <div className="flex items-center gap-3">
                    <Cover src={currentBaseResult.winner_track_image} alt={currentBaseResult.winner_track_title} size={40} />
                    <p className="flex-1 min-w-0 type-sub text-navy truncate">
                      {t.winnerPrefix} {currentBaseResult.winner_track_title} · {currentBaseResult.winner_track_artist}
                    </p>
                  </div>
                )}
                <p className="type-caption text-navy/70">{t.matchBaseDesc}</p>
              </section>

              {renderMateStrip(t.matesSameWinner, songMates, t.noMateSameWinner)}
              {renderMateStrip(t.matesSameArtist, artistMates, t.noMateSameArtist)}

              {/* 취향 싱크 높은 순 */}
              <section className="flex flex-col gap-1">
                <SectionTitle title={t.matesHighSync} count={highSyncMates.length} />
                {highSyncMates.length === 0 ? (
                  <p className="type-sub text-navy/70 mt-2">{t.noMateSync}</p>
                ) : (
                  <ul className="divide-y divide-navy/10">
                    {highSyncMates.map(({ result: mate, score }) => {
                      const name = displayNickname(mate.user_nickname, t.nicknameDefault);
                      return (
                        <li key={mate.id}>
                          <button
                            onClick={() => openMate(mate, score)}
                            className="w-full flex items-center gap-3 py-3 text-left cursor-pointer"
                          >
                            <Avatar src={mate.user_profile_image} alt={name} size={44} />
                            <div className="flex-1 min-w-0">
                              <p className="type-body-strong text-navy truncate">{name}</p>
                              <p className="type-sub text-navy/70 truncate">
                                {t.winnerPrefix} {mate.winner_track_title} · {mate.winner_track_artist}
                              </p>
                            </div>
                            <span className="type-title-2 font-num text-point-ink shrink-0">{score.toFixed(1)}%</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )
        )}
      </div>

      {/* 내 취향표 상세 */}
      <Sheet
        open={!!archiveDetail}
        onClose={() => setSelectedArchiveDetail(null)}
        closeLabel={t.close}
        header={
          archiveDetail && (
            <>
              <p className="type-caption text-navy/70">
                {formatDate(archiveDetail.created_at, locale)} · {modeLabel(archiveDetail)}
              </p>
              <h2 className="type-title-1 text-navy mt-0.5">{archiveDetail.title}</h2>
            </>
          )
        }
        footer={
          archiveDetail && (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => {
                  // 저장된 취향표 전용 화면으로 연다. 월드컵 결과 화면(/taste)을 재사용하면
                  // 불러올 때마다 자동 저장이 돌아 같은 취향표가 중복 저장됐다.
                  setSelectedArchiveDetail(null);
                  router.push(`/my-taste?id=${archiveDetail.id}`);
                }}
                className={`${primaryButton} w-full`}
              >
                {t.loadAndShare}
              </button>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 type-sub text-navy">
                  <Switch
                    checked={archiveDetail.is_public}
                    onChange={() => handleTogglePublic(archiveDetail.id, archiveDetail.is_public)}
                    label={t.publicSwitchLabel}
                  />
                  {archiveDetail.is_public ? t.publicLabel : t.privateLabel}
                </label>
                <button
                  onClick={() => setPendingDeleteId(archiveDetail.id)}
                  className="type-sub text-danger cursor-pointer"
                >
                  {t.deleteBtn}
                </button>
              </div>
            </div>
          )
        }
      >
        <RankList tracks={archiveTracks} />
      </Sheet>

      {/* 메이트 취향표 */}
      <Sheet
        open={!!selectedMateDetail}
        onClose={() => setSelectedMateDetail(null)}
        closeLabel={t.close}
        header={
          selectedMateDetail && (
            <div className="flex items-center gap-3">
              <Avatar
                src={selectedMateDetail.user_profile_image}
                alt={displayNickname(selectedMateDetail.user_nickname, t.nicknameDefault)}
                size={44}
              />
              <div className="min-w-0">
                <h2 className="type-title-2 text-navy truncate">
                  {t.mateRecordTitle.replace("{nickname}", displayNickname(selectedMateDetail.user_nickname, t.nicknameDefault))}
                </h2>
                <p className="type-caption text-navy/70">
                  {formatDate(selectedMateDetail.created_at, locale)}
                  {mateDetailJaccard !== null && (
                    <>
                      {" · "}
                      {t.syncLabel} <span className="font-num text-point-ink font-semibold">{mateDetailJaccard.toFixed(1)}%</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )
        }
      >
        <RankList tracks={mateTracks} />
      </Sheet>

      <ConfirmSheet
        open={!!pendingDeleteId}
        title={t.deleteConfirmTitle}
        desc={t.deleteConfirm}
        confirmLabel={t.deleteAction}
        cancelLabel={t.cancel}
        danger
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => pendingDeleteId && handleDeleteResult(pendingDeleteId)}
      />

      {/* Embedded Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        locale={locale}
        onSuccess={() => {
          setIsLoginModalOpen(false);
          // Reload page data after login success
          fetchData();
        }}
      />
    </main>
  );
}

