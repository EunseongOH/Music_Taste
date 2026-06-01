"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Calendar, Archive, Trash2, Heart, Award, Music, 
  User, Disc, ArrowLeft, Eye, EyeOff, Sparkles, MessageCircle, Link2
} from "lucide-react";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import LoginModal from "@/components/LoginModal";
import ProfileHeader from "@/components/ProfileHeader";

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

export default function ExploreTastePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"archive" | "social">("archive");
  const [completedResults, setCompletedResults] = useState<TournamentResult[]>([]);
  const [otherUsersResults, setOtherUsersResults] = useState<TournamentResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

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
      alert("공개 여부 변경에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  // Delete completed result
  const handleDeleteResult = async (resultId: string) => {
    const confirmDelete = window.confirm("정말 이 취향표 기록을 아카이브에서 완전히 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.");
    if (!confirmDelete) return;

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
      alert("성공적으로 삭제되었습니다.");
    } catch (err) {
      console.error("[ExploreTaste] Error deleting result:", err);
      alert("삭제에 실패했습니다. 다시 시도해 주세요.");
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

  // Jaccard similarity calculator: intersection / union
  const getJaccardSimilarity = (myResult: TournamentResult, otherResult: TournamentResult): number => {
    const myIds = getTop10Ids(myResult);
    const otherIds = getTop10Ids(otherResult);

    if (myIds.length === 0 || otherIds.length === 0) return 0;

    const mySet = new Set(myIds);
    const otherSet = new Set(otherIds);

    const intersection = new Set([...mySet].filter(x => otherSet.has(x)));
    const union = new Set([...mySet, ...otherSet]);

    return (intersection.size / union.size) * 100;
  };

  // Filter and process matches based on selected match criteria
  const getMatesData = () => {
    const baseResult = completedResults.find(r => r.id === selectedMatchBaseResultId);
    if (!baseResult) return { songMates: [], artistMates: [], highSyncMates: [] };

    const songMates: TournamentResult[] = [];
    const artistMates: TournamentResult[] = [];
    const highSyncMates: { result: TournamentResult; score: number }[] = [];

    otherUsersResults.forEach(other => {
      // 1. Same winner song mate
      if (other.winner_track_id === baseResult.winner_track_id) {
        songMates.push(other);
      }

      // 2. Same winner artist mate (avoid redundant song mate if possible or keep them categorized)
      if (
        other.winner_track_artist.toLowerCase().trim() === baseResult.winner_track_artist.toLowerCase().trim() &&
        other.winner_track_id !== baseResult.winner_track_id
      ) {
        artistMates.push(other);
      }

      // 3. High Jaccard Sync score
      const syncScore = getJaccardSimilarity(baseResult, other);
      if (syncScore > 0) {
        highSyncMates.push({ result: other, score: syncScore });
      }
    });

    // Sort high sync mates descending
    highSyncMates.sort((a, b) => b.score - a.score);

    return { songMates, artistMates, highSyncMates };
  };

  const { songMates, artistMates, highSyncMates } = getMatesData();
  const currentBaseResult = completedResults.find(r => r.id === selectedMatchBaseResultId);

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Background SVG Grain texture overlay */}
      <div className="bg-grain" />

      {/* Header Panel */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">내 취향 스페이스</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileHeader />
        </div>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
        {/* Banner Section */}
        <div className="p-6 text-center bg-gradient-to-b from-[#F5F2ED] via-[#F5F2ED]/70 to-transparent">
          <span className="inline-block px-3 py-1 bg-navy/5 text-navy font-bold font-sans text-[10px] uppercase tracking-wider rounded-full mb-2">
            My Taste Archiving Space
          </span>
          <h2 className="font-serif text-3xl text-navy tracking-tight leading-tight">취향 레코드 저장소</h2>
          <p className="font-sans text-xs text-charcoal/70 mt-1.5 px-4 leading-relaxed break-keep">
            내가 완료했던 LP 월드컵 순위와 결과를 안전하게 보관하고,<br />나와 음악 취향이 꼭 닮은 운명의 음악 소울메이트를 찾아보세요.
          </p>
        </div>

        {/* Tab Headers */}
        <div className="px-6 mb-6">
          <div className="flex bg-navy/5 p-1 rounded-2xl border border-navy/10">
            <button
              onClick={() => setActiveTab("archive")}
              className={`flex-1 py-3 text-center text-xs font-sans font-bold rounded-xl transition-all ${
                activeTab === "archive"
                  ? "bg-navy text-cream shadow-md"
                  : "text-navy/60 hover:text-navy"
              }`}
            >
              내 아카이브 ({isLoadingData ? "..." : completedResults.length})
            </button>
            <button
              onClick={() => setActiveTab("social")}
              className={`flex-1 py-3 text-center text-xs font-sans font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "social"
                  ? "bg-navy text-cream shadow-md"
                  : "text-navy/60 hover:text-navy"
              }`}
            >
              <Sparkles size={13} className={activeTab === "social" ? "text-point animate-pulse" : ""} />
              취향 매칭 피드
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingData && (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
            <Disc className="animate-spin text-point/85" size={32} />
            <p className="font-sans text-xs text-navy/60 font-medium">데이터를 안전하게 동기화 중...</p>
          </div>
        )}

        {/* Auth Required State for Guest users */}
        {!isLoadingData && !user && (
          <div className="mx-6 p-8 bg-white/60 border-[3px] border-navy rounded-[2rem] shadow-xl text-center flex flex-col items-center mt-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-point/5 rounded-full blur-2xl" />
            <div className="w-14 h-14 rounded-full border-[3px] border-navy flex items-center justify-center mb-4 mt-2 bg-point/5 shadow-[4px_4px_0_rgba(26,42,108,0.1)]">
              <Disc className="text-point animate-bounce" size={26} />
            </div>
            <h3 className="font-serif text-2xl text-navy font-bold mb-2">취향 잠금 해제</h3>
            <p className="font-sans text-charcoal/80 text-xs leading-relaxed mb-6 px-2 break-keep whitespace-pre-wrap">
              게스트 모드에서는 아카이브 저장 및 취향 매칭 피드를 이용하실 수 없습니다. 로그인하여 내 취향을 서버에 안전하게 저장하고 소울메이트를 찾아보세요!
            </p>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-full py-3.5 bg-navy text-cream font-bold text-sm rounded-xl hover:bg-navy/90 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,42,108,0.25)] cursor-pointer"
            >
              간편 로그인 및 회원가입
            </button>
          </div>
        )}

        {/* TAB 1: 내 아카이브 */}
        {!isLoadingData && user && activeTab === "archive" && (
          <div className="px-6 flex flex-col gap-4">
            {completedResults.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-navy/20 rounded-[2rem] px-6 bg-white/30">
                <Archive size={48} className="text-navy/20 mx-auto mb-4" />
                <h3 className="font-serif text-lg text-navy font-bold mb-1">비어있는 아카이브</h3>
                <p className="font-sans text-xs text-navy/50 leading-relaxed mb-6 px-4 break-keep">
                  아직 완료된 월드컵 결과가 없습니다. 홈 화면에서 LP 월드컵을 플레이하고 첫 취향 기록을 저장해보세요!
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="px-6 py-3 bg-navy text-cream font-bold text-xs rounded-full hover:bg-navy/90 active:scale-95 transition-all shadow-sm"
                >
                  LP 월드컵 플레이하러 가기
                </button>
              </div>
            ) : (
              completedResults.map((result) => {
                const isSingle = result.is_single_artist;
                const formattedDate = new Date(result.created_at).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <motion.div
                    key={result.id}
                    layoutId={`archive-card-${result.id}`}
                    className="w-full bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-5 shadow-sm hover:border-point hover:shadow-md transition-all flex flex-col gap-4 relative overflow-hidden group"
                  >
                    {/* Top title bar */}
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-sans text-[10px] text-charcoal/50 flex items-center gap-1">
                            <Calendar size={11} />
                            {formattedDate}
                          </span>
                          {isSingle && (
                            <span className="px-1.5 py-0.5 rounded-md bg-point/10 text-point font-sans font-bold text-[8px] tracking-tight shrink-0">
                              아티스트 싹쓸이
                            </span>
                          )}
                        </div>
                        <h4 className="font-serif text-base text-navy font-bold mt-0.5 leading-tight group-hover:text-point transition-colors">
                          {result.title}
                        </h4>
                      </div>

                      {/* Delete icon */}
                      <button
                        onClick={() => handleDeleteResult(result.id)}
                        className="p-2 rounded-full hover:bg-red-50 text-navy/40 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                        title="기록 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Winner track snippet */}
                    <div className="flex items-center gap-3 p-3 bg-white/60 rounded-2xl border border-navy/5">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-navy/10 shrink-0 shadow-sm bg-navy/5">
                        {result.winner_track_image ? (
                          <Image
                            src={result.winner_track_image}
                            alt={result.winner_track_title}
                            width={48}
                            height={48}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-navy/30">
                            <Music size={18} />
                          </div>
                        )}
                        {/* Little vinyl label overlay */}
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-cream border border-navy flex items-center justify-center">
                          <div className="w-1 h-1 rounded-full bg-navy" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 leading-tight">
                        <span className="font-sans font-bold text-[9px] uppercase tracking-wider text-point flex items-center gap-1">
                          <Award size={10} /> 1ST PLACE WINNER
                        </span>
                        <div className="font-sans font-bold text-xs text-navy truncate mt-0.5">
                          {result.winner_track_title}
                        </div>
                        <div className="font-sans text-[10px] text-navy/60 truncate mt-0.5">
                          {result.winner_track_artist}
                        </div>
                      </div>
                    </div>

                    {/* Bottom controls: Toggle Public & Detailed view */}
                    <div className="flex items-center justify-between border-t border-navy/10 pt-3 mt-1">
                      {/* Premium Visibility Selector Toggle */}
                      <div className="flex items-center gap-2 select-none">
                        <span className="font-sans font-bold text-[10px] text-navy">
                          {result.is_public ? "전체 공개 중" : "나만 보기"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTogglePublic(result.id, result.is_public)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            result.is_public ? "bg-point" : "bg-navy/20"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              result.is_public ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="text-[9px] text-charcoal/50 font-sans">
                          {result.is_public ? (
                            <Eye size={11} className="text-point inline" />
                          ) : (
                            <EyeOff size={11} className="inline" />
                          )}
                        </span>
                      </div>

                      {/* Detail button */}
                      <button
                        onClick={() => setSelectedArchiveDetail(result)}
                        className="py-1.5 px-3 bg-white border border-navy/20 rounded-xl font-sans font-bold text-[10px] text-navy hover:bg-navy/5 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        자세히 보기
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: 취향 매칭 피드 */}
        {!isLoadingData && user && activeTab === "social" && (
          <div className="px-6 flex flex-col gap-6">
            {completedResults.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-navy/20 rounded-[2rem] px-6 bg-white/30">
                <Sparkles size={48} className="text-point/40 mx-auto mb-4 animate-pulse" />
                <h3 className="font-serif text-lg text-navy font-bold mb-1">매칭 가이드</h3>
                <p className="font-sans text-xs text-navy/50 leading-relaxed mb-6 px-4 break-keep">
                  취향을 매칭하려면 본인의 음악 순위표(아카이브)가 적어도 1개 이상 존재해야 합니다. 지금 첫 LP 월드컵을 플레이하여 내 음악을 순위매겨보세요!
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="px-6 py-3 bg-navy text-cream font-bold text-xs rounded-full hover:bg-navy/90 active:scale-95 transition-all shadow-sm"
                >
                  첫 월드컵 시작하기
                </button>
              </div>
            ) : (
              <>
                {/* Match Base Criteria Selector */}
                <div className="bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-4 flex flex-col gap-2 shadow-sm">
                  <label className="font-sans text-xs font-bold text-navy flex items-center gap-1.5">
                    <Disc size={13} className="text-point animate-spin" style={{ animationDuration: "3s" }} />
                    매칭 기준 취향표 선택
                  </label>
                  <select
                    value={selectedMatchBaseResultId}
                    onChange={(e) => setSelectedMatchBaseResultId(e.target.value)}
                    className="w-full py-3 px-4 bg-white border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point font-sans text-xs text-navy font-bold"
                  >
                    {completedResults.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({new Date(r.created_at).toLocaleDateString("ko-KR")})
                      </option>
                    ))}
                  </select>
                  <p className="font-sans text-[9px] text-charcoal/50 leading-none mt-1">
                    선택한 취향표의 1위 곡, 아티스트 및 Top 10을 기준으로 소울메이트를 탐색합니다.
                  </p>
                </div>

                {/* Match Summary Indicator */}
                {currentBaseResult && (
                  <div className="px-1 py-1 flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full border border-navy/20 overflow-hidden relative shrink-0 shadow-sm">
                      <Image
                        src={currentBaseResult.winner_track_image || "https://picsum.photos/seed/music/50/50"}
                        alt="Current Base"
                        width={40}
                        height={40}
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div className="flex-1 leading-tight min-w-0">
                      <span className="font-sans font-bold text-[8px] text-point uppercase tracking-wider">나의 기준 1위</span>
                      <div className="font-sans font-bold text-xs text-navy truncate mt-0.5">
                        {currentBaseResult.winner_track_title}
                      </div>
                      <div className="font-sans text-[10px] text-navy/60 truncate mt-0.5">
                        {currentBaseResult.winner_track_artist}
                      </div>
                    </div>
                  </div>
                )}

                {/* Category 1: 1위 곡이 같은 메이트 */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-serif text-lg text-navy font-bold flex items-center gap-1.5 border-b border-navy/10 pb-1.5">
                    <span>🎧</span> 1위 곡이 같은 메이트
                    <span className="font-sans font-bold text-xs bg-navy text-cream px-2 py-0.5 rounded-full shrink-0 ml-1">
                      {songMates.length}
                    </span>
                  </h3>

                  {songMates.length === 0 ? (
                    <div className="py-8 text-center bg-white/20 border border-dashed border-navy/10 rounded-2xl px-4">
                      <p className="font-sans text-xs text-navy/40">
                        아직 나와 1위 최애 곡이 일치하는 이용자가 발견되지 않았습니다.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto py-1 scrollbar-none snap-x snap-mandatory">
                      {songMates.map((mate) => (
                        <div
                          key={mate.id}
                          onClick={() => {
                            setSelectedMateDetail(mate);
                            if (currentBaseResult) {
                              setMateDetailJaccard(getJaccardSimilarity(currentBaseResult, mate));
                            }
                          }}
                          className="w-[180px] shrink-0 snap-start bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-4 flex flex-col items-center text-center cursor-pointer hover:border-point hover:shadow-md transition-all relative overflow-hidden group select-none"
                        >
                          <div className="absolute top-0 inset-x-0 h-1 bg-point/80" />
                          {/* User Avatar */}
                          <div className="relative w-16 h-16 rounded-full border-2 border-navy overflow-hidden bg-white shadow-sm mt-1 group-hover:scale-105 transition-transform duration-300">
                            <Image
                              src={mate.user_profile_image || "https://picsum.photos/seed/user/80/80"}
                              alt={mate.user_nickname}
                              width={64}
                              height={64}
                              className="object-cover w-full h-full"
                            />
                            {/* Glowing Vinyl center */}
                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Disc className="text-cream animate-spin" size={16} />
                            </div>
                          </div>
                          <span className="font-serif text-sm text-navy font-bold truncate w-full mt-3">
                            {mate.user_nickname}
                          </span>
                          <span className="font-sans text-[9px] text-charcoal/50 leading-none mt-1">
                            {new Date(mate.created_at).toLocaleDateString("ko-KR")}
                          </span>
                          <div className="mt-3.5 bg-point/10 text-point px-2 py-1 rounded-xl text-[9px] font-sans font-bold w-full truncate border border-point/15">
                            같은 1위: {mate.winner_track_title}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category 2: 1위 아티스트가 같은 메이트 */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-serif text-lg text-navy font-bold flex items-center gap-1.5 border-b border-navy/10 pb-1.5">
                    <span>✨</span> 1위 아티스트가 같은 메이트
                    <span className="font-sans font-bold text-xs bg-navy text-cream px-2 py-0.5 rounded-full shrink-0 ml-1">
                      {artistMates.length}
                    </span>
                  </h3>

                  {artistMates.length === 0 ? (
                    <div className="py-8 text-center bg-white/20 border border-dashed border-navy/10 rounded-2xl px-4">
                      <p className="font-sans text-xs text-navy/40">
                        나의 최애 아티스트와 일치하는 아티스트 메이트가 발견되지 않았습니다.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto py-1 scrollbar-none snap-x snap-mandatory">
                      {artistMates.map((mate) => (
                        <div
                          key={mate.id}
                          onClick={() => {
                            setSelectedMateDetail(mate);
                            if (currentBaseResult) {
                              setMateDetailJaccard(getJaccardSimilarity(currentBaseResult, mate));
                            }
                          }}
                          className="w-[180px] shrink-0 snap-start bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-4 flex flex-col items-center text-center cursor-pointer hover:border-point hover:shadow-md transition-all relative overflow-hidden group select-none"
                        >
                          <div className="absolute top-0 inset-x-0 h-1 bg-navy/80" />
                          {/* User Avatar */}
                          <div className="relative w-16 h-16 rounded-full border-2 border-navy overflow-hidden bg-white shadow-sm mt-1 group-hover:scale-105 transition-transform duration-300">
                            <Image
                              src={mate.user_profile_image || "https://picsum.photos/seed/user/80/80"}
                              alt={mate.user_nickname}
                              width={64}
                              height={64}
                              className="object-cover w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Disc className="text-cream animate-spin" size={16} />
                            </div>
                          </div>
                          <span className="font-serif text-sm text-navy font-bold truncate w-full mt-3">
                            {mate.user_nickname}
                          </span>
                          <span className="font-sans text-[9px] text-charcoal/50 leading-none mt-1">
                            {new Date(mate.created_at).toLocaleDateString("ko-KR")}
                          </span>
                          <div className="mt-3.5 bg-navy/5 text-navy px-2 py-1 rounded-xl text-[9px] font-sans font-bold w-full truncate border border-navy/10">
                            최애: {mate.winner_track_artist}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category 3: 취향 싱크로율 높은 메이트 */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-serif text-lg text-navy font-bold flex items-center gap-1.5 border-b border-navy/10 pb-1.5">
                    <span>💖</span> 취향 싱크로율 높은 메이트
                    <span className="font-sans font-bold text-xs bg-navy text-cream px-2 py-0.5 rounded-full shrink-0 ml-1">
                      {highSyncMates.length}
                    </span>
                  </h3>

                  {highSyncMates.length === 0 ? (
                    <div className="py-8 text-center bg-white/20 border border-dashed border-navy/10 rounded-2xl px-4">
                      <p className="font-sans text-xs text-navy/40">
                        나와 상위 10곡의 유사성(싱크로율)이 겹치는 메이트가 없습니다.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {highSyncMates.map(({ result: mate, score }) => (
                        <div
                          key={mate.id}
                          onClick={() => {
                            setSelectedMateDetail(mate);
                            setMateDetailJaccard(score);
                          }}
                          className="w-full bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-4 flex items-center justify-between cursor-pointer hover:border-point hover:shadow-md transition-all group select-none shadow-sm"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Avatar */}
                            <div className="relative w-12 h-12 rounded-full border-2 border-navy overflow-hidden bg-white shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-300">
                              <Image
                                src={mate.user_profile_image || "https://picsum.photos/seed/user/80/80"}
                                alt={mate.user_nickname}
                                width={48}
                                height={48}
                                className="object-cover w-full h-full"
                              />
                            </div>
                            <div className="leading-tight min-w-0 text-left">
                              <h4 className="font-serif text-sm text-navy font-bold truncate">
                                {mate.user_nickname}
                              </h4>
                              <p className="font-sans text-[10px] text-charcoal/50 mt-0.5 truncate">
                                1위: {mate.winner_track_title} - {mate.winner_track_artist}
                              </p>
                            </div>
                          </div>

                          {/* Sync score badge */}
                          <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className="font-serif text-[10px] uppercase text-point font-bold tracking-widest leading-none">TASTE SYNC</span>
                            <span className="font-sans font-bold text-lg text-navy mt-1 leading-none">
                              {score.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL 1: 내 아카이브 상세 보기 */}
      <AnimatePresence>
        {selectedArchiveDetail && (() => {
          const tracks = getNormalizedTracks(selectedArchiveDetail);
          const formattedDetailDate = new Date(selectedArchiveDetail.created_at).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });

          return (
            <>
              <motion.div
                className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedArchiveDetail(null)}
              />
              <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 pointer-events-none">
                <motion.div
                  className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-6 shadow-2xl relative pointer-events-auto flex flex-col"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                >
                  <button
                    onClick={() => setSelectedArchiveDetail(null)}
                    className="absolute top-5 right-5 text-navy hover:text-point transition-colors bg-navy/5 p-1.5 rounded-full cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>

                  <div className="flex flex-col mb-4">
                    <span className="font-sans text-[10px] text-charcoal/50 leading-none">
                      {formattedDetailDate}
                    </span>
                    <h3 className="font-serif text-xl text-navy font-bold mt-1 pr-8 leading-tight">
                      {selectedArchiveDetail.title}
                    </h3>
                  </div>

                  {/* Track Rankings list inside scrollable panel */}
                  <div className="w-full overflow-y-auto max-h-[300px] flex flex-col gap-2.5 pr-1 scrollbar-thin">
                    {tracks.map((track, idx) => (
                      <div key={track.id || idx} className="flex items-center gap-3 p-2 bg-white/60 border border-navy/10 rounded-2xl relative">
                        {/* Rank Badge */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-sans font-bold text-[10px] shrink-0 shadow-sm
                          ${idx === 0 
                            ? "bg-point text-cream" 
                            : idx === 1 || idx === 2 
                            ? "bg-navy text-cream" 
                            : "bg-navy/5 text-navy"
                          }
                        `}>
                          {idx + 1}
                        </div>
                        {track.albumImage && (
                          <div className="w-9 h-9 rounded-lg overflow-hidden relative shrink-0 border border-navy/10">
                            <Image
                              src={track.albumImage}
                              alt={track.title}
                              width={36}
                              height={36}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 leading-tight text-left">
                          <div className="font-sans font-bold text-xs text-navy truncate">
                            {track.title}
                          </div>
                          <div className="font-sans text-[10px] text-navy/60 truncate mt-0.5">
                            {track.artistName}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA actions */}
                  <div className="flex gap-2 w-full mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem("worldcup_ranking", JSON.stringify(tracks));
                        sessionStorage.setItem("selectedArtists", JSON.stringify([{
                          id: selectedArchiveDetail.artist_id || "",
                          name: selectedArchiveDetail.artist_name || trackArtistExtract(tracks)
                        }]));
                        setSelectedArchiveDetail(null);
                        router.push(`/taste?mode=${selectedArchiveDetail.is_single_artist ? "single" : "multi"}`);
                      }}
                      className="w-full py-3.5 bg-navy text-cream font-bold text-xs rounded-xl hover:bg-navy/90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Disc size={13} className="animate-spin" style={{ animationDuration: "5s" }} />
                      이 취향표 불러오기 & 공유하기
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* DETAIL MODAL 2: 메이트 취향 리스트 보기 */}
      <AnimatePresence>
        {selectedMateDetail && (() => {
          const tracks = getNormalizedTracks(selectedMateDetail);
          const formattedDate = new Date(selectedMateDetail.created_at).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          });

          return (
            <>
              <motion.div
                className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedMateDetail(null)}
              />
              <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 pointer-events-none">
                <motion.div
                  className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-6 shadow-2xl relative pointer-events-auto flex flex-col"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                >
                  <button
                    onClick={() => setSelectedMateDetail(null)}
                    className="absolute top-5 right-5 text-navy hover:text-point transition-colors bg-navy/5 p-1.5 rounded-full cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>

                  <div className="flex items-center gap-3.5 mb-4 pr-6">
                    <div className="relative w-12 h-12 rounded-full border-2 border-navy overflow-hidden bg-white shrink-0 shadow-sm">
                      <Image
                        src={selectedMateDetail.user_profile_image || "https://picsum.photos/seed/user/80/80"}
                        alt={selectedMateDetail.user_nickname}
                        width={48}
                        height={48}
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div className="leading-tight min-w-0 text-left">
                      <span className="font-sans text-[9px] text-charcoal/50 leading-none">
                        {formattedDate} • 메이트 취향 리스트
                      </span>
                      <h3 className="font-serif text-lg text-navy font-bold truncate mt-0.5">
                        {selectedMateDetail.user_nickname}님의 LP 레코드
                      </h3>
                    </div>
                  </div>

                  {/* Sync status card snippet if base exists */}
                  {mateDetailJaccard !== null && (
                    <div className="p-3 bg-point/5 border border-point/15 rounded-2xl mb-4 flex items-center justify-between text-left">
                      <div className="flex items-center gap-1.5 text-point">
                        <Sparkles size={14} className="animate-pulse" />
                        <span className="font-sans font-bold text-xs">나와의 취향 매칭 싱크</span>
                      </div>
                      <span className="font-sans font-bold text-sm text-navy bg-white px-2 py-0.5 rounded-lg border border-navy/10">
                        {mateDetailJaccard.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {/* Track Rankings */}
                  <div className="w-full overflow-y-auto max-h-[250px] flex flex-col gap-2.5 pr-1 scrollbar-thin">
                    {tracks.map((track, idx) => (
                      <div key={track.id || idx} className="flex items-center gap-3 p-2 bg-white/60 border border-navy/10 rounded-2xl relative">
                        {/* Rank Badge */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-sans font-bold text-[10px] shrink-0 shadow-sm
                          ${idx === 0 
                            ? "bg-point text-cream" 
                            : idx === 1 || idx === 2 
                            ? "bg-navy text-cream" 
                            : "bg-navy/5 text-navy"
                          }
                        `}>
                          {idx + 1}
                        </div>
                        {track.albumImage && (
                          <div className="w-9 h-9 rounded-lg overflow-hidden relative shrink-0 border border-navy/10">
                            <Image
                              src={track.albumImage}
                              alt={track.title}
                              width={36}
                              height={36}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 leading-tight text-left">
                          <div className="font-sans font-bold text-xs text-navy truncate">
                            {track.title}
                          </div>
                          <div className="font-sans text-[10px] text-navy/60 truncate mt-0.5">
                            {track.artistName}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Spotify mimic button or just close */}
                  <div className="flex gap-2 w-full mt-5">
                    <button
                      onClick={() => {
                        setSelectedMateDetail(null);
                        alert("소울메이트의 취향이 아카이브에 영감을 주었습니다!");
                      }}
                      className="w-full py-3 bg-navy text-cream font-bold text-xs rounded-xl hover:bg-navy/90 active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      아름다운 취향 감상 완료
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* Embedded Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          setIsLoginModalOpen(false);
          // Reload page data after login success
          fetchData();
        }}
      />
    </main>
  );
}

// Extra helper extraction of artist names from tracks array
function trackArtistExtract(tracks: Track[]): string {
  if (tracks.length === 0) return "";
  const first = tracks[0];
  return first.artistName || first.a || "";
}
