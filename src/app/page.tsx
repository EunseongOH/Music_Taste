"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LPPlayer from "@/components/LPPlayer";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthProvider";
import { Trophy, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ProfileHeader from "@/components/ProfileHeader";

import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale, setSafeLocale } from "@/utils/storage";

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

  const modes = [
    {
      id: "multi",
      title: locale === "ko" ? "믹스 매치 월드컵" : "Mix & Match World Cup",
      desc: locale === "ko" ? "좋아하는 아티스트들의 명곡을 한데 모아 토너먼트로 즐기고, 내가 가장 사랑하는 단 한 곡을 찾아보세요." : "Select multiple favorite artists, mix their top songs, and find your absolute #1 track.",
      btnText: locale === "ko" ? "시작하기" : "Start",
      target: "/genres"
    },
    {
      id: "single",
      title: locale === "ko" ? "최애 곡 줄 세우기" : "Favorite Songs Lineup",
      desc: locale === "ko" ? "단 한 명의 아티스트를 선택해, 그동안 발표된 모든 곡을 내 마음에 드는 순서대로 정렬해보세요." : "Select a single artist and line up all of their tracks in the order of your choice.",
      btnText: locale === "ko" ? "시작하기" : "Start",
      target: "/explore?mode=single"
    },
    {
      id: "archive",
      title: locale === "ko" ? "내 취향 스페이스" : "My Taste Space",
      desc: locale === "ko" ? "내가 정성껏 모은 음악들과, 나와 취향이 꼭 닮은 친구들의 피드를 구경해 보세요." : "Explore your saved music tastes and browse the feeds of friends who share similar tastes.",
      btnText: locale === "ko" ? "확인하기" : "Check",
      target: "/explore-taste"
    },
    {
      id: "public-archive",
      title: locale === "ko" ? "우리의 취향 아카이브" : "Public Taste Archive",
      desc: locale === "ko" ? "다른 음악 팬들이 완성한 다양하고 개성 넘치는 음악 취향 리스트를 구경해 보세요." : "Explore the diverse and unique music taste records shared by other music fans.",
      btnText: locale === "ko" ? "구경하기" : "Explore",
      target: "/archive"
    }
  ];

  // Read locale on mount
  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  const handleLanguageToggle = (lang: "ko" | "en") => {
    setLocale(lang);
    setSafeLocale(lang);
    router.refresh();
  };

  const t = {
    ko: {
      tagline1: "내 손안에서 깔끔하게 정리되는 음악 취향, Sortify",
      tagline2: "좋아하는 음악을 나열하고, 나의 색깔을 증폭시켜 보세요.",
      start: "시작하기",
      continue: "이어서 진행하기",
      startNewTitle: "새로 시작할까요?",
      startNewDesc: "이전의 완료되지 않은 진행 내역(선택한 아티스트 및 곡 정보)이 모두 삭제됩니다. 정말 새로운 월드컵을 시작할까요?",
      cancel: "취소",
      startNewBtn: "새로 시작",
    },
    en: {
      tagline1: "Record your clearest taste.",
      tagline2: "List your music preferences and amplify them with your own colors.",
      start: "Start",
      continue: "Continue Progress",
      startNewTitle: "Start New?",
      startNewDesc: "Your previous unsaved progress (selected artists and songs) will be deleted. Do you want to start a new lineup?",
      cancel: "Cancel",
      startNewBtn: "Start New",
    }
  }[locale];

  // 1. Sync activeDraft & hasPreviousProgress with activeCardIndex and activeDrafts
  useEffect(() => {
    const isSingleForCard = activeCardIndex === 1;

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
            setActiveDrafts(data);
          }
        } catch (e) { }
      };
      checkDrafts();
    }
  }, [user, isLoading, supabase]);

  const handleStart = () => {
    const isGuest = sessionStorage.getItem("isGuest") === "true";
    const activeMode = modes[activeCardIndex];

    if (activeMode.id === "archive") {
      if (user || isGuest) {
        router.push(activeMode.target);
      } else {
        setIsModalOpen(true);
      }
      return;
    }

    if (activeMode.id === "public-archive") {
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
      if (activeDraft.phase && activeDraft.phase !== 'loading') {
        const progressObj = {
          phase: activeDraft.phase,
          currentRoundName: activeDraft.current_round_name,
          matches: activeDraft.matches,
          currentMatchIndex: activeDraft.current_match_index,
          winners: activeDraft.winners,
          eliminatedTracks: activeDraft.eliminated_tracks,
          byeCount: activeDraft.bye_count,
          selectedByes: activeDraft.selected_byes
        };
        sessionStorage.setItem("worldcup_progress", JSON.stringify(progressObj));
        localStorage.setItem("worldcup_progress", JSON.stringify(progressObj));
      }

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

      const qs = localIsSingle ? "?mode=single" : "";

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
            "url": "https://sortify.co.kr",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://sortify.co.kr/explore?q={search_term_string}",
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
            "itemListElement": [
              {
                "@type": "SiteNavigationElement",
                "position": 1,
                "name": "믹스 매치 월드컵 (Mix & Match World Cup)",
                "description": "여러 아티스트를 선택해 명곡들을 토너먼트로 즐기고 나만의 취향표를 만듭니다.",
                "url": "https://sortify.co.kr/genres"
              },
              {
                "@type": "SiteNavigationElement",
                "position": 2,
                "name": "최애 곡 줄 세우기 (Favorite Songs Lineup)",
                "description": "한 명의 아티스트를 선택해 전곡을 내 마음에 드는 순서대로 정렬합니다.",
                "url": "https://sortify.co.kr/genres?mode=single"
              },
              {
                "@type": "SiteNavigationElement",
                "position": 3,
                "name": "공개 취향 아카이브 (Public Taste Archive)",
                "description": "다른 유저들이 완성해 공개한 다양하고 개성 넘치는 음악 취향 리스트를 구경합니다.",
                "url": "https://sortify.co.kr/archive"
              },
              {
                "@type": "SiteNavigationElement",
                "position": 4,
                "name": "유저 취향 매칭 피드 (Explore Music Tastes)",
                "description": "나와 음악 취향이 유사한 다른 유저들의 프로필과 취향표를 매칭해 봅니다.",
                "url": "https://sortify.co.kr/explore-taste"
              }
            ]
          })
        }}
      />

      {/* Premium Floating Profile/Login Button */}
      <div className="absolute top-6 right-6 z-50">
        <ProfileHeader locale={locale} />
      </div>

      {/* Premium Floating Language Switcher */}
      <div className="absolute top-6 left-6 z-50 flex items-center gap-1.5 bg-[#F5F2ED]/85 backdrop-blur-md p-1 rounded-full border border-navy/10 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-center pl-2 pr-1">
          <Globe size={14} className="text-navy/50 animate-pulse" />
        </div>
        <button
          onClick={() => handleLanguageToggle("ko")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${locale === "ko"
              ? "bg-navy text-cream shadow-sm scale-105"
              : "text-navy/60 hover:text-navy hover:bg-navy/5"
            }`}
        >
          KO
        </button>
        <button
          onClick={() => handleLanguageToggle("en")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${locale === "en"
              ? "bg-navy text-cream shadow-sm scale-105"
              : "text-navy/60 hover:text-navy hover:bg-navy/5"
            }`}
        >
          EN
        </button>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 w-full text-center z-10 space-y-6 mt-12 md:mt-0">
        <div className="space-y-2">
          <h1 className="font-serif text-5xl md:text-7xl text-navy tracking-tight drop-shadow-sm font-bold">
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
            {modes.map((mode) => (
              <div key={mode.id} className="w-full px-4 shrink-0 flex justify-center">
                <div className="w-full bg-[#FAF7F2] border-[3px] border-navy rounded-[2.5rem] p-6 shadow-md hover:shadow-lg transition-shadow duration-300 relative flex flex-col items-center justify-between text-center min-h-[170px] select-none">
                  {/* Mode Card Header Badge */}
                  <div className="absolute -top-3 px-4 py-0.5 bg-point text-white text-[9px] font-sans font-bold uppercase tracking-wider rounded-full shadow-sm">
                    {mode.id === "multi"
                      ? "Mode 01"
                      : mode.id === "single"
                        ? "Mode 02"
                        : mode.id === "archive"
                          ? "My Space"
                          : "Public Feed"}
                  </div>

                  <div className="mt-2 w-full flex-1 flex flex-col justify-center">
                    <h3 className="font-serif text-xl sm:text-2xl text-navy font-black tracking-tight">{mode.title}</h3>
                    <p className="font-sans text-xs text-charcoal/70 leading-relaxed mt-2 break-keep px-2">
                      {mode.desc}
                    </p>
                  </div>
                </div>
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
            className="px-12 py-3 bg-navy text-cream rounded-full hover:bg-navy/90 transition-all font-semibold text-base shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer min-w-[180px] inline-flex justify-center items-center"
          >
            {modes[activeCardIndex].btnText}
          </a>

          {hasPreviousProgress && (activeCardIndex === 0 || activeCardIndex === 1) && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleRestore}
              className="px-6 py-1 bg-transparent text-navy hover:text-point border-b border-navy/20 hover:border-point transition-all font-semibold text-xs cursor-pointer mt-1"
            >
              {t.continue}
            </motion.button>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col items-center justify-center mt-auto pt-16 pb-8 z-10 gap-4">
        <LPPlayer />

        {(user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true) && (
          <motion.a
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              router.push("/admin");
            }}
            className="px-5 py-2 bg-navy/5 text-navy hover:text-point hover:bg-navy/10 rounded-full border border-navy/10 hover:border-point/20 transition-all font-sans font-bold text-xs tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm inline-flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-point animate-pulse" />
            어드민 페이지로 이동
          </motion.a>
        )}
      </div>

      <LoginModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        locale={locale}
        onSuccess={() => {
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
        }}
      />

      {/* Start New Warning Modal */}
      <AnimatePresence>
        {showRestoreModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRestoreModal(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-sm rounded-[2rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-4 mt-2 shadow-[4px_4px_0_rgba(26,42,108,0.1)]">
                  <Trophy className="text-point animate-bounce" size={24} />
                </div>

                <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">{t.startNewTitle}</h2>
                <p className="font-sans text-charcoal/80 text-sm leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  {t.startNewDesc}
                </p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setShowRestoreModal(false)}
                    className="flex-1 py-3.5 bg-white border-2 border-navy/20 text-navy font-bold rounded-xl hover:bg-navy/5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleStartNew}
                    className="flex-[1.5] py-3.5 bg-navy text-cream font-bold rounded-xl hover:bg-navy/90 transition-all active:scale-[0.98] shadow-md cursor-pointer"
                  >
                    {t.startNewBtn}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Semantic Sitemap Links for Search Engine Crawlers */}
      <nav className="w-full max-w-md mx-auto mt-8 border-t border-navy/10 pt-6 px-4 pb-2 text-center select-none z-10">
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] font-sans font-bold text-navy/40">
          <li>
            <Link href="/genres" className="hover:text-point transition-colors">
              믹스매치 월드컵
            </Link>
          </li>
          <li>
            <span className="text-navy/15">•</span>
          </li>
          <li>
            <Link href="/explore?mode=single" className="hover:text-point transition-colors">
              최애 곡 줄 세우기
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
              공개 취향 아카이브
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
