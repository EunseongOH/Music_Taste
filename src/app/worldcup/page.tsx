"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ArrowLeft, RefreshCw, Disc } from "lucide-react";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import LPPlayer from "@/components/LPPlayer";
import WorldCupCandidate from "@/components/WorldCupCandidate";
import { useAuth } from "@/components/AuthProvider";
import { saveTournamentProgress, loadActiveDraft, deleteActiveDraft } from "@/utils/worldcupDb";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { trackEvent } from "@/utils/gtag";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

type Phase = "loading" | "playing" | "finished";

function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export default function WorldCupPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tracks, setTracks] = useState<Track[]>([]);
  
  // Tournament state
  const [currentRoundName, setCurrentRoundName] = useState("");
  const [matches, setMatches] = useState<Track[][]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [winners, setWinners] = useState<Track[]>([]);
  
  // Track ranking: losers get pushed here. Winner goes in at the end.
  const [eliminatedTracks, setEliminatedTracks] = useState<Track[]>([]);
  
  // LP Player state
  const [droppedTrack, setDroppedTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnyLpActive, setIsAnyLpActive] = useState(false);
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getSafeLocale());
    }
  }, []);

  function getLocalizedRoundName(name: string, targetLocale: "ko" | "en"): string {
    if (!name) return "";
    if (targetLocale === "ko") {
      if (name.includes("Final") && !name.includes("결승")) return "결승전";
      if (name.includes("Semifinal") || name.includes("준결승") || name.includes("4강")) return "준결승 (4강)";
      if (name.endsWith("강")) return name;
      const matchRoundN = name.match(/Round of (\d+)/i);
      if (matchRoundN) return `${matchRoundN[1]}강`;
      const matchPlayin = name.match(/Play-in for Round of (\d+)/i);
      if (matchPlayin) return `${matchPlayin[1]}강 진출 예선전`;
      return name;
    } else {
      if (name.includes("결승") || name === "Final") return "Final";
      if (name.includes("준결승") || name.includes("4강") || name.includes("Semifinal")) return "Semifinal (Top 4)";
      const matchRoundKo = name.match(/(\d+)강$/);
      if (matchRoundKo) return `Round of ${matchRoundKo[1]}`;
      const matchPlayinKo = name.match(/(\d+)강 진출 예선전/);
      if (matchPlayinKo) return `Play-in for Round of ${matchPlayinKo[1]}`;
      return name;
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsSingleArtistMode(params.get("mode") === "single");
    }
  }, []);

  useEffect(() => {
    const loadState = async () => {
      let stored = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      let savedState = sessionStorage.getItem("worldcup_progress") || localStorage.getItem("worldcup_progress");

      // 1. Try loading from active draft in Supabase if logged in
      if (user) {
        try {
          const params = new URLSearchParams(window.location.search);
          const isSingle = params.get("mode") === "single";
          const draft = await loadActiveDraft(isSingle);
          // If the draft contains active tournament play state
          if (draft && (draft.status === 'playing' || draft.status === 'pre_tournament') && draft.phase) {
            if (draft.tracks && draft.tracks.length > 0) {
              stored = JSON.stringify(draft.tracks);
              sessionStorage.setItem("worldcup_tracks", stored);
              localStorage.setItem("worldcup_tracks", stored);
            }
            
            const parsedTracks = draft.tracks || [];
            setTracks(parsedTracks);
            // Pre-tournament phase is deprecated, map it straight to playing
            const mappedPhase: Phase = draft.phase === "pre-tournament" ? "playing" : (draft.phase as Phase);
            setPhase(mappedPhase);
            setCurrentRoundName(draft.current_round_name || "");
            setMatches(draft.matches || []);
            setCurrentMatchIndex(draft.current_match_index || 0);
            setWinners(draft.winners || []);
            setEliminatedTracks(draft.eliminated_tracks || []);
            return;
          }
        } catch (err) {
          console.error("Failed to load active tournament draft from Supabase:", err);
        }
      }

      // 2. Fallback to offline local storage
      if (!stored) {
        router.replace("/tracks");
        return;
      }

      sessionStorage.setItem("worldcup_tracks", stored);
      localStorage.setItem("worldcup_tracks", stored);

      try {
        const parsedTracks: Track[] = JSON.parse(stored);
        
        if (savedState) {
          const st = JSON.parse(savedState);
          setTracks(parsedTracks);
          const mappedPhase: Phase = st.phase === "pre-tournament" ? "playing" : (st.phase as Phase);
          setPhase(mappedPhase);
          setCurrentRoundName(st.currentRoundName);
          setMatches(st.matches);
          setCurrentMatchIndex(st.currentMatchIndex);
          setWinners(st.winners);
          setEliminatedTracks(st.eliminated_tracks || []);
        } else {
          setTracks(parsedTracks);
          if (parsedTracks.length < 4) {
               alert(getSafeLocale() === "en" ? 'You need at least 4 tracks to start the World Cup.' : '월드컵을 하려면 최소 4곡을 골라야 해요.');
               router.replace("/tracks");
               return;
          }
          // Directly start matching without the deprecated manual pre-round selection modal
          startRound(parsedTracks);
        }
      } catch (e) {
        console.error(e);
        router.replace("/tracks");
      }
    };

    loadState();
  }, [user]);

  // Save progress on state change (Local storage & Supabase)
  useEffect(() => {
    if (phase === "loading") return;
    
    const progressObj = {
      phase,
      currentRoundName,
      matches,
      currentMatchIndex,
      winners,
      eliminatedTracks,
      byeCount: 0,
      selectedByes: []
    };

    const progressData = JSON.stringify(progressObj);
    sessionStorage.setItem("worldcup_progress", progressData);
    localStorage.setItem("worldcup_progress", progressData);

    if (user) {
      const saveToDb = async () => {
        const storedArtists = JSON.parse(sessionStorage.getItem("selectedArtists") || "[]");
        const storedTracks = JSON.parse(sessionStorage.getItem("worldcup_tracks") || "[]");
        await saveTournamentProgress(progressObj, storedArtists, storedTracks, "내 음악 월드컵", isSingleArtistMode);
      };
      const timer = setTimeout(() => {
        saveToDb();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentRoundName, matches, currentMatchIndex, winners, eliminatedTracks, user]);

  // Clear active tournament drafts in Supabase when finished
  useEffect(() => {
    if (phase === "finished" && user && winners.length > 0) {
      const clearDraft = async () => {
        await deleteActiveDraft(isSingleArtistMode);
        sessionStorage.removeItem("worldcup_progress");
        localStorage.removeItem("worldcup_progress");
      };
      clearDraft();
    }
  }, [phase, user, winners, eliminatedTracks]);

  // The mathematical Play-in Wildcard Round matching logic
  const startRound = (participants: Track[]) => {
    const N = participants.length;
    const isPowerOf2 = (Math.log2(N) % 1) === 0;
    
    const shuffled = shuffleArray(participants);
    const newMatches: Track[][] = [];

    if (isPowerOf2) {
      // Standard Power of 2 Round
      for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i+1]) {
          newMatches.push([shuffled[i], shuffled[i+1]]);
        }
      }

      let roundName = "";
      if (N === 2) roundName = "결승 (Final)";
      else if (N === 4) roundName = "준결승 (4강)";
      else roundName = `${N}강`;

      setMatches(newMatches);
      setCurrentMatchIndex(0);
      setWinners([]); 
      setCurrentRoundName(roundName);
    } else {
      // Wildcard / Play-in Round
      // Find the largest power of 2 less than N
      const P = Math.pow(2, Math.floor(Math.log2(N)));
      const M = N - P; // Number of play-in matches to play
      const E = 2 * M; // Number of play-in candidates
      
      // Front E tracks compete in M play-in matches
      for (let i = 0; i < E; i += 2) {
        if (shuffled[i+1]) {
          newMatches.push([shuffled[i], shuffled[i+1]]);
        }
      }

      // Remaining tracks automatically advance straight to P-round as byes
      const predefinedWinners = shuffled.slice(E);

      setMatches(newMatches);
      setCurrentMatchIndex(0);
      setWinners(predefinedWinners); // Stored inside winners state so they carry over
      setCurrentRoundName(`${P}강 진출 예선전`);
    }

    setPhase("playing");
  };

  const handleDrop = (winner: Track) => {
    setDroppedTrack(winner);
    setIsPlaying(true);

    // Play animation simulation
    setTimeout(() => {
       setIsPlaying(false);
       
       const newWinners = [...winners, winner];
       const loser = matches[currentMatchIndex].find(t => t.id !== winner.id);
       
       let newEliminated = [...eliminatedTracks];
       if (loser) newEliminated.unshift(loser); 
       setEliminatedTracks(newEliminated);

       // Helper to calculate total rounds starting size
       const getInitialRoundSize = (count: number) => {
         if (count <= 4) return 4;
         if (count <= 8) return 8;
         if (count <= 16) return 16;
         if (count <= 32) return 32;
         if (count <= 64) return 64;
         return Math.pow(2, Math.ceil(Math.log2(count)));
       };

       // Helper to parse current round number
       const getCurrentRoundNumber = (roundName: string, matchesCount: number) => {
         if (!roundName) return matchesCount * 2;
         if (roundName.includes("결승") || roundName.includes("Final")) return 2;
         if (roundName.includes("준결승") || roundName.includes("4강") || roundName.includes("Semifinal")) return 4;
         const match = roundName.match(/(\d+)강/);
         if (match) return parseInt(match[1]);
         return matchesCount * 2;
       };

       // Trigger GA4 match progress event
       const initialSize = getInitialRoundSize(tracks.length);
       const roundNum = getCurrentRoundNumber(currentRoundName, matches.length);
       trackEvent("tournament_progress", {
         total_rounds: initialSize,
         current_round: roundNum,
         current_match: currentMatchIndex + 1
       });
       
       if (currentMatchIndex + 1 < matches.length) {
         setWinners(newWinners);
         setCurrentMatchIndex(c => c + 1);
         setDroppedTrack(null);
       } else {
         // Round ended!
         if (newWinners.length === 1) {
           // Save final ranked list before finishing
           const finalRanking = [newWinners[0], ...newEliminated];
           sessionStorage.setItem("worldcup_ranking", JSON.stringify(finalRanking));
           setWinners(newWinners);
           setPhase("finished");
         } else {
           // Small delay before next round
           setTimeout(() => {
             startRound(newWinners);
             setDroppedTrack(null);
           }, 500);
         }
       }
    }, 1500);
  };

  if (phase === "loading") return <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center font-sans text-sm text-navy">{locale === "en" ? "Loading..." : "불러오는 중..."}</div>;

  if (phase === "finished") {
    return (
      <main className="flex flex-col min-h-screen items-center justify-center bg-[var(--app-bg)] p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
          <Trophy size={64} className="text-point mb-6" />
          <h1 className="font-serif text-3xl text-navy mb-2">{locale === "en" ? "My Favorite is..." : "내가 꼽은 최고의 명곡은..."}</h1>
          <div className="w-64 h-64 relative rounded-xl border-4 border-point shadow-lg overflow-hidden mt-6">
             <Image src={winners[0].albumImage} alt={winners[0].title} fill className="object-cover" />
          </div>
          <h2 className="font-sans font-bold text-2xl text-navy mt-6">{winners[0].title}</h2>
          <p className="font-sans text-charcoal">{winners[0].artistName}</p>
          
          <button 
            onClick={() => {
              router.push(isSingleArtistMode ? "/taste?mode=single" : "/taste");
            }}
            className="mt-12 px-8 py-3 rounded-full bg-navy text-cream font-bold hover:bg-navy/90 hover:scale-105 transition-all shadow-[0_10px_30px_rgba(26,42,108,0.3)] cursor-pointer"
          >
            {locale === "en" ? "Bake my music taste card" : "나만의 취향표 구워보기"}
          </button>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full overflow-hidden bg-[#F5F2ED]">
      {/* Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">
            {locale === "en" ? "LP World Cup" : "LP 월드컵"}
          </h1>
        </div>
        <ProfileHeader locale={locale} />
      </div>

      <div className="flex-[1] flex flex-col relative w-full h-full p-3 xs:p-4 overflow-y-auto pb-20 sm:pb-32">
        {phase === "playing" && matches[currentMatchIndex] && (
          <div className="flex flex-col items-center flex-1 w-full justify-between max-w-md mx-auto">
            
            {/* Match Info */}
            <div className="text-center mt-2 mb-2 xs:mb-3 sm:mb-4 w-full relative">
               <div className="inline-block bg-navy/5 px-3 py-1 rounded-full mb-3 shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)]">
                 <p className="font-sans text-xs font-bold text-navy/70 tracking-wide">
                   {locale === "en" ? (
                     <>Match <span className="text-point">{currentMatchIndex + 1}</span> of {matches.length}</>
                   ) : (
                     <>총 {matches.length}매치 중 <span className="text-point">{currentMatchIndex + 1}번째</span></>
                   )}
                 </p>
               </div>
               <h2 className="font-serif text-lg xs:text-xl sm:text-2xl md:text-3xl text-navy whitespace-nowrap tracking-tight leading-none">
                 {getLocalizedRoundName(currentRoundName, locale)}
               </h2>
            </div>

            {/* Spacing to lower the candidate container and avoid overlap on short viewports */}
            <div className="flex-1 min-h-[12px] max-h-[40px]" />

            {/* Candidates (Forced Horizontal row with No-wrap & non-overlapping VS separator) */}
            <div className="flex flex-row flex-nowrap justify-center items-center gap-1 sm:gap-6 w-full px-1.5 relative z-50 min-h-[160px] sm:min-h-[220px] md:min-h-[240px] mb-2 sm:mb-6">
              <AnimatePresence mode="popLayout">
                {!droppedTrack && (
                  <>
                    {/* Left Candidate */}
                    <motion.div
                      key={matches[currentMatchIndex][0].id}
                      initial={{ scale: 0.8, opacity: 0, x: -30 }}
                      animate={{ scale: 1, opacity: 1, x: 0 }}
                      exit={{ scale: 0.5, opacity: 0, x: -30 }}
                      transition={{ type: "spring", stiffness: 200, damping: 22 }}
                      className="flex flex-col items-center flex-1 max-w-[120px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[200px] w-full"
                    >
                      <WorldCupCandidate track={matches[currentMatchIndex][0]} onDrop={handleDrop} onActive={setIsAnyLpActive} />
                    </motion.div>

                    {/* Central VS Separator (Positioned beautifully in-between, never overlapping!) */}
                    <motion.div
                      key="vs-separator"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="shrink-0 font-serif italic text-[#1A2A6C]/20 text-xl sm:text-3xl md:text-4xl font-black select-none px-1 py-6 sm:py-10"
                    >
                      VS
                    </motion.div>

                    {/* Right Candidate */}
                    <motion.div
                      key={matches[currentMatchIndex][1].id}
                      initial={{ scale: 0.8, opacity: 0, x: 30 }}
                      animate={{ scale: 1, opacity: 1, x: 0 }}
                      exit={{ scale: 0.5, opacity: 0, x: 30 }}
                      transition={{ type: "spring", stiffness: 200, damping: 22 }}
                      className="flex flex-col items-center flex-1 max-w-[120px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[200px] w-full"
                    >
                      <WorldCupCandidate track={matches[currentMatchIndex][1]} onDrop={handleDrop} onActive={setIsAnyLpActive} />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex-1" />

            {/* Hint */}
            {!isPlaying && !droppedTrack && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`text-center font-sans text-sm font-medium mb-6 sm:mb-10 z-20 px-6 py-2 rounded-full transition-colors duration-300 shadow-sm relative
                    ${isAnyLpActive ? "bg-point text-white" : "bg-navy/5 text-navy/70"}`}
                >
                  {isAnyLpActive ? (
                     <span>{locale === "en" ? "Drag it onto the turntable ↓" : "턴테이블 위로 옮겨주세요 ↓"}</span>
                  ) : (
                     <span>
                       {locale === "en" ? (
                         <>Hold and select the cover of your preferred song</>
                       ) : (
                         <>더 좋아하는 곡의 커버를 <strong className={isAnyLpActive ? "text-white" : "text-point"}>꾹</strong> 눌러 선택해 주세요</>
                       )}
                     </span>
                  )}
                </motion.div>
            )}

            <div className="w-full relative z-10 pb-4 mt-4">
              <LPPlayer 
                isPlaying={isPlaying} 
                currentTrack={droppedTrack} 
                className={droppedTrack ? 'border-point shadow-[0_4px_25px_rgba(230,126,34,0.3)]' : ''} 
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
