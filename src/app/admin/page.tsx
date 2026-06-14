"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check, X, Disc, ExternalLink, Clock, Music, Video, ChevronLeft } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchPendingUnreleasedTracks, approveUnreleasedTrack, rejectUnreleasedTrack } from "@/utils/unreleasedDb";
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
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [tracks, setTracks] = useState<PendingTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  // Load locale from cookie
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getSafeLocale());
    }
  }, []);

  const t = {
    ko: {
      checkAuth: "권한을 확인하고 있어요...",
      title: "미발매곡 승인 대기열",
      subtitle: "이용자들이 새로 등록한 미발매곡을 검토하고 승인 여부를 결정해요. 승인된 곡은 모든 사용자에게 보여요.",
      loadError: "승인 대기 중인 트랙 정보를 불러오는 데 실패했어요.",
      loadingQueue: "대기열을 파헤치고 있어요...",
      noPendingTitle: "승인 대기 중인 곡이 없어요",
      noPendingDesc: "이용자들이 추가한 미발매곡 요청을 모두 처리했어요.\n평화롭고 아늑한 시간이에요. 🏖️",
      homeBtn: "홈으로",
      adminPortal: "어드민 포탈",
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
    },
    en: {
      checkAuth: "Checking permissions...",
      title: "Pending Unreleased Tracks",
      subtitle: "Review and approve unreleased tracks submitted by users. Approved tracks will be visible to everyone.",
      loadError: "Failed to load pending tracks.",
      loadingQueue: "Loading pending queue...",
      noPendingTitle: "No pending tracks",
      noPendingDesc: "All user requests have been processed.\nHave a peaceful time! 🏖️",
      homeBtn: "Home",
      adminPortal: "ADMIN PORTAL",
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
    }
  }[locale];

  // 1. Guard check: redirect non-admin users
  useEffect(() => {
    if (authLoading) return;
    
    const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
    if (!user || !isAdmin) {
      console.warn("Unauthorized access to admin page. Redirecting...");
      router.push("/");
    }
  }, [user, authLoading, router]);

  // 2. Fetch pending tracks if authorized
  useEffect(() => {
    if (authLoading) return;
    const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
    if (!user || !isAdmin) return;

    const loadTracks = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPendingUnreleasedTracks();
        setTracks(data as PendingTrack[]);
      } catch (err: any) {
        console.error("Error loading pending tracks:", err);
        setError(t.loadError);
      } finally {
        setIsLoading(false);
      }
    };

    loadTracks();
  }, [user, authLoading, locale]); // Redraw on locale toggle if loaded fails

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
    const confirmReject = window.confirm(t.rejectConfirm.replace("{title}", title));
    if (!confirmReject) return;

    try {
      await rejectUnreleasedTrack(trackId);
      setTracks(prev => prev.filter(t => t.id !== trackId));
      showToast(t.rejectSuccess.replace("{title}", title), "success");
    } catch (err) {
      showToast(t.rejectError, "error");
    }
  };

  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Auth checking and routing safeguard
  if (authLoading) {
    return (
      <main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="mb-8 relative w-20 h-20 flex items-center justify-center text-point opacity-80"
        >
          <Disc size={80} strokeWidth={1} />
        </motion.div>
        <h1 className="font-serif text-2xl text-navy font-bold tracking-tight">{t.checkAuth}</h1>
      </main>
    );
  }

  // Double check so non-admin gets blank screen before redirecting
  const isAdmin = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;
  if (!user || !isAdmin) {
    return null; 
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-10 overflow-hidden bg-[var(--app-bg)] px-6 py-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <div className="fixed top-6 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              className={`px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 max-w-md w-full pointer-events-auto border ${
                notification.type === "success" 
                  ? "bg-navy text-cream border-white/10" 
                  : "bg-red-950 text-red-200 border-red-850"
              }`}
            >
              {notification.type === "success" ? (
                <Check size={18} className="text-point shrink-0" strokeWidth={3} />
              ) : (
                <X size={18} className="text-red-400 shrink-0" strokeWidth={3} />
              )}
              <p className="font-sans text-sm leading-snug">{notification.text}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-4 py-2 bg-white/50 border border-navy/10 rounded-full font-sans text-sm text-navy hover:bg-white/80 active:scale-[0.98] transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          {t.homeBtn}
        </button>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-point animate-pulse" />
          <span className="font-sans text-xs font-bold text-navy/60 tracking-wider font-mono">{t.adminPortal}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-8 text-left">
          <h1 className="font-serif text-3xl sm:text-4xl text-navy font-bold tracking-tight mb-2">{t.title}</h1>
          <p className="font-sans text-sm text-charcoal/70">{t.subtitle}</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl font-sans text-sm mb-6 flex items-center gap-3">
            <X size={18} className="shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-navy/50 gap-4">
            <Disc className="animate-spin text-point/70" size={36} />
            <p className="font-sans text-sm font-medium">{t.loadingQueue}</p>
          </div>
        ) : tracks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-16 px-6 text-center border-2 border-dashed border-navy/15 rounded-[2.5rem] bg-white/40 flex flex-col items-center justify-center gap-4"
          >
            <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center text-point border border-navy/5 shadow-inner">
              <Music size={28} className="opacity-60" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-navy mb-1 font-bold">{t.noPendingTitle}</h3>
              <p className="font-sans text-xs text-charcoal/60 leading-relaxed whitespace-pre-wrap">{t.noPendingDesc}</p>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-5">
            <AnimatePresence mode="popLayout">
              {tracks.map((track) => {
                const youtubeId = track.video_url ? getYouTubeVideoId(track.video_url) : null;
                return (
                  <motion.div
                    key={track.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="bg-white/70 border border-navy/10 rounded-[2rem] p-6 shadow-sm hover:shadow-md hover:border-navy/20 transition-all flex flex-col gap-4"
                  >
                    {/* Track Info */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1 text-left">
                        <span className="font-sans text-[10px] font-bold text-point uppercase tracking-wider bg-point/10 px-2 py-0.5 rounded-full w-fit mb-1">
                          {t.unreleased}
                        </span>
                        <h2 className="font-serif text-xl sm:text-2xl text-navy font-bold leading-tight">{track.title}</h2>
                        <p className="font-sans text-sm text-charcoal/80 font-semibold">{track.artist_name}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 font-sans text-xs text-charcoal/50">
                          <Clock size={12} />
                          <span>{t.submittedDate}: {formatDate(track.created_at)}</span>
                          {track.release_date && (
                            <>
                              <span className="text-navy/20">•</span>
                              <span>{t.performedDate}: {track.release_date}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="w-12 h-12 rounded-2xl bg-cream border border-navy/5 flex items-center justify-center shrink-0 shadow-inner">
                        <Music size={22} className="text-navy/50 animate-pulse" />
                      </div>
                    </div>

                    {/* YouTube Preview */}
                    {track.video_url && (
                      <div className="w-full flex flex-col gap-2 mt-1">
                        <div className="flex items-center justify-between font-sans text-xs font-semibold text-navy/70 ml-1">
                          <span className="flex items-center gap-1">
                            <Video size={14} className="text-red-600 animate-pulse" />
                            {t.previewLabel}
                          </span>
                          <a
                            href={track.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-point hover:underline"
                          >
                            {t.viewOnYoutube}
                            <ExternalLink size={10} />
                          </a>
                        </div>

                        {youtubeId ? (
                          <div className="w-full aspect-video rounded-2xl overflow-hidden border border-navy/10 shadow-inner relative bg-black">
                            <iframe
                              src={`https://www.youtube.com/embed/${youtubeId}`}
                              title={track.title}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full"
                            />
                          </div>
                        ) : (
                          <div className="w-full p-4 bg-navy/5 rounded-2xl border border-navy/10 flex items-center justify-between gap-3 text-left">
                            <div className="flex flex-col gap-0.5">
                              <p className="font-sans text-xs font-semibold text-navy">{t.nonStandardLink}</p>
                              <p className="font-sans text-[11px] text-charcoal/60 truncate max-w-[280px] sm:max-w-[420px]">{track.video_url}</p>
                            </div>
                            <a
                              href={track.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-navy text-cream rounded-full font-sans text-xs font-bold shrink-0 hover:bg-navy/90"
                            >
                              {t.goBtn}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Controls */}
                    <div className="flex gap-3 mt-2 border-t border-navy/5 pt-4">
                      <button
                        onClick={() => handleReject(track.id, track.title)}
                        className="flex-1 py-3 bg-red-50 hover:bg-red-100/70 text-red-600 border border-red-200/50 font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <X size={16} strokeWidth={2.5} />
                        {t.rejectBtn}
                      </button>
                      <button
                        onClick={() => handleApprove(track.id, track.title)}
                        className="flex-[1.5] py-3 bg-navy hover:bg-navy/90 text-cream font-sans font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-md hover:shadow-lg shadow-navy/10"
                      >
                        <Check size={16} strokeWidth={2.5} className="text-point animate-pulse" />
                        {t.approveBtn}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </main>
  );
}
