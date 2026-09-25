"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import WinnerReveal from "@/components/result/WinnerReveal";
import { ConfirmSheet, Sheet, primaryButton, dangerButton, textLink } from "@/components/space/SpaceUI";
import BackButton from "@/components/BackButton";
import LoginModal from "@/components/LoginModal";
import ProfileHeader from "@/components/ProfileHeader";
import LPPlayer from "@/components/LPPlayer";
import WorldCupCandidate from "@/components/WorldCupCandidate";
import { useAuth } from "@/components/AuthProvider";
import { rememberedNickname } from "@/utils/togetherDb";
import { saveWorldcupDraft, loadActiveDraft, deleteActiveDraft, hydrateDraft, isProtectedDraft, type DraftPick, type WorldcupState } from "@/utils/worldcupDb";
import { attachRun, beginRun, clearActiveRun, getActiveRun } from "@/utils/worldcupRun";
import { onAppExit } from "@/utils/platform";
import { recordTogetherCompletion } from "@/utils/togetherCompletion";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { trackEvent } from "@/utils/gtag";
import { MIX_MATCH } from "@/config/modes";

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

// 전체 라운드 크기 (128곡 → 128강)
const getInitialRoundSize = (count: number) => {
  if (count <= 4) return 4;
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  if (count <= 32) return 32;
  if (count <= 64) return 64;
  return Math.pow(2, Math.ceil(Math.log2(count)));
};

// 현재 라운드 크기. 이름으로 판단한다.
const getCurrentRoundNumber = (roundName: string, matchesCount: number) => {
  if (!roundName) return matchesCount * 2;
  if (roundName.includes("결승") || roundName.includes("Final")) return 2;
  if (roundName.includes("준결승") || roundName.includes("4강") || roundName.includes("Semifinal")) return 4;
  const match = roundName.match(/(\d+)강/);
  if (match) return parseInt(match[1]);
  return matchesCount * 2;
};

export default function WorldCupPage() {
  const { user, isLoading } = useAuth();
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

  /**
   * "모르는 곡"으로 뺀 곡. 순위에는 들어가지 않고 들어볼 곡 목록으로 간다.
   * 빼는 순간 상대 곡이 자동 진출하므로 대진표 크기는 변하지 않는다.
   */
  const [skippedTracks, setSkippedTracks] = useState<Track[]>([]);
  /** 매치별 선택 기록 [라운드 크기, 이긴 곡, 진 곡]. 빼기로 넘어간 매치는 넣지 않는다. */
  const [picks, setPicks] = useState<DraftPick[]>([]);
  /** 되돌리기 대기 중인 빼기. 확정 전까지 후보를 가리고 되돌리기 카드를 보여준다. */
  const [pendingRemoval, setPendingRemoval] = useState<Track | null>(null);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 나가기 확인 (docs/worldcup-draft-plan.md 3장)
  const [exitModal, setExitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  /** 우리가 나가는 중이면 popstate 가드를 끈다. */
  const leavingRef = useRef(false);
  /** 곡 객체(selected_tracks)는 판당 한 번만 DB 에 쓴다. */
  const tracksWrittenRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // LP Player state
  const [droppedTrack, setDroppedTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnyLpActive, setIsAnyLpActive] = useState(false);
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  /**
   * 같이 소트하기(실험, docs/together-sort.md)로 들어온 판인지. `?challenge=1` 로만 켜진다.
   * 켜지면 ① 이어하기 드래프트를 불러오지 않고 ② 서버에 진행을 저장하지 않고
   * ③ 끝났을 때 취향표 대신 일치율 화면으로 간다 — 평소 흐름은 그대로다.
   */
  const [isChallenge, setIsChallenge] = useState(false);
  /**
   * 이 판이 붙어 있는 계정(utils/worldcupRun.ts). **붙어 있을 때만** 계정 초안에 저장하고,
   * 끝내거나 버릴 때 그 초안을 지운다. 로그인했다는 것만으로는 붙지 않는다(UX-004).
   */
  const [attachedTo, setAttachedTo] = useState<string | null>(null);
  const attached = !!user && !isChallenge && attachedTo === user.id;
  /** 임시저장하려는데 계정에 진행 중인 다른 판이 있다 — 바꿀지 묻는다. */
  const [replaceAsk, setReplaceAsk] = useState(false);
  /** 어느 판을 띄울지는 **한 번만** 정한다. 로그인은 이 결정을 다시 하게 하지 않는다. */
  const initializedRef = useRef(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getSafeLocale());
    }
  }, []);

  function getLocalizedRoundName(name: string, targetLocale: "ko" | "en"): string {
    if (!name) return "";
    // 좁은 이름부터 본다. "준결승전"은 "결승"을, "4강 진출 예선전"은 "4강"을 포함하므로
    // 넓은 조건을 먼저 보면 준결승이 결승으로, 예선전이 준결승으로 표시된다.
    if (targetLocale === "ko") {
      const matchPlayin = name.match(/Play-in for Round of (\d+)/i);
      if (matchPlayin) return `${matchPlayin[1]}강 진출 예선전`;
      if (name.includes("예선전")) return name;
      if (name.includes("Semifinal") || name.includes("준결승") || name === "4강") return "준결승전";
      if (name.includes("Final") || name.includes("결승")) return "결승전";
      if (name.endsWith("강")) return name;
      const matchRoundN = name.match(/Round of (\d+)/i);
      if (matchRoundN) return `${matchRoundN[1]}강`;
      return name;
    } else {
      const matchPlayinKo = name.match(/(\d+)강 진출 예선전/);
      if (matchPlayinKo) return `Play-in for Round of ${matchPlayinKo[1]}`;
      if (name.includes("Play-in")) return name;
      if (name.includes("준결승") || name === "4강" || name.includes("Semifinal")) return "Semifinal";
      if (name.includes("결승") || name.includes("Final")) return "Final";
      const matchRoundKo = name.match(/(\d+)강$/);
      if (matchRoundKo) return `Round of ${matchRoundKo[1]}`;
      return name;
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      // 믹스 매치를 내린 동안에는 ?mode 가 없어도 단일이 기본이다 — docs/mode-pivot.md
      setIsSingleArtistMode(!MIX_MATCH || params.get("mode") === "single");
      setIsChallenge(params.get("challenge") === "1");
    }
  }, []);

  /*
   * **어느 판을 띄울지 한 번만 정한다.**
   *
   * 예전에는 이 effect 가 `[user]` 에 걸려 있어서, 게스트로 하던 중 로그인하면 다시 돌며
   * 계정의 옛 초안을 불러와 **지금 하던 판을 갈아치웠다**(UX-004). 로그인은 판을 바꾸라는
   * 명령이 아니다. 인증 확인이 끝난 뒤(`isLoading`) 한 번 정하고, 그 뒤 user 가 바뀌어도
   * 다시 정하지 않는다 — 로그인 뒤 할 일(계정에 붙일지)은 아래 따로 둔 effect 가 한다.
   *
   *   1. 같이 소트하기            링크의 곡 세트
   *   2. 이 탭에서 하던 판         그대로 이어서 (새로 고침해도 같은 판)
   *   3. 계정에 진행 중인 초안     불러온다 (다른 기기에서 하던 판, 홈 "이어서")
   *   4. 새로 고른 곡·로컬 진행    새 판 / 이어서
   */
  useEffect(() => {
    if (isLoading || initializedRef.current) return;
    initializedRef.current = true;
    const loadState = async () => {
      let stored = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      let savedState = sessionStorage.getItem("worldcup_progress") || localStorage.getItem("worldcup_progress");

      const params = new URLSearchParams(window.location.search);
      const challengeRun = params.get("challenge") === "1";
      // 믹스 매치를 내린 동안에는 ?mode 가 없어도 단일이 기본이다 — docs/mode-pivot.md
      const isSingle = !MIX_MATCH || params.get("mode") === "single";
      // 이 탭에서 하던 판. localStorage 는 탭·계정이 같이 쓰므로 근거로 삼지 않는다.
      const tabRun = challengeRun ? null : getActiveRun(isSingle);
      const tabHasRun = !!tabRun && !!sessionStorage.getItem("worldcup_progress") && !!sessionStorage.getItem("worldcup_tracks");

      // 3. 이 탭에서 하던 판이 없으면 계정 초안 (같이 소트하기는 링크의 곡 세트를 써야 해서 건너뛴다)
      if (user && !challengeRun && !tabHasRun) {
        try {
          const draft = await loadActiveDraft(isSingle);
          // 플레이 중 초안이면 progress(곡 ID) 를 selected_tracks 로 되살린다.
          // 옛 형식(progress 없음)은 null 이라 아래 로컬 폴백으로 간다.
          const h = draft && (draft.status === 'playing' || draft.status === 'pre_tournament') ? hydrateDraft(draft) : null;
          if (h) {
            stored = JSON.stringify(h.tracks);
            sessionStorage.setItem("worldcup_tracks", stored);
            localStorage.setItem("worldcup_tracks", stored);
            /*
             * 고른 아티스트도 **이 초안의 것으로** 맞춘다. 곡만 바꾸면 자동저장이
             * "아티스트는 다른 판, 곡은 이 판" 인 섞인 줄을 쓴다(UX-004).
             */
            if (Array.isArray(draft.selected_artists)) {
              const artists = JSON.stringify(draft.selected_artists);
              sessionStorage.setItem("selectedArtists", artists);
              localStorage.setItem("selectedArtists", artists);
            }
            beginRun(isSingle, user.id);
            setAttachedTo(user.id);

            setTracks(h.tracks as Track[]);
            setPhase("playing");
            setCurrentRoundName(h.currentRoundName);
            setMatches(h.matches as Track[][]);
            setCurrentMatchIndex(h.currentMatchIndex);
            setWinners(h.winners as Track[]);
            setEliminatedTracks(h.eliminatedTracks as Track[]);
            setSkippedTracks(h.skippedTracks as Track[]);
            setPicks(h.picks);
            tracksWrittenRef.current = true;
            return;
          }
        } catch (err) {
          console.error("Failed to load active tournament draft from Supabase:", err);
        }
      }

      // 2·4. 이 탭의 판, 또는 이 기기에 남은 곡·진행
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
          /*
           * 이어서 하는 판. 이 탭의 판이면 그 표시(붙은 계정)를 그대로 쓴다. 아니면(다른 탭·
           * 옛 방문의 진행) 아직 어느 계정에도 붙지 않은 판으로 시작한다 — 붙일지는 아래에서.
           */
          if (!challengeRun) {
            const run = tabRun ?? beginRun(isSingle, null);
            setAttachedTo(run.attachedUserId);
          }
          setTracks(parsedTracks);
          const mappedPhase: Phase = st.phase === "pre-tournament" ? "playing" : (st.phase as Phase);
          setPhase(mappedPhase);
          setCurrentRoundName(st.currentRoundName);
          setMatches(st.matches);
          setCurrentMatchIndex(st.currentMatchIndex);
          setWinners(st.winners);
          // 저장하는 쪽은 모두 eliminatedTracks 키를 쓴다. 예전 키도 읽어 둔다.
          setEliminatedTracks(st.eliminatedTracks || st.eliminated_tracks || []);
          setSkippedTracks(st.skippedTracks || []);
          setPicks(st.picks || []);
        } else {
          setTracks(parsedTracks);
          if (parsedTracks.length < 4) {
               alert(getSafeLocale() === "en" ? 'You need at least 4 tracks to start the World Cup.' : '월드컵을 하려면 최소 4곡을 골라야 해요.');
               router.replace("/tracks");
               return;
          }
          // 새 판. 곡 객체를 DB 에 다시 써야 한다. 계정에 붙일지는 아래에서 정한다.
          tracksWrittenRef.current = false;
          if (!challengeRun) {
            beginRun(isSingle, null);
            setAttachedTo(null);
          }
          setPicks([]);
          // Directly start matching without the deprecated manual pre-round selection modal
          startRound(parsedTracks);
        }
      } catch (e) {
        console.error(e);
        router.replace("/tracks");
      }
    };

    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  /*
   * **로그인했을 때 이 판을 계정에 붙일지.** 판은 바꾸지 않는다.
   *
   *   계정에 진행 중인 다른 판이 없다   붙인다 — 지금 판이 계정에 이어서 저장된다
   *   계정에 진행 중인 판이 있다        붙이지 않는다 — 둘 다 지킨다. 지금 판은 이 기기에서
   *                                    계속하고, 임시저장하려 하면 그때 바꿀지 묻는다
   */
  const ready = phase !== "loading";
  useEffect(() => {
    if (!ready || isChallenge || !user || attachedTo === user.id) return;
    let alive = true;
    (async () => {
      const draft = await loadActiveDraft(isSingleArtistMode);
      if (!alive || isProtectedDraft(draft)) return;
      attachRun(isSingleArtistMode, user.id);
      tracksWrittenRef.current = false; // 이 계정에는 아직 곡 목록이 없다
      setAttachedTo(user.id);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isChallenge, user?.id, attachedTo, isSingleArtistMode]);

  const currentState = (): WorldcupState => ({
    tracks, phase, currentRoundName, currentMatchIndex, matches, winners, eliminatedTracks, skippedTracks, picks,
  });

  /** DB 저장. confirm=true 면 임시저장(확정, 24시간 보관). 자동저장은 1시간 버퍼. */
  const saveDraft = async (confirm: boolean) => {
    const storedArtists = JSON.parse(sessionStorage.getItem("selectedArtists") || "[]");
    const ok = await saveWorldcupDraft(currentState(), { confirm, withTracks: !tracksWrittenRef.current }, storedArtists, isSingleArtistMode);
    if (ok) tracksWrittenRef.current = true;
    return ok;
  };

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
      skippedTracks,
      picks,
      byeCount: 0,
      selectedByes: []
    };

    const progressData = JSON.stringify(progressObj);
    sessionStorage.setItem("worldcup_progress", progressData);
    localStorage.setItem("worldcup_progress", progressData);

    // DB 자동저장(버퍼). 곡 ID 만 보낸다. **계정 초안에 붙은 판만** — 같이 소트하기 판이나
    // 게스트로 시작해 계정의 다른 판과 겹친 판은 그 초안을 덮지 않는다.
    if (attached && phase === "playing") {
      autosaveTimer.current = setTimeout(() => {
        autosaveTimer.current = null;
        saveDraft(false);
      }, 1500);
      return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    }
  }, [phase, currentRoundName, matches, currentMatchIndex, winners, eliminatedTracks, skippedTracks, picks, attached]);

  // 브라우저·네비게이션 바 뒤로가기를 가로채 나가기 모달을 띄운다 (docs/worldcup-draft-plan.md 3-3).
  useEffect(() => {
    if (phase !== "playing") return;
    history.pushState(null, "", location.href);
    const onPop = () => {
      if (leavingRef.current) return;
      history.pushState(null, "", location.href);
      setExitModal(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [phase]);

  // 앱인토스 홈 버튼: 물어볼 틈이 없으니 바로 임시저장(확정)해 둔다.
  useEffect(() => {
    if (phase !== "playing" || !attached) return;
    return onAppExit(() => { saveDraft(true); });
  }, [phase, attached, tracks, currentRoundName, currentMatchIndex, matches, winners, eliminatedTracks, skippedTracks, picks]);

  const leave = () => {
    leavingRef.current = true;
    setExitModal(false);
    router.push("/");
  };

  const handleSaveAndExit = async () => {
    if (!user) { setIsLoginModalOpen(true); return; }
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    if (!attached) {
      // 계정에 진행 중인 다른 판이 있으면 조용히 덮지 않는다 — 바꿀지 묻는다.
      setIsSaving(true);
      const other = await loadActiveDraft(isSingleArtistMode);
      setIsSaving(false);
      if (isProtectedDraft(other)) { setExitModal(false); setReplaceAsk(true); return; }
    }
    await saveAndExit();
  };

  /** 이 판을 계정 초안으로 저장하고 나간다. 붙어 있지 않았으면 여기서 붙인다. */
  const saveAndExit = async () => {
    if (!user) return;
    if (!attached) {
      attachRun(isSingleArtistMode, user.id);
      tracksWrittenRef.current = false;
      setAttachedTo(user.id);
    }
    setIsSaving(true);
    const ok = await saveDraft(true);
    setIsSaving(false);
    trackEvent("tournament_exit", { action: ok ? "save" : "save_failed" });
    if (!ok) {
      alert(locale === "en" ? "Couldn't save. Please try again." : "저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    leave();
  };

  const handleDiscardAndExit = async () => {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_progress");
    clearActiveRun();
    // 계정 초안은 이 판의 것일 때만 지운다. 게스트로 한 판을 버리며 계정의 다른 판을 지우지 않는다.
    if (attached) await deleteActiveDraft(isSingleArtistMode);
    trackEvent("tournament_exit", { action: "discard" });
    leave();
  };

  // Clear active tournament drafts in Supabase when finished
  useEffect(() => {
    if (phase === "finished" && user && !isChallenge && winners.length > 0) {
      const clearDraft = async () => {
        // 이 판이 계정 초안이었을 때만 지운다(계정의 다른 판은 그대로).
        if (attached) await deleteActiveDraft(isSingleArtistMode);
        clearActiveRun();
        sessionStorage.removeItem("worldcup_progress");
        localStorage.removeItem("worldcup_progress");
      };
      clearDraft();
    }
  }, [phase, user, winners, eliminatedTracks, isChallenge, attached]);

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
      if (N === 2) roundName = "결승전";
      else if (N === 4) roundName = "준결승전";
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

  /**
   * 현재 매치를 끝내고 다음으로 넘어간다. 선택(handleDrop)과 빼기(handleRemove)가
   * 같이 쓴다. `removed` 면 진 곡은 순위(eliminated)가 아니라 뺀 곡(skipped)으로 간다.
   */
  const advance = (winner: Track, { removed = false }: { removed?: boolean } = {}) => {
       const newWinners = [...winners, winner];
       const loser = matches[currentMatchIndex].find(t => t.id !== winner.id);

       let newEliminated = [...eliminatedTracks];
       if (loser && !removed) newEliminated.unshift(loser);
       setEliminatedTracks(newEliminated);
       const newSkipped = loser && removed ? [...skippedTracks, loser] : skippedTracks;
       if (removed) setSkippedTracks(newSkipped);

       // Trigger GA4 match progress event
       const initialSize = getInitialRoundSize(tracks.length);
       const roundNum = getCurrentRoundNumber(currentRoundName, matches.length);

       // 선택 기록. 예선전은 라운드 크기를 음수로 구분한다.
       if (loser && !removed) {
         const isPlayin = currentRoundName.includes("예선전") || currentRoundName.includes("Play-in");
         setPicks(p => [...p, [isPlayin ? -roundNum : roundNum, winner.id, loser.id]]);
       }
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
           // 결과 화면의 자동 저장 기준(16곡)은 뺀 곡까지 센 원래 곡 수로 판단한다.
           sessionStorage.setItem("worldcup_skipped_count", String(newSkipped.length));
           // 매치별 선택 기록. 결과 저장(ResultScreen)이 tournament_results.picks 로 옮긴다.
           const lastPick: DraftPick | null = loser && !removed
             ? [currentRoundName.includes("예선전") ? -roundNum : roundNum, winner.id, loser.id] : null;
           sessionStorage.setItem("worldcup_picks", JSON.stringify(lastPick ? [...picks, lastPick] : picks));
           /*
            * 이 판이 어디서 시작했는지. 결과를 저장할 때 **내 임시저장을 지워도 되는지**
            * 를 이걸로 가른다. 로그인 상태로 끝냈으면 그동안 자동저장이 이 판을 적고
            * 있었으니 그 임시저장은 이 결과의 것이다. 게스트로 끝냈으면 계정에 있는
            * 임시저장은 **다른 판**이므로 건드리면 안 된다(나중에 로그인해도 마찬가지).
            */
           // "authenticated" 는 **이 판이 계정 초안에 붙어 있었다** 는 뜻이다. 로그인했어도 붙지
           // 않은 판이면 결과를 저장할 때 계정의 다른 판을 지우면 안 된다.
           sessionStorage.setItem("worldcup_run_origin", isChallenge ? "challenge" : attached ? "authenticated" : "guest");
           /*
            * 같이 소트하기 판이면 **어느 방의 어느 판인지** 묶어 결과 화면에 건넨다.
            * 결과 화면은 위의 `worldcup_ranking` 을 읽지 않는다 — 그건 출처가 없다.
            */
           if (isChallenge) {
             recordTogetherCompletion({
               ranking: finalRanking.map((t) => t.id),
               skipped: newSkipped.length,
               ownerUserId: user?.id ?? null,
             });
           }
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
  };

  const handleDrop = (winner: Track) => {
    if (pendingRemoval) return;
    setDroppedTrack(winner);
    setIsPlaying(true);

    // Play animation simulation
    setTimeout(() => {
      setIsPlaying(false);
      advance(winner);
    }, 1500);
  };

  /** 되돌리기를 기다리는 시간. 짧으면 실수를 못 잡고, 길면 흐름이 끊긴다. */
  const REMOVE_UNDO_MS = 3000;

  /**
   * 모르는 곡을 위로 올려 뺐다. 상대 곡이 자동 진출한다.
   *
   * 바로 확정하지 않고 되돌리기 카드를 잠깐 보여준다 — 위로 끄는 동작은 실수로도
   * 나오기 쉽다. 확정되면 로그인 사용자의 들어볼 곡 목록에 담는다.
   */
  const handleRemove = (track: Track) => {
    if (droppedTrack || pendingRemoval) return;
    const opponent = matches[currentMatchIndex].find(t => t.id !== track.id);
    if (!opponent) return;

    setPendingRemoval(track);
    trackEvent("tournament_track_removed", { round: currentRoundName, match: currentMatchIndex + 1 });

    removalTimer.current = setTimeout(() => {
      removalTimer.current = null;
      setPendingRemoval(null);
      if (user) {
        const albumId = (track as Track & { albumId?: string }).albumId;
        supabase
          .from("listen_later_tracks")
          .upsert(
            {
              user_id: user.id,
              track_id: track.id,
              title: track.title,
              artist_name: track.artistName,
              album_title: (track as Track & { albumTitle?: string }).albumTitle ?? null,
              album_image: track.albumImage,
              album_id: albumId ?? null,
              // 미발매곡은 tracks 화면에서 가상 앨범 id 'al_unreleased_<id>' 를 받는다.
              is_unreleased: !!albumId?.startsWith("al_unreleased_"),
            },
            { onConflict: "user_id,track_id", ignoreDuplicates: true }
          )
          .then(({ error }: { error: { message: string } | null }) => {
            // 목록 저장이 실패해도 월드컵 진행은 막지 않는다.
            if (error) console.error("[listen_later] 저장 실패:", error.message);
          });
      }
      advance(opponent, { removed: true });
    }, REMOVE_UNDO_MS);
  };

  const undoRemove = () => {
    if (removalTimer.current) clearTimeout(removalTimer.current);
    removalTimer.current = null;
    setPendingRemoval(null);
    trackEvent("tournament_track_remove_undo", {});
  };

  // 화면을 떠나면 확정 대기 중인 빼기를 버린다(되돌린 것과 같다).
  useEffect(() => () => {
    if (removalTimer.current) clearTimeout(removalTimer.current);
  }, []);

  if (phase === "loading") return <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center font-sans text-sm text-navy">{locale === "en" ? "Loading..." : "불러오는 중..."}</div>;

  if (phase === "finished") {
    const champion = winners[0];
    // 2위는 결승 대진에서 구한다. 결승을 "빼기"로 끝내면 진 곡은 eliminated 가 아니라
    // skipped 로 가서, eliminatedTracks[0] 은 준결승 탈락곡이 된다.
    const finalists = matches[matches.length - 1] ?? [];
    const rival = finalists.find((t) => t.id !== champion.id) ?? null;
    const rivalWasSkipped = !!rival && skippedTracks.some((t) => t.id === rival.id);
    return (
      <WinnerReveal
        champion={champion}
        runnerUp={rivalWasSkipped ? null : rival}
        championOnLeft={finalists[0]?.id === champion.id}
        totalTracks={tracks.length}
        isSingleArtistMode={isSingleArtistMode}
        /*
         * 1위 공개 문구에 넣을 이름. 로그인 계정의 닉네임을 먼저 쓰고, 없으면 같이
         * 소트하기에서 적어 둔 이름을 쓴다 — 그 판에서 남들에게 보이는 이름과 같아야 한다.
         * 둘 다 없으면 null 로 넘겨 문구에서 이름을 뺀다.
         */
        nickname={(user?.user_metadata?.nickname as string | undefined) || rememberedNickname() || null}
        locale={locale}
        onContinue={() => {
          // 같이 소트하기로 들어온 판이면 취향표 대신 일치율 화면으로 보낸다.
          const code = isChallenge ? sessionStorage.getItem("together_code") : null;
          router.push(code ? `/together/${code}/result` : isSingleArtistMode ? "/taste?mode=single" : "/taste");
        }}
      />
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full overflow-hidden bg-cream">
      {/* Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" onClick={() => setExitModal(true)} />
          <h1 className="type-title-1 text-navy">
            {locale === "en" ? "Taste World Cup" : "취향 월드컵"}
          </h1>
        </div>
        <ProfileHeader locale={locale} />
      </div>

      <div className="flex-[1] flex flex-col relative w-full h-full p-3 xs:p-4 overflow-y-auto pb-20 sm:pb-32">
        {phase === "playing" && matches[currentMatchIndex] && (
          <div className="flex flex-col items-center flex-1 w-full justify-between max-w-md mx-auto">
            
            {/* Match Info */}
            <div className="text-center mt-2 mb-2 xs:mb-3 sm:mb-4 w-full relative flex flex-col items-center">
               <div className="inline-block bg-navy/5 px-3 py-1 rounded-full mb-2 shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)]">
                 <p className="font-sans text-xs font-bold text-navy/80 tracking-wide">
                   {locale === "en" ? (
                     <>Match <span className="text-point newtone:text-point-ink">{currentMatchIndex + 1}</span> of {matches.length}</>
                   ) : (
                     <>총 {matches.length}매치 중 <span className="text-point newtone:text-point-ink">{currentMatchIndex + 1}번째</span></>
                   )}
                 </p>
               </div>

               {/* Visual Progress Bar */}
               <div className="w-48 h-1.5 bg-navy/10 rounded-full mb-3 overflow-hidden">
                 <div 
                   className="h-full bg-point transition-all duration-300 rounded-full" 
                   style={{ width: `${((currentMatchIndex + 1) / matches.length) * 100}%` }}
                 />
               </div>

               <h2 className="font-sans text-lg xs:text-xl sm:text-2xl md:text-3xl text-navy whitespace-nowrap tracking-tight leading-none font-extrabold">
                 {getLocalizedRoundName(currentRoundName, locale)}
               </h2>

               {/* 빼기 안내. LP 를 잡고 있을 때만 보인다. 위로 100px 이상 끌면 판정되는데
                   (WorldCupCandidate), 스크롤 영역이 영역 밖으로 나간 LP 를 잘라내므로
                   안내는 이 영역 안쪽에 둔다. */}
               <AnimatePresence>
                 {isAnyLpActive && (
                   <motion.p
                     initial={{ opacity: 0, y: 6 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: 6 }}
                     className="mt-3 px-4 py-1.5 rounded-full border border-dashed border-navy/30 bg-cream font-sans text-xs font-bold text-navy/70"
                   >
                     {locale === "en" ? "↑ Don't know it? Drag up to skip" : "↑ 모르는 곡이면 위로 올려 빼두기"}
                   </motion.p>
                 )}
               </AnimatePresence>
            </div>

            {/* Spacing to lower the candidate container and avoid overlap on short viewports */}
            <div className="flex-1 min-h-[12px] max-h-[40px]" />

            {/* Candidates (Forced Horizontal row with No-wrap & non-overlapping VS separator) */}
            <div className="flex flex-row flex-nowrap justify-center items-center gap-1 sm:gap-6 w-full px-1.5 relative z-50 min-h-[160px] sm:min-h-[220px] md:min-h-[240px] mb-2 sm:mb-6">
              <AnimatePresence mode="popLayout">
                {pendingRemoval && (
                  <motion.div
                    key="undo-remove"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center gap-3 w-full max-w-[320px] px-5 py-5 bg-cream border border-navy/15 rounded-2xl shadow-sm text-center"
                  >
                    <p className="font-sans text-sm text-navy leading-relaxed break-keep">
                      <strong className="font-bold">{pendingRemoval.title}</strong>
                      {locale === "en" ? " added to Listen Later." : " 을(를) 들어볼 곡에 담았어요."}
                      <br />
                      <span className="text-xs text-navy/60">
                        {locale === "en" ? "The other song moves on." : "상대 곡이 다음 라운드로 올라가요."}
                      </span>
                    </p>
                    <button
                      onClick={undoRemove}
                      className="px-5 py-2 rounded-full bg-brand text-cream font-sans text-sm font-bold active:scale-[0.97] transition-transform cursor-pointer"
                    >
                      {locale === "en" ? "Undo" : "되돌리기"}
                    </button>
                  </motion.div>
                )}
                {!droppedTrack && !pendingRemoval && (
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
                      <WorldCupCandidate track={matches[currentMatchIndex][0]} onDrop={handleDrop} onRemove={handleRemove} onActive={setIsAnyLpActive} />
                    </motion.div>

                    {/* Central VS Separator */}
                    <motion.div
                      key="vs-separator"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="shrink-0 italic text-navy/40 text-xl sm:text-3xl md:text-4xl font-black select-none px-1 py-6 sm:py-10"
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
                      <WorldCupCandidate track={matches[currentMatchIndex][1]} onDrop={handleDrop} onRemove={handleRemove} onActive={setIsAnyLpActive} />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex-1" />

            {/* Hint */}
            {!isPlaying && !droppedTrack && !pendingRemoval && (
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
                         <>더 좋아하는 곡의 커버를 <strong className={isAnyLpActive ? "text-white" : "text-point newtone:text-point-ink"}>꾹</strong> 눌러 선택해 주세요</>
                       )}
                     </span>
                  )}
                </motion.div>
            )}

            <div className="w-full relative z-10 pb-4 mt-4">
              <LPPlayer
                disc="soft" // 새 테마: 재킷이 주인공이라 판은 유리 약. 홈은 재킷 없이 늘 보여 유리 강(기본). legacy 무관
                isPlaying={isPlaying}
                currentTrack={droppedTrack}
                className={droppedTrack ? 'border-point shadow-[0_4px_25px_rgba(var(--t-point-rgb),0.3)]' : ''}
              />
            </div>
          </div>
        )}
      </div>

      {/* 나가기 확인 — 내 취향 스페이스와 같은 하단 시트. 글자는 type-* 토큰, 색은 docs/design-system/color.md */}
      {(() => {
        const total = getInitialRoundSize(tracks.length);
        const round = getLocalizedRoundName(currentRoundName, locale);
        const canSave = !isChallenge;
        const t = locale === "en" ? {
          title: "Leave the World Cup?",
          desc: canSave
            ? `You're at ${round} of ${total}.\nSave to keep it for 24 hours, or leave and lose it.`
            : `You're at ${round} of ${total}.\nLeaving now discards your picks.`,
          save: user ? "Save and leave" : "Log in to save",
          discard: "Leave without saving",
          keep: "Keep playing",
          saving: "Saving…",
        } : {
          title: "월드컵을 그만둘까요?",
          desc: canSave
            ? `${total}강 중 ${round}까지 진행했어요.\n임시저장하면 24시간 동안 보관되고, 저장하지 않으면 진행 내역이 사라져요.`
            : `${total}강 중 ${round}까지 진행했어요.\n나가면 지금까지 고른 곡이 저장되지 않아요.`,
          save: user ? "임시저장하고 나가기" : "로그인하고 임시저장하기",
          discard: "저장하지 않고 나가기",
          keep: "계속하기",
          saving: "저장하고 있어요…",
        };
        return (
          <Sheet
            open={exitModal}
            onClose={() => { if (!isSaving) setExitModal(false); }}
            closeLabel={t.keep}
            header={
              <>
                <h2 className="type-title-1 text-navy">{t.title}</h2>
                <p className="type-sub text-navy/70 mt-1 whitespace-pre-line break-keep">{t.desc}</p>
              </>
            }
            footer={
              <div className="flex flex-col gap-2">
                {canSave && (
                  <button disabled={isSaving} onClick={handleSaveAndExit} className={`${primaryButton} w-full`}>
                    {isSaving ? t.saving : t.save}
                  </button>
                )}
                <button disabled={isSaving} onClick={handleDiscardAndExit} className={`${dangerButton} w-full`}>
                  {t.discard}
                </button>
                <button disabled={isSaving} onClick={() => setExitModal(false)} className={`${textLink} self-center mt-2`}>
                  {t.keep}
                </button>
              </div>
            }
          />
        );
      })()}

      {/*
        * 계정에 진행 중인 다른 판이 있는데 이 판을 임시저장하려 한다. 계정에는 판이 하나만
        * 남으므로 조용히 덮지 않고 묻는다(UX-004). 취소하면 이 판을 계속한다.
        */}
      <ConfirmSheet
        open={replaceAsk}
        title={locale === "en" ? "Another World Cup is saved to your account" : "계정에 진행 중인 다른 소트가 있어요"}
        desc={locale === "en"
          ? "Saving this one replaces the World Cup saved to your account."
          : "지금 진행을 저장하면 계정에 임시저장된 소트가 이 소트로 바뀌어요."}
        confirmLabel={locale === "en" ? "Replace and save" : "바꾸고 저장하기"}
        cancelLabel={locale === "en" ? "Keep sorting" : "계속 소트하기"}
        danger
        busy={isSaving}
        onClose={() => { if (!isSaving) setReplaceAsk(false); }}
        onConfirm={async () => { await saveAndExit(); setReplaceAsk(false); }}
      />

      {/* 게스트가 임시저장을 누르면 로그인부터. 로그인되면 user 가 바뀌어 다시 누를 수 있다. */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        locale={locale}
        onSuccess={() => setIsLoginModalOpen(false)}
      />
    </main>
  );
}
