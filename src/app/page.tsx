"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LPPlayer from "@/components/LPPlayer";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthProvider";
import { Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { createClient } from "@/utils/supabase/client";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [hasPreviousProgress, setHasPreviousProgress] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [activeDraft, setActiveDraft] = useState<any | null>(null);

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
    if (user || isGuest) {
      if (hasPreviousProgress) {
        // Show confirmation warning before starting a new tournament (to prevent accidental overwrite)
        setShowRestoreModal(true);
      } else {
        router.push("/explore");
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
    router.push("/explore");
  };

  return (
    <main className="w-full flex flex-1 flex-col items-center justify-between py-6 relative overflow-hidden">
      <div className="flex flex-col items-center justify-center flex-1 w-full text-center z-10 space-y-8 mt-12 md:mt-0">
        <div className="space-y-4">
          <h1 className="font-serif text-6xl md:text-8xl text-navy tracking-tight drop-shadow-sm font-bold">
            Sortify
          </h1>
          <p className="font-sans text-lg md:text-xl text-charcoal/80 max-w-md mx-auto leading-relaxed break-keep mt-2">
            가장 선명한 취향의 기록.<br/>
            당신의 음악 취향을 나열하고, 나만의 색깔로 증폭시켜 보세요.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col items-center gap-3 mt-8 z-20">
          <button 
            onClick={handleStart}
            className="px-12 py-3.5 bg-navy text-cream rounded-full hover:bg-navy/90 transition-all font-semibold text-lg shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer min-w-[180px]"
          >
            시작하기
          </button>
          
          {hasPreviousProgress && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleRestore}
              className="px-6 py-2 bg-transparent text-navy hover:text-point border-b border-navy/20 hover:border-point transition-all font-semibold text-sm cursor-pointer mt-1"
            >
              이어서 진행하기
            </motion.button>
          )}
        </div>
      </div>

      <div className="w-full flex justify-center mt-auto pt-16 pb-8 z-10">
         <LPPlayer />
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
                
                <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">새로 시작하시겠습니까?</h2>
                <p className="font-sans text-charcoal/80 text-sm leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  이전의 진행 내역(선택한 아티스트 및 곡 정보)이 모두 삭제됩니다. 정말 새로운 월드컵을 시작할까요?
                </p>
                
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setShowRestoreModal(false)}
                    className="flex-1 py-3.5 bg-white border-2 border-navy/20 text-navy font-bold rounded-xl hover:bg-navy/5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    취소
                  </button>
                  <button 
                    onClick={handleStartNew}
                    className="flex-[1.5] py-3.5 bg-navy text-cream font-bold rounded-xl hover:bg-navy/90 transition-all active:scale-[0.98] shadow-md cursor-pointer"
                  >
                    새로 시작
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
