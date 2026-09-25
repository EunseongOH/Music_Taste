"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LPPlayer from "@/components/LPPlayer";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthProvider";
import { Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ProfileHeader from "@/components/ProfileHeader";
import ModeCard from "@/components/home/ModeCard";
import { Sheet, primaryButton, dangerButton } from "@/components/space/SpaceUI";

import { createClient } from "@/utils/supabase/client";
import { MIX_MATCH } from "@/config/modes";
import { draftExpiresAt, formatDraftExpiry, isDraftExpired } from "@/utils/worldcupDb";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale, setSafeLocale } from "@/utils/storage";
import { trackEvent } from "@/utils/gtag";
import { countNewFeedback } from "@/utils/feedbackDb";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [hasPreviousProgress, setHasPreviousProgress] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [activeDraft, setActiveDraft] = useState<any | null>(null);
  const [activeDrafts, setActiveDrafts] = useState<any[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // 새 의견이 들어왔는지 알 수 있는 유일한 곳이다. 어드민에게만 보이는 버튼에 붙인다.
  const isAdmin = user?.app_metadata?.is_admin === true;
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    countNewFeedback().then(setNewFeedbackCount);
  }, [isAdmin]);

  const modes = [
    {
      id: "single",
      badge: locale === "ko" ? "아티스트 한 명" : "One artist",
      title: locale === "ko" ? "최애 곡 소트하기" : "Favorite Songs Sort",
      desc: locale === "ko" ? "한 아티스트의 전곡을 비교하며, 내가 더 좋아하는 곡을 찾아보세요." : "Compare every song by one artist and find the ones you love more.",
      btnText: locale === "ko" ? "시작하기" : "Start",
      target: "/explore?mode=single"
    },
    /*
     * 믹스 매치 월드컵(여러 아티스트)은 사용자 진입점에서 내렸다 — docs/mode-pivot.md
     * 카드 문구는 그대로 두고 자리만 비운다. MIX_MATCH 를 켜면 그대로 돌아온다.
     */
    MIX_MATCH
      ? {
          id: "multi",
          badge: locale === "ko" ? "여러 아티스트" : "Several artists",
          title: locale === "ko" ? "믹스 매치 월드컵" : "Mix & Match World Cup",
          desc: locale === "ko" ? "좋아하는 아티스트들의 곡을 한데 모아, 토너먼트로 최애곡을 찾아보세요." : "Bring together songs by the artists you love and find your favorite in a tournament.",
          btnText: locale === "ko" ? "시작하기" : "Start",
          target: "/genres"
        }
      : {
          id: "together",
          badge: locale === "ko" ? "둘 이상" : "Two or more",
          title: locale === "ko" ? "같이 소트하기" : "Sort Together",
          desc: locale === "ko" ? "같은 곡을 각자 소트하고, 취향이 얼마나 닮았는지 확인해요." : "Sort the same songs on your own, then see how close your tastes are.",
          btnText: locale === "ko" ? "시작하기" : "Start",
          target: "/together"
        },
    {
      id: "archive",
      badge: locale === "ko" ? "내 기록" : "My records",
      title: locale === "ko" ? "내 취향 스페이스" : "My Taste Space",
      desc: locale === "ko" ? "내 기록들을 모아두고, 취향이 닮은 리스너도 만나보세요." : "Keep your records in one place and meet listeners with similar taste.",
      btnText: locale === "ko" ? "확인하기" : "Check",
      target: "/explore-taste"
    },
    {
      id: "public-archive",
      badge: locale === "ko" ? "모두의 취향표" : "Everyone's taste cards",
      title: locale === "ko" ? "우리의 취향 아카이브" : "Public Taste Archive",
      desc: locale === "ko" ? "다른 리스너는 어떤 곡을 더 좋아했을까요? 다양한 취향표를 구경해보세요." : "Which songs did other listeners love more? Browse all kinds of taste cards.",
      btnText: locale === "ko" ? "구경하기" : "Explore",
      target: "/archive"
    }
  ];

  // Read locale on mount
  useEffect(() => {
    setLocale(getSafeLocale());

    /*
     * 공유된 취향표에서 넘어온 경우, 그 취향표를 만든 모드의 카드를 먼저 보여준다.
     * (taste/[id] 의 CTA 가 ?mode=single|multi 를 붙인다)
     *
     * useSearchParams 대신 location.search 를 직접 읽는다 — 이 코드베이스의
     * 기존 방식이고, 토스 빌드의 라우터 shim 도 search 를 그대로 제공해서
     * 두 빌드에서 같은 코드가 동작한다. 파라미터가 없으면 기존과 동일하게 0.
     *
     * 별도 effect 로 두지 않고 여기 합친 이유: 서버 렌더 때는 알 수 없는
     * 값이라 useState 초기값으로 못 넣고(하이드레이션 불일치), 새 effect 를
     * 만들면 "effect 안 동기 setState" 경고가 하나 더 생긴다.
     */
    const mode = new URLSearchParams(window.location.search).get("mode");
    // 믹스 매치를 내린 동안에는 그 취향표에서 온 사람도 첫 카드로 보낸다.
    if (mode === "multi") setActiveCardIndex(MIX_MATCH ? 1 : 0);
    else if (mode === "single") setActiveCardIndex(0);
  }, []);

  const handleLanguageToggle = (lang: "ko" | "en") => {
    setLocale(lang);
    setSafeLocale(lang);
    trackEvent("change_language", { language: lang });
    router.refresh();
  };

  const t = {
    ko: {
      tagline1: "좋아하는 곡 중에서도,",
      tagline2: "더 마음이 가는 곡을 찾는 곳, Sortify",
      start: "시작하기",
      continue: "이어서 진행하기",
      cancel: "취소",
      startNewBtn: "새로 시작",
    },
    en: {
      tagline1: "Of all the songs you love,",
      tagline2: "find the ones you love a little more. Sortify",
      start: "Start",
      continue: "Continue Progress",
      cancel: "Cancel",
      startNewBtn: "Start New",
    }
  }[locale];

  // 1. Sync activeDraft & hasPreviousProgress with activeCardIndex and activeDrafts
  useEffect(() => {
    // 카드 순서가 아니라 카드 id 로 판단한다(자리는 바뀌어도 모드는 안 바뀐다).
    const cardId = modes[activeCardIndex]?.id;
    if (cardId !== "single" && cardId !== "multi") {
      setActiveDraft(null);
      setHasPreviousProgress(false);
      return;
    }
    const isSingleForCard = cardId === "single";

    // Filter active drafts for current mode
    const matchingDraft = activeDrafts.find(draft => draft.is_single_artist === isSingleForCard);
    setActiveDraft(matchingDraft || null);

    // Check local progress for current mode
    const localIsSingle = localStorage.getItem("worldcup_is_single_artist") === "true" || sessionStorage.getItem("worldcup_is_single_artist") === "true";
    const hasLocal = !!(
      localStorage.getItem("worldcup_progress") ||
      sessionStorage.getItem("worldcup_progress") ||
      localStorage.getItem("worldcup_tracks") ||
      sessionStorage.getItem("worldcup_tracks") ||
      localStorage.getItem("selectedArtists") ||
      sessionStorage.getItem("selectedArtists")
    );

    const matchesLocalMode = hasLocal && (localIsSingle === isSingleForCard);
    setHasPreviousProgress(!!matchingDraft || matchesLocalMode);
  }, [activeCardIndex, activeDrafts]);

  // 2. Check Supabase drafts when user logs in (without automatic redirects or popups!)
  useEffect(() => {
    if (!isLoading && user) {
      const checkDrafts = async () => {
        try {
          const { data, error } = await supabase
            .from('tournament_drafts')
            .select('*')
            .eq('user_id', user.id);

          if (!error && data) {
            // 만료된 플레이 초안은 cron 이 지우기 전이라도 보여주지 않는다.
            // 믹스 매치를 내린 동안에는 그 초안도 보여주지 않는다(행은 DB 에 그대로 둔다).
            setActiveDrafts(
              data.filter((d: any) => !isDraftExpired(d) && (MIX_MATCH || d.is_single_artist))
            );
          }
        } catch (e) { }
      };
      checkDrafts();
    }
  }, [user, isLoading, supabase]);

  const handleStart = () => {
    const isGuest = sessionStorage.getItem("isGuest") === "true";
    const activeMode = modes[activeCardIndex];
    trackEvent("home_mode_click", { mode_id: activeMode.id });

    if (activeMode.id === "archive") {
      if (user || isGuest) {
        router.push(activeMode.target);
      } else {
        setIsModalOpen(true);
      }
      return;
    }

    // 월드컵 상태를 건드리지 않고 그냥 이동하는 카드들.
    if (activeMode.id === "public-archive" || activeMode.id === "together") {
      router.push(activeMode.target);
      return;
    }

    if (user || isGuest) {
      if (hasPreviousProgress) {
        // Show confirmation warning before starting a new tournament (to prevent accidental overwrite)
        setShowRestoreModal(true);
      } else {
        // Clear all to ensure clean slate for new mode
        localStorage.removeItem("worldcup_tracks");
        localStorage.removeItem("worldcup_progress");
        localStorage.removeItem("selectedArtists");
        localStorage.removeItem("selected_genres");
        sessionStorage.removeItem("worldcup_tracks");
        sessionStorage.removeItem("worldcup_progress");
        sessionStorage.removeItem("selectedArtists");
        sessionStorage.removeItem("selected_genres");

        const isSingle = activeMode.id === "single";
        localStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");
        sessionStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");

        router.push(activeMode.target);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  const handleRestore = () => {
    if (activeDraft) {
      localStorage.setItem("worldcup_is_single_artist", activeDraft.is_single_artist ? "true" : "false");
      sessionStorage.setItem("worldcup_is_single_artist", activeDraft.is_single_artist ? "true" : "false");

      // 1. Sync data to storage
      if (activeDraft.selected_artists && activeDraft.selected_artists.length > 0) {
        sessionStorage.setItem("selectedArtists", JSON.stringify(activeDraft.selected_artists));
        localStorage.setItem("selectedArtists", JSON.stringify(activeDraft.selected_artists));
      }
      if (activeDraft.selected_tracks && activeDraft.selected_tracks.length > 0) {
        sessionStorage.setItem("worldcup_tracks", JSON.stringify(activeDraft.selected_tracks));
        localStorage.setItem("worldcup_tracks", JSON.stringify(activeDraft.selected_tracks));
      }
      // 진행 상태는 월드컵 페이지가 DB 초안(progress 컬럼)에서 직접 복원한다.
      // 여기서 로컬에 옮겨 쓰면 오래된 로컬 진행이 DB 를 가릴 수 있어 지운다.
      sessionStorage.removeItem("worldcup_progress");
      localStorage.removeItem("worldcup_progress");

      // 2. Redirect based on stage status
      if (activeDraft.status === 'artist_selection') {
        router.push(activeDraft.is_single_artist ? "/explore?mode=single" : "/explore");
      } else if (activeDraft.status === 'track_selection') {
        router.push(activeDraft.is_single_artist ? "/tracks?mode=single" : "/tracks");
      } else {
        router.push(activeDraft.is_single_artist ? "/worldcup?mode=single" : "/worldcup");
      }
    } else {
      // Fallback local storage checks
      const storedArtists = localStorage.getItem("selectedArtists") || sessionStorage.getItem("selectedArtists");
      const storedTracks = localStorage.getItem("worldcup_tracks") || sessionStorage.getItem("worldcup_tracks");
      const storedProgress = localStorage.getItem("worldcup_progress") || sessionStorage.getItem("worldcup_progress");
      const localIsSingle = localStorage.getItem("worldcup_is_single_artist") === "true" || sessionStorage.getItem("worldcup_is_single_artist") === "true";

      if (storedArtists) sessionStorage.setItem("selectedArtists", storedArtists);
      if (storedTracks) sessionStorage.setItem("worldcup_tracks", storedTracks);
      if (storedProgress) sessionStorage.setItem("worldcup_progress", storedProgress);

      const qs = localIsSingle || !MIX_MATCH ? "?mode=single" : "";

      if (storedProgress) {
        router.push(`/worldcup${qs}`);
      } else if (storedTracks) {
        router.push(`/worldcup${qs}`);
      } else if (storedArtists) {
        router.push(`/tracks${qs}`);
      } else {
        router.push(`/explore${qs}`);
      }
    }
  };

  const handleStartNew = async () => {
    localStorage.removeItem("worldcup_tracks");
    localStorage.removeItem("worldcup_progress");
    localStorage.removeItem("selectedArtists");
    localStorage.removeItem("worldcup_is_single_artist");
    localStorage.removeItem("selected_genres");
    sessionStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_progress");
    sessionStorage.removeItem("selectedArtists");
    sessionStorage.removeItem("worldcup_is_single_artist");
    sessionStorage.removeItem("selected_genres");

    const activeMode = modes[activeCardIndex];
    const isSingle = activeMode.id === "single";
    localStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");
    sessionStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");

    if (user) {
      try {
        // Clear Supabase drafts table for specific mode
        await supabase
          .from('tournament_drafts')
          .delete()
          .eq('user_id', user.id)
          .eq('is_single_artist', isSingle);

        await supabase.auth.updateUser({
          data: {
            worldcup_progress: null,
            worldcup_tracks: null,
            selected_artists: null
          }
        });
      } catch (err) {
        console.error("Error clearing Supabase progress:", err);
      }
    }

    setShowRestoreModal(false);
    router.push(modes[activeCardIndex].target);
  };

  /** 고른 모드로 들어간다. 로그인해서 왔든 게스트로 왔든 하는 일은 같다. */
  const startSelectedMode = () => {
    const activeMode = modes[activeCardIndex];
    const isSingle = activeMode.id === "single";
    // Clear all to ensure clean slate for new mode
    localStorage.removeItem("worldcup_tracks");
    localStorage.removeItem("worldcup_progress");
    localStorage.removeItem("selectedArtists");
    localStorage.removeItem("selected_genres");
    sessionStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_progress");
    sessionStorage.removeItem("selectedArtists");
    sessionStorage.removeItem("selected_genres");

    localStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");
    sessionStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");
    router.push(activeMode.target);
  };

  return (
    <main className="w-full flex flex-1 flex-col items-center justify-between py-6 relative overflow-hidden">
      {/* JSON-LD Structured Data for Search Engine Sitelinks */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Sortify",
            "url": "https://sortify.kr",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://sortify.kr/explore?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            /*
             * 화면의 카드 순서와 같게 둔다. 믹스 매치를 내린 동안에는 그 항목을 빼고
             * 같이 소트하기를 넣는다(docs/mode-pivot.md §13.1).
             * 단일 모드 주소는 오래 /genres?mode=single 로 잘못 적혀 있었다 — 화면은
             * /explore?mode=single 로 보낸다.
             */
            "itemListElement": [
              ...(MIX_MATCH
                ? [{
                    "@type": "SiteNavigationElement",
                    "position": 0,
                    "name": "믹스 매치 월드컵 (Mix & Match World Cup)",
                    "description": "좋아하는 아티스트를 여럿 고르고 곡을 섞어, 둘씩 골라 가며 1위 곡과 취향표를 만들어요.",
                    "url": "https://sortify.kr/genres"
                  }]
                : []),
              {
                "@type": "SiteNavigationElement",
                "position": 1,
                "name": "최애 곡 소트하기 (Favorite Songs Sort)",
                "description": "아티스트 한 명을 골라 발표한 곡을 모두 소트해요.",
                "url": "https://sortify.kr/explore?mode=single"
              },
              ...(MIX_MATCH
                ? []
                : [{
                    "@type": "SiteNavigationElement",
                    "position": 2,
                    "name": "같이 소트하기 (Sort Together)",
                    "description": "같은 곡을 여럿이 각자 소트하고, 서로 취향이 얼마나 닮았는지 봐요.",
                    "url": "https://sortify.kr/together"
                  }]),
              {
                "@type": "SiteNavigationElement",
                "position": 3,
                "name": "우리의 취향 아카이브 (Our Taste Archive)",
                "description": "다른 리스너가 공개한 취향표를 둘러봐요.",
                "url": "https://sortify.kr/archive"
              },
              {
                "@type": "SiteNavigationElement",
                "position": 4,
                "name": "내 취향 스페이스 (My Taste Space)",
                "description": "저장한 취향표를 모아 보고, 취향이 겹치는 리스너를 만나요.",
                "url": "https://sortify.kr/explore-taste"
              }
            ]
          })
        }}
      />

      {/* Premium Floating Profile/Login Button */}
      <div className={`absolute top-6 right-6 transition-all duration-300 ${isModalOpen || showRestoreModal ? "z-30 pointer-events-none opacity-0 select-none" : "z-50"}`}>
        <ProfileHeader locale={locale} />
      </div>

      {/* Premium Floating Language Switcher */}
      <div className={`absolute top-6 left-6 flex items-center gap-1.5 bg-cream/85 backdrop-blur-md p-1 rounded-full border border-navy/10 shadow-sm transition-all duration-300 ${
        isModalOpen || showRestoreModal ? "z-30 pointer-events-none opacity-0 select-none" : "z-50"
      }`}>
        <div className="flex items-center justify-center pl-2 pr-1">
          <Globe size={14} className="text-navy/50" />
        </div>
        <button
          onClick={() => handleLanguageToggle("ko")}
          disabled={isModalOpen || showRestoreModal}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${locale === "ko"
              ? "bg-ink text-cream shadow-sm scale-105"
              : "text-navy/60 hover:text-navy hover:bg-navy/5"
            }`}
        >
          KO
        </button>
        <button
          onClick={() => handleLanguageToggle("en")}
          disabled={isModalOpen || showRestoreModal}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${locale === "en"
              ? "bg-ink text-cream shadow-sm scale-105"
              : "text-navy/60 hover:text-navy hover:bg-navy/5"
            }`}
        >
          EN
        </button>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 w-full text-center z-10 space-y-6 mt-12 md:mt-0">
        <div className="space-y-2">
          <h1 className="font-wordmark text-5xl md:text-7xl text-navy tracking-tight drop-shadow-sm">
            Sortify
          </h1>
          <p className="font-sans text-xs md:text-sm text-charcoal/60 max-w-md mx-auto leading-relaxed break-keep mt-1">
            {t.tagline1}
            <br />
            {t.tagline2}
          </p>
        </div>

        {/* Swipeable Mode Carousel */}
        <div className="w-full max-w-[320px] md:max-w-[360px] overflow-hidden relative py-3 mt-4">
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              const swipeThreshold = 50;
              if (info.offset.x < -swipeThreshold && activeCardIndex < modes.length - 1) {
                setActiveCardIndex(prev => prev + 1);
              } else if (info.offset.x > swipeThreshold && activeCardIndex > 0) {
                setActiveCardIndex(prev => prev - 1);
              }
            }}
            className="flex cursor-grab active:cursor-grabbing w-full"
            animate={{ x: `-${activeCardIndex * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {modes.map((mode, idx) => (
              <div key={mode.id} className="w-full px-4 shrink-0 flex justify-center">
                <ModeCard badge={mode.badge} title={mode.title} desc={mode.desc} tone={idx} />
              </div>
            ))}
          </motion.div>

          {/* Left/Right Indicator Arrows (Desktop support) */}
          {activeCardIndex > 0 && (
            <button
              onClick={() => setActiveCardIndex(p => p - 1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full border border-navy/15 bg-white/95 hover:bg-white flex items-center justify-center shadow-sm cursor-pointer text-xs"
            >
              &larr;
            </button>
          )}
          {activeCardIndex < modes.length - 1 && (
            <button
              onClick={() => setActiveCardIndex(p => p + 1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full border border-navy/15 bg-white/95 hover:bg-white flex items-center justify-center shadow-sm cursor-pointer text-xs"
            >
              &rarr;
            </button>
          )}
        </div>

        {/* Carousel Pagination Dots */}
        <div className="flex justify-center gap-2 mt-1 mb-4">
          {modes.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveCardIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${activeCardIndex === idx ? "w-6 bg-point" : "w-2 bg-navy/20 hover:bg-navy/40"
                }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 mt-2 z-20">
          <a
            href={modes[activeCardIndex].target}
            onClick={(e) => {
              e.preventDefault();
              handleStart();
            }}
            className="px-12 py-3 bg-brand text-cream rounded-full hover:bg-brand/90 transition-all font-semibold text-base shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer min-w-[180px] inline-flex justify-center items-center"
          >
            {modes[activeCardIndex].btnText}
          </a>

          {hasPreviousProgress && (modes[activeCardIndex]?.id === "single" || modes[activeCardIndex]?.id === "multi") && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleRestore}
              className="px-6 py-1 bg-transparent text-navy hover:text-point border-b border-navy/20 hover:border-point transition-all font-semibold text-xs cursor-pointer mt-1"
            >
              {t.continue}
            </motion.button>
          )}
          {activeDraft && draftExpiresAt(activeDraft) !== null && (
            <p className="font-sans text-[11px] text-navy/50 mt-1">
              {activeDraft.current_round_name} · {formatDraftExpiry(activeDraft, locale)}
            </p>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col items-center justify-center mt-auto pt-16 pb-8 z-10 gap-4">
        <LPPlayer />

        {isAdmin && (
          <motion.a
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            href="/manager-taste-control"
            onClick={(e) => {
              e.preventDefault();
              router.push("/manager-taste-control");
            }}
            className="px-5 py-2 bg-navy/5 text-navy hover:text-point hover:bg-navy/10 rounded-full border border-navy/10 hover:border-point/20 transition-all font-sans font-bold text-xs tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm inline-flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-point animate-pulse" />
            어드민 페이지로 이동
            {/* 글자 크기는 토큰만 쓴다(typography.md 최소 12px). 면은 point-ink —
                point(#E67E22) 위 흰 글자는 2.4:1 라 작은 글자 기준 4.5:1 에 못 미친다(color.md). */}
            {newFeedbackCount > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full bg-point-ink text-white type-caption font-semibold">
                새 의견 {newFeedbackCount}
              </span>
            )}
          </motion.a>
        )}
      </div>

      <LoginModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        locale={locale}
        /*
         * 게스트도 고른 모드로 들어가야 한다 — 이 화면의 게스트는 "로그인 안 하고 시작"
         * 이지 "아무것도 안 함" 이 아니다. 콜백이 갈라졌으니 같은 일을 명시로 잇는다.
         */
        onGuest={() => startSelectedMode()}
        onSuccess={() => startSelectedMode()}
      />

      {/* Start New Warning Modal */}
      <AnimatePresence>
        </AnimatePresence>

      {/* 진행 중인 월드컵이 있을 때 — 하단 시트 (docs/design-system/dialogs.md 3장) */}
      <Sheet
        open={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        closeLabel={t.cancel}
        header={
          <>
            <h2 className="type-title-1 text-navy">{locale === "en" ? "You have a World Cup in progress" : "진행 중인 월드컵이 있어요"}</h2>
            <p className="type-sub text-navy/70 mt-1 whitespace-pre-line break-keep">
              {(activeDraft && draftExpiresAt(activeDraft) !== null
                ? `${activeDraft.current_round_name} · ${formatDraftExpiry(activeDraft, locale)}`
                : locale === "en" ? "Your chosen artists and songs are still here." : "고르던 아티스트와 곡이 남아 있어요.")
                + (locale === "en" ? "\nStarting new clears them." : "\n새로 시작하면 이전 내역은 지워져요.")}
            </p>
          </>
        }
        footer={
          <div className="flex flex-col gap-2">
            <button onClick={() => { setShowRestoreModal(false); handleRestore(); }} className={`${primaryButton} w-full`}>{t.continue}</button>
            <button onClick={handleStartNew} className={`${dangerButton} w-full`}>{t.startNewBtn}</button>
          </div>
        }
      />

      {/* Semantic Sitemap Links for Search Engine Crawlers */}
      <nav className="w-full max-w-md mx-auto mt-8 border-t border-navy/10 pt-6 px-4 pb-2 text-center select-none z-10">
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] font-sans font-bold text-navy/40">
          {/* 믹스 매치는 내린 동안 링크하지 않는다 — docs/mode-pivot.md */}
          {MIX_MATCH ? (
            <li>
              <Link href="/genres" className="hover:text-point transition-colors">
                믹스 매치 월드컵
              </Link>
            </li>
          ) : (
            <li>
              <Link href="/together" className="hover:text-point transition-colors">
                같이 소트하기
              </Link>
            </li>
          )}
          <li>
            <span className="text-navy/15">•</span>
          </li>
          <li>
            <Link href="/explore?mode=single" className="hover:text-point transition-colors">
              최애 곡 소트하기
            </Link>
          </li>
          <li>
            <span className="text-navy/15">•</span>
          </li>
          <li>
            <Link href="/explore-taste" className="hover:text-point transition-colors">
              내 취향 스페이스
            </Link>
          </li>
          <li>
            <span className="text-navy/15">•</span>
          </li>
          <li>
            <Link href="/archive" className="hover:text-point transition-colors">
              우리의 취향 아카이브
            </Link>
          </li>
        </ul>
        <p className="text-[10px] font-sans text-navy/20 mt-4">
          © {new Date().getFullYear()} Sortify. All rights reserved.
        </p>
      </nav>
    </main>
  );
}
