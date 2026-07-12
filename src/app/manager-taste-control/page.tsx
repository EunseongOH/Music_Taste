"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Check, X, Disc, ExternalLink, Clock, Music, Video,
  ChevronLeft, FileText, Sparkles, LayoutDashboard,
  ListMusic, BookOpen, History, Shield,
  AlertCircle, Loader2
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchPendingUnreleasedTracks,
  approveUnreleasedTrack,
  rejectUnreleasedTrack,
  fetchApprovedUnreleasedTracksForAdmin,
  markTrackReleased,
  fetchAllReleasedUnreleasedTracks,
  fetchPendingLyricSuggestions,
  approveLyricSuggestion,
  rejectLyricSuggestion
} from "@/utils/unreleasedDb";
import { getSafeLocale } from "@/utils/storage";

interface PendingTrack {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  video_url: string | null;
  release_date: string | null;
  created_at: string;
  user_id: string;
  release_reported?: boolean;
}

interface PendingLyricSuggestion {
  id: string;
  track_id: string;
  lyrics: string | null;
  lyrics_fanchant: string | null;
  user_id: string;
  user_nickname: string | null;
  is_approved: boolean;
  created_at: string;
  unreleased_tracks: {
    title: string;
    artist_name: string;
    lyrics: string | null;
    lyrics_fanchant: string | null;
  };
}

type NavSection = "tracks" | "lyrics" | "manage" | "history";

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<NavSection>("tracks");
  const [tracks, setTracks] = useState<PendingTrack[]>([]);
  const [lyricsSuggestions, setLyricsSuggestions] = useState<PendingLyricSuggestion[]>([]);
  const [manageTracks, setManageTracks] = useState<PendingTrack[]>([]);
  const [releasedHistory, setReleasedHistory] = useState<PendingTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getSafeLocale());
    }
  }, []);

  const t = {
    ko: {
      checkAuth: "권한을 확인하고 있어요...",
      loadError: "데이터를 불러오는 데 실패했어요.",
      homeBtn: "홈으로",
      adminPortal: "ADMIN PORTAL",
      adminTitle: "관리자 대시보드",
      adminSubtitle: "Music Taste 서비스 관리 센터",
      navTracks: "미발매곡 등록 요청",
      navLyrics: "가사 수정 요청",
      navManage: "미발매곡 상태 관리",
      navHistory: "공식 발매 완료 목록",
      unreleased: "미발매곡",
      submittedDate: "신청일",
      performedDate: "공연일",
      previewLabel: "공연 영상 프리뷰",
      viewOnYoutube: "유튜브에서 보기",
      nonStandardLink: "비표준 유튜브 링크",
      goBtn: "이동하기",
      rejectBtn: "거절 및 삭제",
      approveBtn: "승인하기",
      rejectConfirm: "정말로 '{title}' 곡 등록 요청을 거절하고 삭제할까요?",
      approveSuccess: "'{title}' 곡을 성공적으로 승인했어요! 🎉",
      approveError: "곡 승인에 실패했어요. 다시 시도해 주세요.",
      rejectSuccess: "'{title}' 곡 등록 요청을 거절했어요.",
      rejectError: "요청 거절에 실패했어요. 다시 시도해 주세요.",
      noPendingTitle: "승인 대기 중인 곡이 없어요",
      noPendingDesc: "이용자들이 추가한 미발매곡 요청을 모두 처리했어요.\n평화롭고 아늑한 시간이에요. 🏖️",
      noManageTitle: "관리할 미발매곡이 없어요",
      noManageDesc: "승인 완료된 미발매곡이 아직 등록되지 않았습니다.",
      markReleasedBtn: "공식 발매 완료로 변경",
      reportedBadge: "공식 발매 제보됨",
      markReleasedConfirm: "정말로 '{title}' 곡을 공식 발매 완료 상태로 전환하시겠습니까?\n이 작업은 되돌릴 수 없으며 유저의 미발매곡 목록에서 숨겨집니다.",
      markReleasedSuccess: "'{title}' 곡을 성공적으로 공식 발매 완료 처리했습니다! 🎉",
      markReleasedError: "발매 전환 처리에 실패했습니다. 다시 시도해 주세요.",
      tabHistory: "공식 발매 완료 목록",
      noHistoryTitle: "발매 전환된 곡이 없어요",
      noHistoryDesc: "미발매곡에서 공식 발매로 전환된 이력이 없습니다.",
      releasedBadge: "공식 발매 완료",
      tabLyrics: "가사 수정 요청",
      noPendingLyricsTitle: "승인 대기 중인 가사가 없어요",
      noPendingLyricsDesc: "이용자들이 기여한 모든 가사 수정 건을 확인 완료했어요.\n기분 좋은 여유를 즐겨보세요! ☕",
      currentLyrics: "현재 아카이브 가사",
      proposedLyrics: "기여 제안된 가사",
      lyricsTypeLabel: "기여 구분",
      lyricsTypePlain: "일반 가사",
      lyricsTypeFanchant: "떼창 / 응원법 가사",
      noCurrentLyrics: "(기존 가사 내용 없음)",
      approveLyricSuccess: "'{title}' 곡의 가사 수정안을 최종 승인했어요! 💖",
      approveLyricError: "가사 승인 처리에 실패했습니다.",
      rejectLyricConfirm: "정말로 '{title}' 곡의 가사 수정 제안을 거절하시겠습니까?",
      rejectLyricSuccess: "가사 기여 제안을 거절했습니다.",
      rejectLyricError: "제안 거절 처리에 실패했습니다.",
      loadingQueue: "대기열을 불러오고 있어요...",
    },
    en: {
      checkAuth: "Checking permissions...",
      loadError: "Failed to load data.",
      homeBtn: "Home",
      adminPortal: "ADMIN PORTAL",
      adminTitle: "Admin Dashboard",
      adminSubtitle: "Music Taste Service Management Center",
      navTracks: "Song Requests",
      navLyrics: "Lyrics Edits",
      navManage: "Manage Tracks",
      navHistory: "Released History",
      unreleased: "Unreleased",
      submittedDate: "Submitted",
      performedDate: "Performed",
      previewLabel: "Performance Video Preview",
      viewOnYoutube: "View on YouTube",
      nonStandardLink: "Non-standard YouTube link",
      goBtn: "Go",
      rejectBtn: "Reject & Delete",
      approveBtn: "Approve",
      rejectConfirm: "Are you sure you want to reject and delete '{title}'?",
      approveSuccess: "Successfully approved '{title}'! 🎉",
      approveError: "Failed to approve track. Please try again.",
      rejectSuccess: "Rejected '{title}' request.",
      rejectError: "Failed to reject request. Please try again.",
      noPendingTitle: "No pending tracks",
      noPendingDesc: "All user requests have been processed.\nHave a peaceful time! 🏖️",
      noManageTitle: "No tracks to manage",
      noManageDesc: "No approved unreleased tracks are currently in the database.",
      markReleasedBtn: "Mark as Officially Released",
      reportedBadge: "Reported as Released",
      markReleasedConfirm: "Are you sure you want to mark '{title}' as officially released?\nThis will hide the track from the unreleased songs list.",
      markReleasedSuccess: "Successfully marked '{title}' as officially released! 🎉",
      markReleasedError: "Failed to mark track as released. Please try again.",
      tabHistory: "Released History",
      noHistoryTitle: "No released history",
      noHistoryDesc: "No tracks have been transitioned to officially released yet.",
      releasedBadge: "Officially Released",
      tabLyrics: "Lyrics Edits",
      noPendingLyricsTitle: "No pending lyric edits",
      noPendingLyricsDesc: "All lyric edits submitted by fans have been reviewed.\nTime for a short coffee break! ☕",
      currentLyrics: "Current Archived Lyrics",
      proposedLyrics: "Suggested Lyrics",
      lyricsTypeLabel: "Contribution Type",
      lyricsTypePlain: "Plain Lyrics",
      lyricsTypeFanchant: "Fanchant Lyrics",
      noCurrentLyrics: "(No existing lyrics content)",
      approveLyricSuccess: "Successfully approved lyrics for '{title}'! 💖",
      approveLyricError: "Failed to approve lyrics suggestion.",
      rejectLyricConfirm: "Are you sure you want to reject the lyric suggestion for '{title}'?",
      rejectLyricSuccess: "Rejected lyric suggestion.",
      rejectLyricError: "Failed to reject suggestion.",
      loadingQueue: "Loading queue...",
    }
  }[locale];

  useEffect(() => {
    if (authLoading) return;
    const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
    if (!user || !isAdmin) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
    if (!user || !isAdmin) return;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        if (activeSection === "tracks") {
          const data = await fetchPendingUnreleasedTracks();
          setTracks(data as PendingTrack[]);
        } else if (activeSection === "lyrics") {
          const data = await fetchPendingLyricSuggestions();
          setLyricsSuggestions(data as PendingLyricSuggestion[]);
        } else if (activeSection === "manage") {
          const data = await fetchApprovedUnreleasedTracksForAdmin();
          setManageTracks(data as PendingTrack[]);
        } else if (activeSection === "history") {
          const data = await fetchAllReleasedUnreleasedTracks();
          setReleasedHistory(data as PendingTrack[]);
        }
      } catch (err: any) {
        setError(t.loadError);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user, authLoading, activeSection, locale]);

  const showToast = (text: string, type: "success" | "error") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async (trackId: string, title: string) => {
    try {
      await approveUnreleasedTrack(trackId);
      setTracks(prev => prev.filter(t => t.id !== trackId));
      showToast(t.approveSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.approveError, "error");
    }
  };

  const handleReject = async (trackId: string, title: string) => {
    if (!window.confirm(t.rejectConfirm.replace("{title}", title))) return;
    try {
      await rejectUnreleasedTrack(trackId);
      setTracks(prev => prev.filter(t => t.id !== trackId));
      showToast(t.rejectSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.rejectError, "error");
    }
  };

  const handleMarkReleased = async (trackId: string, title: string) => {
    if (!window.confirm(t.markReleasedConfirm.replace("{title}", title))) return;
    try {
      await markTrackReleased(trackId);
      setManageTracks(prev => prev.filter(t => t.id !== trackId));
      showToast(t.markReleasedSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.markReleasedError, "error");
    }
  };

  const handleApproveLyric = async (suggestion: PendingLyricSuggestion) => {
    const title = suggestion.unreleased_tracks?.title || "Unknown Track";
    try {
      await approveLyricSuggestion(
        suggestion.id,
        suggestion.track_id,
        suggestion.lyrics,
        suggestion.lyrics_fanchant
      );
      setLyricsSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      showToast(t.approveLyricSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.approveLyricError, "error");
    }
  };

  const handleRejectLyric = async (suggestion: PendingLyricSuggestion) => {
    const title = suggestion.unreleased_tracks?.title || "Unknown Track";
    if (!window.confirm(t.rejectLyricConfirm.replace("{title}", title))) return;
    try {
      await rejectLyricSuggestion(suggestion.id);
      setLyricsSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      showToast(t.rejectLyricSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.rejectLyricError, "error");
    }
  };

  const renderFanchantPreviewInAdmin = (text: string) => {
    if (!text) return <span className="text-charcoal/40 italic">{t.noCurrentLyrics}</span>;
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const parts: { text: string; isFanchant: boolean }[] = [];
      let currentIdx = 0;
      const regex = /\[([^\]]+)\]/g;
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match.index > currentIdx) {
          parts.push({ text: line.substring(currentIdx, match.index), isFanchant: false });
        }
        parts.push({ text: match[1], isFanchant: true });
        currentIdx = regex.lastIndex;
      }
      if (currentIdx < line.length) {
        parts.push({ text: line.substring(currentIdx), isFanchant: false });
      }
      return (
        <div key={lineIdx} className="min-h-[1.2rem] leading-relaxed">
          {parts.length === 0 ? (
            <span className="opacity-0"> </span>
          ) : (
            parts.map((part, partIdx) => (
              <span
                key={partIdx}
                className={
                  part.isFanchant
                    ? "text-point font-bold bg-point/10 px-0.5 rounded border border-point/20 mx-0.5"
                    : "text-charcoal/95"
                }
              >
                {part.text}
              </span>
            ))
          )}
        </div>
      );
    });
  };

  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) { return dateStr; }
  };

  if (authLoading) {
    return (
      <main className="flex flex-col min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="mb-6 text-point opacity-80"
        >
          <Disc size={56} strokeWidth={1} />
        </motion.div>
        <p className="font-sans text-sm text-navy/60 font-medium">{t.checkAuth}</p>
      </main>
    );
  }

  const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
  if (!user || !isAdmin) return null;

  const navItems: { id: NavSection; icon: React.ReactNode; label: string; count?: number }[] = [
    { id: "tracks",  icon: <ListMusic size={18} />,  label: t.navTracks,  count: activeSection === "tracks"  ? tracks.length            : undefined },
    { id: "lyrics",  icon: <BookOpen size={18} />,   label: t.navLyrics,  count: activeSection === "lyrics"  ? lyricsSuggestions.length : undefined },
    { id: "manage",  icon: <FileText size={18} />,   label: t.navManage,  count: activeSection === "manage"  ? manageTracks.length       : undefined },
    { id: "history", icon: <History size={18} />,    label: t.navHistory, count: activeSection === "history" ? releasedHistory.length    : undefined },
  ];

  const cardVariants = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: -8 },
  };

  const YoutubePreview = ({ video_url, title }: { video_url: string; title: string }) => {
    const youtubeId = getYouTubeVideoId(video_url);
    return (
      <div className="w-full flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between font-sans text-xs font-semibold text-navy/70 ml-1">
          <span className="flex items-center gap-1">
            <Video size={13} className="text-red-500" />
            {t.previewLabel}
          </span>
          <a href={video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-point hover:underline">
            {t.viewOnYoutube}
            <ExternalLink size={10} />
          </a>
        </div>
        {youtubeId ? (
          <div className="w-full aspect-video rounded-2xl overflow-hidden border border-navy/10 shadow-inner bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="w-full p-4 bg-navy/5 rounded-2xl border border-navy/10 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <p className="font-sans text-xs font-semibold text-navy">{t.nonStandardLink}</p>
              <p className="font-sans text-[11px] text-charcoal/60 truncate max-w-[240px] sm:max-w-[400px]">{video_url}</p>
            </div>
            <a href={video_url} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 bg-navy text-cream rounded-full font-sans text-xs font-bold hover:bg-navy/90 shrink-0">
              {t.goBtn}
            </a>
          </div>
        )}
      </div>
    );
  };

  const EmptyState = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-20 px-6 text-center border-2 border-dashed border-navy/12 rounded-3xl bg-white/30 flex flex-col items-center gap-4"
    >
      <div className="w-14 h-14 bg-cream rounded-2xl flex items-center justify-center text-point border border-navy/8 shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-serif text-lg text-navy mb-1 font-bold">{title}</h3>
        <p className="font-sans text-xs text-charcoal/55 leading-relaxed whitespace-pre-wrap">{desc}</p>
      </div>
    </motion.div>
  );

  const renderTracksSection = () => (
    tracks.length === 0
      ? <EmptyState icon={<Music size={26} />} title={t.noPendingTitle} desc={t.noPendingDesc} />
      : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {tracks.map((track) => (
              <motion.div
                key={track.id}
                layout
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="bg-white/75 border border-navy/10 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-navy/20 transition-all flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 text-left">
                    <span className="font-sans text-[10px] font-bold text-point uppercase tracking-wider bg-point/10 px-2 py-0.5 rounded-full w-fit mb-1">
                      {t.unreleased}
                    </span>
                    <h2 className="font-serif text-xl text-navy font-bold leading-tight">{track.title}</h2>
                    <p className="font-sans text-sm text-charcoal/75 font-semibold">{track.artist_name}</p>
                    <div className="flex items-center gap-1.5 mt-1 font-sans text-xs text-charcoal/45">
                      <Clock size={11} />
                      <span>{t.submittedDate}: {formatDate(track.created_at)}</span>
                      {track.release_date && (
                        <>
                          <span className="text-navy/20">•</span>
                          <span>{t.performedDate}: {track.release_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-cream border border-navy/8 flex items-center justify-center shrink-0">
                    <Music size={20} className="text-navy/45 animate-pulse" />
                  </div>
                </div>
                {track.video_url && <YoutubePreview video_url={track.video_url} title={track.title} />}
                <div className="flex gap-2.5 border-t border-navy/6 pt-4">
                  <button
                    onClick={() => handleReject(track.id, track.title)}
                    className="flex-1 py-2.5 bg-red-50 hover:bg-red-100/70 text-red-600 border border-red-200/50 font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <X size={15} strokeWidth={2.5} />
                    {t.rejectBtn}
                  </button>
                  <button
                    onClick={() => handleApprove(track.id, track.title)}
                    className="flex-[1.5] py-2.5 bg-navy hover:bg-navy/90 text-cream font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-navy/15"
                  >
                    <Check size={15} strokeWidth={2.5} className="text-point" />
                    {t.approveBtn}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )
  );

  const renderLyricsSection = () => (
    lyricsSuggestions.length === 0
      ? <EmptyState icon={<BookOpen size={26} />} title={t.noPendingLyricsTitle} desc={t.noPendingLyricsDesc} />
      : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {lyricsSuggestions.map((suggestion) => {
              const isPlain = !!suggestion.lyrics;
              const currentLyrics = isPlain
                ? suggestion.unreleased_tracks?.lyrics
                : suggestion.unreleased_tracks?.lyrics_fanchant;
              const proposedLyrics = isPlain ? suggestion.lyrics : suggestion.lyrics_fanchant;
              return (
                <motion.div
                  key={suggestion.id}
                  layout
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="bg-white/75 border border-navy/10 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-sans text-[10px] font-bold text-navy/55 uppercase tracking-wider bg-navy/6 px-2 py-0.5 rounded-full">
                          {t.lyricsTypeLabel}
                        </span>
                        <span className="font-sans text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-point/15 text-point">
                          {isPlain ? t.lyricsTypePlain : t.lyricsTypeFanchant}
                        </span>
                      </div>
                      <h2 className="font-serif text-xl text-navy font-bold leading-tight">
                        {suggestion.unreleased_tracks?.title}
                      </h2>
                      <p className="font-sans text-sm text-charcoal/75 font-semibold">
                        {suggestion.unreleased_tracks?.artist_name}
                      </p>
                      {suggestion.user_nickname && (
                        <p className="font-sans text-xs text-charcoal/45 mt-0.5">
                          by {suggestion.user_nickname}
                        </p>
                      )}
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-cream border border-navy/8 flex items-center justify-center shrink-0">
                      <Sparkles size={20} className="text-point" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <p className="font-sans text-[11px] font-bold text-charcoal/50 uppercase tracking-wider">{t.currentLyrics}</p>
                      <div className="p-3.5 bg-navy/[0.03] border border-navy/8 rounded-2xl font-sans text-xs text-charcoal/80 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {currentLyrics
                          ? (isPlain ? currentLyrics : renderFanchantPreviewInAdmin(currentLyrics))
                          : <span className="text-charcoal/35 italic">{t.noCurrentLyrics}</span>
                        }
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="font-sans text-[11px] font-bold text-point/70 uppercase tracking-wider">{t.proposedLyrics}</p>
                      <div className="p-3.5 bg-point/[0.04] border border-point/20 rounded-2xl font-sans text-xs text-charcoal/80 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {proposedLyrics
                          ? (isPlain ? proposedLyrics : renderFanchantPreviewInAdmin(proposedLyrics))
                          : <span className="text-charcoal/35 italic">{t.noCurrentLyrics}</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2.5 border-t border-navy/6 pt-4">
                    <button
                      onClick={() => handleRejectLyric(suggestion)}
                      className="flex-1 py-2.5 bg-red-50 hover:bg-red-100/70 text-red-600 border border-red-200/50 font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <X size={15} strokeWidth={2.5} />
                      {t.rejectBtn}
                    </button>
                    <button
                      onClick={() => handleApproveLyric(suggestion)}
                      className="flex-[1.5] py-2.5 bg-navy hover:bg-navy/90 text-cream font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-navy/15"
                    >
                      <Check size={15} strokeWidth={2.5} className="text-point" />
                      {t.approveBtn}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )
  );

  const renderManageSection = () => (
    manageTracks.length === 0
      ? <EmptyState icon={<FileText size={26} />} title={t.noManageTitle} desc={t.noManageDesc} />
      : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {manageTracks.map((track) => {
              const isReported = track.release_reported === true;
              return (
                <motion.div
                  key={track.id}
                  layout
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className={`bg-white/75 border rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 text-left ${isReported ? "border-point/35 bg-point/[0.02]" : "border-navy/10"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-sans text-[10px] font-bold text-navy/55 uppercase tracking-wider bg-navy/6 px-2 py-0.5 rounded-full">
                          {t.navManage}
                        </span>
                        {isReported && (
                          <span className="font-sans text-[10px] font-bold text-point uppercase tracking-wider bg-point/12 px-2 py-0.5 rounded-full animate-pulse">
                            ⚠️ {t.reportedBadge}
                          </span>
                        )}
                      </div>
                      <h2 className="font-serif text-xl text-navy font-bold leading-tight">{track.title}</h2>
                      <p className="font-sans text-sm text-charcoal/75 font-semibold">{track.artist_name}</p>
                      <div className="flex items-center gap-1.5 mt-1 font-sans text-xs text-charcoal/45">
                        <Clock size={11} />
                        <span>{t.submittedDate}: {formatDate(track.created_at)}</span>
                        {track.release_date && (
                          <>
                            <span className="text-navy/20">•</span>
                            <span>{t.performedDate}: {track.release_date}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-cream border border-navy/8 flex items-center justify-center shrink-0">
                      <Music size={20} className="text-navy/45" />
                    </div>
                  </div>
                  <div className="border-t border-navy/6 pt-4">
                    <button
                      onClick={() => handleMarkReleased(track.id, track.title)}
                      className="w-full py-2.5 bg-navy hover:bg-navy/90 text-cream font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-navy/15"
                    >
                      <Check size={15} strokeWidth={2.5} className="text-point" />
                      {t.markReleasedBtn}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )
  );

  const renderHistorySection = () => (
    releasedHistory.length === 0
      ? <EmptyState icon={<Clock size={26} />} title={t.noHistoryTitle} desc={t.noHistoryDesc} />
      : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {releasedHistory.map((track) => (
              <motion.div
                key={track.id}
                layout
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="bg-white/75 border border-navy/10 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 text-left"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-sans text-[10px] font-bold text-navy/55 uppercase tracking-wider bg-navy/6 px-2 py-0.5 rounded-full">
                        {t.tabHistory}
                      </span>
                      <span className="font-sans text-[10px] font-bold text-cream uppercase tracking-wider bg-navy px-2.5 py-0.5 rounded-full">
                        ✨ {t.releasedBadge}
                      </span>
                    </div>
                    <h2 className="font-serif text-xl text-navy font-bold leading-tight">{track.title}</h2>
                    <p className="font-sans text-sm text-charcoal/75 font-semibold">{track.artist_name}</p>
                    <div className="flex items-center gap-1.5 mt-1 font-sans text-xs text-charcoal/45">
                      <Clock size={11} />
                      <span>{t.submittedDate}: {formatDate(track.created_at)}</span>
                      {track.release_date && (
                        <>
                          <span className="text-navy/20">•</span>
                          <span>{t.performedDate}: {track.release_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-cream border border-navy/8 flex items-center justify-center shrink-0">
                    <Disc size={20} className="text-point animate-spin" style={{ animationDuration: "8s" }} />
                  </div>
                </div>
                {track.video_url && <YoutubePreview video_url={track.video_url} title={track.title} />}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )
  );

  const sectionContent: Record<NavSection, () => React.ReactNode> = {
    tracks: renderTracksSection,
    lyrics: renderLyricsSection,
    manage: renderManageSection,
    history: renderHistorySection,
  };

  const currentNavItem = navItems.find(n => n.id === activeSection)!;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex flex-col">

      {/* Toast */}
      <AnimatePresence>
        {notification && (
          <div className="fixed top-5 left-0 right-0 z-[200] px-4 flex justify-center pointer-events-none">
            <motion.div
              initial={{ y: -36, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -36, opacity: 0 }}
              className={`px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 max-w-sm w-full pointer-events-auto border ${
                notification.type === "success"
                  ? "bg-navy text-cream border-white/10"
                  : "bg-red-950 text-red-200 border-red-800"
              }`}
            >
              {notification.type === "success"
                ? <Check size={16} className="text-point shrink-0" strokeWidth={3} />
                : <AlertCircle size={16} className="text-red-400 shrink-0" />
              }
              <p className="font-sans text-sm leading-snug">{notification.text}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOP HEADER */}
      <header className="sticky top-0 z-[100] bg-[var(--app-bg)]/90 backdrop-blur-md border-b border-navy/8 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 border border-navy/10 rounded-full font-sans text-xs text-navy hover:bg-white/90 transition-all shadow-sm"
          >
            <ChevronLeft size={14} />
            {t.homeBtn}
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-navy flex items-center justify-center">
              <Shield size={13} className="text-point" />
            </div>
            <span className="font-sans text-xs font-bold text-navy/50 tracking-widest font-mono uppercase">
              {t.adminPortal}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-point animate-pulse" />
          <span className="font-sans text-xs font-bold text-navy/50 tracking-wider hidden sm:block">
            {user?.email}
          </span>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 pb-8 gap-6 mt-6">

        {/* LEFT SIDEBAR — desktop only */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 gap-2 self-start sticky top-[72px]">
          <div className="mb-4 px-1">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-navy flex items-center justify-center">
                <LayoutDashboard size={16} className="text-point" />
              </div>
              <div>
                <h1 className="font-serif text-base text-navy font-bold leading-tight">{t.adminTitle}</h1>
                <p className="font-sans text-[10px] text-charcoal/45">{t.adminSubtitle}</p>
              </div>
            </div>
          </div>

          {navItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl font-sans text-sm font-semibold text-left transition-all ${
                activeSection === item.id
                  ? "bg-navy text-cream shadow-md shadow-navy/20"
                  : "text-navy/65 hover:bg-white/70 hover:text-navy"
              }`}
            >
              <span className={activeSection === item.id ? "text-point" : "text-navy/40"}>
                {item.icon}
              </span>
              <span className="flex-1 leading-tight">{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  activeSection === item.id
                    ? "bg-point/30 text-cream"
                    : "bg-navy/10 text-navy/60"
                }`}>
                  {item.count}
                </span>
              )}
              {activeSection === item.id && (
                <motion.div
                  layoutId="sidebarActiveIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-point rounded-r-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          ))}
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
              activeSection === "tracks"  ? "bg-point/10 border-point/20 text-point" :
              activeSection === "lyrics"  ? "bg-navy/10 border-navy/15 text-navy"   :
              activeSection === "manage"  ? "bg-navy/10 border-navy/15 text-navy"   :
              "bg-cream border-navy/10 text-navy"
            }`}>
              {currentNavItem.icon}
            </div>
            <div>
              <h2 className="font-serif text-xl sm:text-2xl text-navy font-bold leading-tight">
                {currentNavItem.label}
              </h2>
              {!isLoading && (
                <p className="font-sans text-xs text-charcoal/45 mt-0.5">
                  {activeSection === "tracks"  && `${tracks.length}${locale === "ko" ? "건" : " items"}`}
                  {activeSection === "lyrics"  && `${lyricsSuggestions.length}${locale === "ko" ? "건" : " items"}`}
                  {activeSection === "manage"  && `${manageTracks.length}${locale === "ko" ? "건" : " items"}`}
                  {activeSection === "history" && `${releasedHistory.length}${locale === "ko" ? "건" : " items"}`}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl font-sans text-sm flex items-center gap-3">
              <AlertCircle size={17} className="shrink-0" />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-navy/40">
              <Loader2 className="animate-spin text-point/60" size={32} />
              <p className="font-sans text-sm">{t.loadingQueue}</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {sectionContent[activeSection]()}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* BOTTOM NAV — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-[var(--app-bg)]/95 backdrop-blur-md border-t border-navy/10 px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all ${
              activeSection === item.id ? "text-navy" : "text-navy/40"
            }`}
          >
            <span className={`transition-all ${activeSection === item.id ? "text-point scale-110" : ""}`}>
              {item.icon}
            </span>
            <span className="font-sans text-[10px] font-semibold leading-tight text-center max-w-[56px] truncate">
              {item.label.split(" ")[0]}
            </span>
            {activeSection === item.id && (
              <motion.div
                layoutId="mobileActiveIndicator"
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-point"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            {item.count !== undefined && item.count > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-point text-cream text-[9px] font-bold flex items-center justify-center">
                {item.count > 9 ? "9+" : item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="md:hidden h-20" />
    </div>
  );
}
