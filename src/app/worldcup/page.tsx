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

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

type Phase = "loading" | "pre-tournament" | "playing" | "finished";

function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export default function WorldCupPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tracks, setTracks] = useState<Track[]>([]);
  
  // Pre-tournament state
  const [byeCount, setByeCount] = useState(0);
  const [selectedByes, setSelectedByes] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    // Load from sessionStorage
    const stored = sessionStorage.getItem("worldcup_tracks");
    const savedState = sessionStorage.getItem("worldcup_progress");

    if (!stored) {
      router.replace("/tracks");
      return;
    }

    try {
      const parsedTracks: Track[] = JSON.parse(stored);
      
      if (savedState) {
        // Restore progress
        const st = JSON.parse(savedState);
        setTracks(parsedTracks);
        setPhase(st.phase);
        setCurrentRoundName(st.currentRoundName);
        setMatches(st.matches);
        setCurrentMatchIndex(st.currentMatchIndex);
        setWinners(st.winners);
        setEliminatedTracks(st.eliminatedTracks || []);
        setByeCount(st.byeCount || 0);
        setSelectedByes(new Set(st.selectedByes || []));
      } else {
        // Initialize new
        setTracks(parsedTracks);
        if (parsedTracks.length < 4) {
             alert('최소 4개의 트랙이 필요합니다.');
             router.replace("/tracks");
             return;
        }

        if (parsedTracks.length % 2 !== 0) {
          setPhase("pre-tournament");
          setByeCount(1);
        } else {
          startRound(parsedTracks);
        }
      }
    } catch (e) {
      console.error(e);
      router.replace("/tracks");
    }
  }, []);

  // Save progress on state change
  useEffect(() => {
    if (phase === "loading") return;
    sessionStorage.setItem("worldcup_progress", JSON.stringify({
      phase,
      currentRoundName,
      matches,
      currentMatchIndex,
      winners,
      eliminatedTracks,
      byeCount,
      selectedByes: Array.from(selectedByes)
    }));
  }, [phase, currentRoundName, matches, currentMatchIndex, winners, eliminatedTracks, byeCount, selectedByes]);

  const startRound = (participants: Track[], predefinedWinners: Track[] = []) => {
    const isPowerOf2 = (Math.log2(participants.length + predefinedWinners.length) % 1) === 0;
    const totalCount = participants.length + predefinedWinners.length;
    
    let roundName = "";
    if (totalCount === 2) roundName = "결승 (Final)";
    else roundName = `${totalCount}강`;

    setCurrentRoundName(roundName);

    const shuffled = shuffleArray(participants);
    const newMatches: Track[][] = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i+1]) {
        newMatches.push([shuffled[i], shuffled[i+1]]);
      } else {
        // Should not happen if correctly calculated, but just in case
        predefinedWinners.push(shuffled[i]);
      }
    }

    setMatches(newMatches);
    setCurrentMatchIndex(0);
    setWinners(predefinedWinners); // Add the byes to winners array so they carry over
    setPhase("playing");
  };

  const handleStartFromPre = () => {
    const byeTracks = tracks.filter(t => selectedByes.has(t.id));
    const nonByeTracks = tracks.filter(t => !selectedByes.has(t.id));
    startRound(nonByeTracks, byeTracks);
  };

  const toggleByeSelection = (id: string) => {
    const newSet = new Set(selectedByes);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (newSet.size < byeCount) {
        newSet.add(id);
      } else {
        // Provide hint?
      }
    }
    setSelectedByes(newSet);
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
       if (loser) newEliminated.unshift(loser); // Most recent losers go to the front
       setEliminatedTracks(newEliminated);
       
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

  if (phase === "loading") return <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">Loading...</div>;

  if (phase === "finished") {
    // Navigate straight to result page, or show simple transition and let them click
    return (
      <main className="flex flex-col min-h-screen items-center justify-center bg-[var(--app-bg)] p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
          <Trophy size={64} className="text-point mb-6" />
          <h1 className="font-serif text-3xl text-navy mb-2">My Favorite is...</h1>
          <div className="w-64 h-64 relative rounded-xl border-4 border-point shadow-lg overflow-hidden mt-6">
             <Image src={winners[0].albumImage} alt={winners[0].title} fill className="object-cover" />
          </div>
          <h2 className="font-sans font-bold text-2xl text-navy mt-6">{winners[0].title}</h2>
          <p className="font-sans text-charcoal">{winners[0].artistName}</p>
          
          <button 
            onClick={() => {
              router.push("/taste");
            }}
            className="mt-12 px-8 py-3 rounded-full bg-navy text-cream font-bold hover:bg-navy/90 hover:scale-105 transition-all shadow-[0_10px_30px_rgba(26,42,108,0.3)]"
          >
            내 음악 취향표 굽기 (FUNC-04)
          </button>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full overflow-hidden bg-[#F5F2ED]">
      {/* Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">
            {phase === "pre-tournament" ? "부전승 곡 선택" : "LP 월드컵"}
          </h1>
        </div>
        <ProfileHeader />
      </div>

      <div className="flex-[1] flex flex-col relative w-full h-full p-4 overflow-y-auto pb-32">
        
        {phase === "pre-tournament" && (
          <div className="flex flex-col items-center">
            <div className="bg-white/60 p-5 rounded-2xl border border-navy/10 mt-2 mb-6 w-full max-w-md shadow-sm text-center">
               <p className="font-sans text-navy mb-2">총 {tracks.length}곡이 선택되었습니다.</p>
               <h3 className="font-serif text-xl text-navy">
                 바로 다음 라운드로 진출할 <span className="text-point font-bold">{byeCount}곡</span>을 미리 골라주세요.
               </h3>
               <p className="text-sm font-sans text-navy/60 mt-2">({selectedByes.size} / {byeCount} 선택됨)</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full max-w-md px-2">
               {tracks.map(track => {
                 const isSelected = selectedByes.has(track.id);
                 return (
                   <div 
                     key={track.id}
                     onClick={() => toggleByeSelection(track.id)}
                     className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${isSelected ? "border-point scale-[0.98] opacity-100" : "border-transparent shadow-md hover:shadow-lg opacity-80"}`}
                   >
                     <Image src={track.albumImage} alt={track.title} fill className="object-cover" />
                     {isSelected && (
                       <div className="absolute inset-0 bg-point/20 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="bg-point text-white rounded-full p-2">
                             <Trophy size={20} />
                          </div>
                       </div>
                     )}
                     <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6 pointer-events-none">
                        <p className="text-white font-sans text-sm font-bold line-clamp-1">{track.title}</p>
                     </div>
                   </div>
                 );
               })}
            </div>

            <button 
              onClick={handleStartFromPre}
              disabled={selectedByes.size < byeCount}
              className={`fixed bottom-8 w-max px-8 py-4 rounded-full font-sans font-bold text-lg shadow-xl flex items-center gap-2 transition-all left-1/2 -translate-x-1/2 z-50
                ${selectedByes.size === byeCount ? "bg-navy text-cream hover:bg-navy/90 hover:scale-105" : "bg-navy/20 text-navy/50 cursor-not-allowed"}
              `}
            >
              대진표 완성하기
            </button>
          </div>
        )}

        {phase === "playing" && matches[currentMatchIndex] && (
          <div className="flex flex-col items-center flex-1 w-full justify-between max-w-md mx-auto">
            
            {/* Match Info */}
            <div className="text-center mt-2 mb-16 w-full relative">
               <div className="inline-block bg-navy/5 px-3 py-1 rounded-full mb-3 shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)]">
                 <p className="font-sans text-xs font-bold text-navy/70 tracking-wide">
                   총 {matches.length}매치 중 <span className="text-point">{currentMatchIndex + 1}번째</span>
                 </p>
               </div>
               <h2 className="font-serif text-3xl text-navy">{currentRoundName}</h2>
               
               {/* 1vs1 text */}
               <div className="absolute top-1/2 mt-10 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 font-serif italic text-[#1A2A6C]/5 text-8xl font-black pointer-events-none select-none">
                 VS
               </div>
            </div>

            {/* Candidates */}
            <div className="flex w-full justify-center items-center gap-4 mb-4 relative z-50 px-2 flex-wrap sm:flex-nowrap min-h-[220px]">
              <AnimatePresence mode="popLayout">
                {!droppedTrack && matches[currentMatchIndex].map((track) => (
                  <motion.div 
                    key={track.id}
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="flex flex-col items-center flex-1 max-w-[200px]"
                  >
                    <WorldCupCandidate track={track} onDrop={handleDrop} onActive={setIsAnyLpActive} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            <div className="flex-1" />

            {/* Hint */}
            {!isPlaying && !droppedTrack && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-center font-sans text-sm font-medium mb-10 z-20 px-6 py-2 rounded-full transition-colors duration-300 shadow-sm relative
                  ${isAnyLpActive ? "bg-point text-white" : "bg-navy/5 text-navy/70"}`}
              >
                {isAnyLpActive ? (
                   <span>턴테이블 위로 옮겨주세요 ↓</span>
                ) : (
                   <span>더 좋아하는 커버를 <strong className={isAnyLpActive ? "text-white" : "text-point"}>꾹</strong> 눌러주세요</span>
                )}
              </motion.div>
            )}

            {/* LP Player Drop Zone */}
            <div className="w-full relative z-10 pb-4">
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
