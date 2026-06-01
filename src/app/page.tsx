"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LPPlayer from "@/components/LPPlayer";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthProvider";
import { Trophy, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { createClient } from "@/utils/supabase/client";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [hasPreviousProgress, setHasPreviousProgress] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [activeDraft, setActiveDraft] = useState<any | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const modes = [
    {
      id: "multi",
      title: locale === "ko" ? "믹스 매치 월드컵" : "Mix & Match World Cup",
      desc: locale === "ko" ? "좋아하는 여러 아티스트의 명곡을 섞어 최종 우승곡을 가려냅니다." : "Select multiple favorite artists, mix their top songs, and find your absolute #1 track.",
      btnText: locale === "ko" ? "시작하기" : "Start",
      target: "/explore"
    },
    {
      id: "single",
      title: locale === "ko" ? "아티스트 싹쓸이" : "Artist Catalog Sort",
      desc: locale === "ko" ? "단 한 명의 아티스트를 선택하고 그들의 전곡 순위를 매겨볼 수 있습니다." : "Select exactly one artist and sort their entire catalog of songs.",
      btnText: locale === "ko" ? "시작하기" : "Start",
      target: "/explore?mode=single"
    },
    {
      id: "archive",
      title: locale === "ko" ? "내 취향 스페이스" : "My Taste Space",
      desc: locale === "ko" ? "내 아카이빙 결과와 나와 곡취향이 통하는 취향 매칭 피드를 확인해보세요." : "Explore your saved archives and find users matching your musical soul.",
      btnText: locale === "ko" ? "확인하기" : "Check",
      target: "/explore-taste"
    }
  ];

  // Read locale on mount
  useEffect(() => {
    const savedLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith("locale="))
      ?.split("=")[1];
    
    if (savedLocale === "en" || savedLocale === "ko") {
      setLocale(savedLocale as any);
    } else {
      // Default to ko and save cookie
      document.cookie = "locale=ko; path=/; max-age=31536000"; // 1 year
    }
  }, []);

  const handleLanguageToggle = (lang: "ko" | "en") => {
    setLocale(lang);
    document.cookie = `locale=${lang}; path=/; max-age=31536000`;
    router.refresh();
  };

  const t = {
    ko: {
      tagline1: "가장 선명한 취향의 기록.",
      tagline2: "당신의 음악 취향을 나열하고, 나만의 색깔로 증폭시켜 보세요.",
      start: "시작하기",
      continue: "이어서 진행하기",
      startNewTitle: "새로 시작하시겠습니까?",
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
      startNewDesc: "All uncompleted progress (selected artists and track details) will be deleted. Do you really want to start a new World Cup?",
      cancel: "Cancel",
      startNewBtn: "Start New",
    }
  }[locale];

  // 1. Check local storage progress on mount
  useEffect(() => {
    const hasLocalProgress = !!(
      localStorage.getItem("worldcup_progress") || 
      sessionStorage.getItem("worldcup_progress") ||
      localStorage.getItem("worldcup_tracks") ||
      sessionStorage.getItem("worldcup_tracks") ||
      localStorage.getItem("selectedArtists") ||
      sessionStorage.getItem("selectedArtists")
    );
    if (hasLocalProgress) {
      setHasPreviousProgress(true);
    }
  }, []);

  // 2. Check Supabase draft when user logs in (without automatic redirects or popups!)
  useEffect(() => {
    if (!isLoading && user) {
      const checkDraft = async () => {
        try {
          const { data: draft, error } = await supabase
            .from('tournament_drafts')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (!error && draft) {
            setActiveDraft(draft);
            setHasPreviousProgress(true);
          }
        } catch (e) {}
      };
      checkDraft();
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

    if (user || isGuest) {
      if (hasPreviousProgress) {
        // Show confirmation warning before starting a new tournament (to prevent accidental overwrite)
        setShowRestoreModal(true);
      } else {
        router.push(activeMode.target);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  const handleRestore = () => {
    if (activeDraft) {
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
        router.push("/explore");
      } else if (activeDraft.status === 'track_selection') {
        router.push("/tracks");
      } else {
        router.push("/worldcup");
      }
    } else {
      // Fallback local storage checks
      const storedArtists = localStorage.getItem("selectedArtists") || sessionStorage.getItem("selectedArtists");
      const storedTracks = localStorage.getItem("worldcup_tracks") || sessionStorage.getItem("worldcup_tracks");
      const storedProgress = localStorage.getItem("worldcup_progress") || sessionStorage.getItem("worldcup_progress");
      
      if (storedArtists) sessionStorage.setItem("selectedArtists", storedArtists);
      if (storedTracks) sessionStorage.setItem("worldcup_tracks", storedTracks);
      if (storedProgress) sessionStorage.setItem("worldcup_progress", storedProgress);

      if (storedProgress) {
        router.push("/worldcup");
      } else if (storedTracks) {
        router.push("/worldcup");
      } else if (storedArtists) {
        router.push("/tracks");
      } else {
        router.push("/explore");
      }
    }
  };

  const handleStartNew = async () => {
    localStorage.removeItem("worldcup_tracks");
    localStorage.removeItem("worldcup_progress");
    localStorage.removeItem("selectedArtists");
    sessionStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_progress");
    sessionStorage.removeItem("selectedArtists");

    if (user) {
      try {
        // Clear Supabase drafts table
        await supabase
          .from('tournament_drafts')
          .delete()
          .eq('user_id', user.id);

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
      {/* Premium Floating Language Switcher */}
      <div className="absolute top-6 left-6 z-50 flex items-center gap-1.5 bg-[#F5F2ED]/85 backdrop-blur-md p-1 rounded-full border border-navy/10 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-center pl-2 pr-1">
          <Globe size={14} className="text-navy/50 animate-pulse" />
        </div>
        <button
          onClick={() => handleLanguageToggle("ko")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${
            locale === "ko" 
              ? "bg-navy text-cream shadow-sm scale-105" 
              : "text-navy/60 hover:text-navy hover:bg-navy/5"
          }`}
        >
          KO
        </button>
        <button
          onClick={() => handleLanguageToggle("en")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold transition-all duration-200 cursor-pointer ${
            locale === "en" 
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
            {t.tagline1} {t.tagline2}
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
            style={{ width: `${modes.length * 100}%` }}
          >
            {modes.map((mode) => (
              <div key={mode.id} className="w-full px-4 shrink-0 flex justify-center">
                <div className="w-full bg-[#FAF7F2] border-[3px] border-navy rounded-[2.5rem] p-6 shadow-md hover:shadow-lg transition-shadow duration-300 relative flex flex-col items-center justify-between text-center min-h-[170px] select-none">
                  {/* Mode Card Header Badge */}
                  <div className="absolute -top-3 px-4 py-0.5 bg-point text-white text-[9px] font-sans font-bold uppercase tracking-wider rounded-full shadow-sm">
                    {mode.id === "multi" ? "Mode 01" : mode.id === "single" ? "Mode 02" : "My Space"}
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
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeCardIndex === idx ? "w-6 bg-point" : "w-2 bg-navy/20 hover:bg-navy/40"
              }`}
            />
          ))}
        </div>
        
        {/* Actions */}
        <div className="flex flex-col items-center gap-3 mt-2 z-20">
          <button 
            onClick={handleStart}
            className="px-12 py-3 bg-navy text-cream rounded-full hover:bg-navy/90 transition-all font-semibold text-base shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer min-w-[180px]"
          >
            {modes[activeCardIndex].btnText}
          </button>
          
          {hasPreviousProgress && activeCardIndex !== 2 && (
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
         
         {user?.user_metadata?.is_admin === true && (
           <motion.button
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             onClick={() => router.push("/admin")}
             className="px-5 py-2 bg-navy/5 text-navy hover:text-point hover:bg-navy/10 rounded-full border border-navy/10 hover:border-point/20 transition-all font-sans font-bold text-xs tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm"
           >
             <span className="h-1.5 w-1.5 rounded-full bg-point animate-pulse" />
             어드민 페이지로 이동
           </motion.button>
         )}
      </div>

      <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

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
    </main>
  );
}
