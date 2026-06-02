"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share2, Music, Archive, Check, X } from "lucide-react";
import Image from "next/image";
import * as htmlToImage from "html-to-image";
import SnakePathTimeline from "@/components/SnakePathTimeline";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { saveCompletedResult, fetchCompletedResultByArtist, overwriteCompletedResult } from "@/utils/worldcupDb";
import { EmotionalListTemplate, VintageVinylTemplate } from "@/components/TasteTemplates";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

export default function ResultPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [winners, setWinners] = useState<Track[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [isSavingArchive, setIsSavingArchive] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);
  const [cameraRig, setCameraRig] = useState<{xKeyframes: string[], yKeyframes: string[], scaleKeyframes: number[], times: number[]} | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [rawKeyframes, setRawKeyframes] = useState<{x: number, y: number}[]>([]);
  const [timelineViewBoxHeight, setTimelineViewBoxHeight] = useState(600);
  const [template, setTemplate] = useState<"pyramid" | "list" | "retro">("pyramid");
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [existingResult, setExistingResult] = useState<any | null>(null);
  const [archiveTitle, setArchiveTitle] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsSingleArtistMode(params.get("mode") === "single");
    }
  }, []);

  useEffect(() => {
    const storedRanking = sessionStorage.getItem("worldcup_ranking");
    if (!storedRanking) {
       router.replace("/tracks");
       return;
    }

    try {
      const parsedRanking = JSON.parse(storedRanking);
      if (!parsedRanking || parsedRanking.length === 0) {
         router.replace("/tracks");
         return;
      }
      setWinners(parsedRanking);
    } catch (e) {
      console.error(e);
      router.replace("/tracks");
    }
  }, []);

  useEffect(() => {
    if (winners.length === 0) return;

    let artistName = null;
    try {
      const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        if (parsed && parsed.length > 0) {
          artistName = parsed[0].name;
        }
      }
    } catch (e) {}

    const defaultTitle = isSingleArtistMode && artistName 
      ? `${artistName}의 곡 Sort` 
      : `${winners[0]?.artistName || ""} 취향표`;
      
    setArchiveTitle(defaultTitle.slice(0, 16));
  }, [winners, isSingleArtistMode]);

  const handleDownloadCSV = () => {
    if (winners.length === 0) return;
    
    // Add UTF-8 BOM to prevent Korean character encoding issues in MS Excel
    const csvRows = ["\uFEFFRank,Title,Artist"];
    winners.forEach((track, idx) => {
      const titleEscaped = track.title.replace(/"/g, '""');
      const artistEscaped = track.artistName.replace(/"/g, '""');
      csvRows.push(`${idx + 1},"${titleEscaped}","${artistEscaped}"`);
    });

    const csvContent = csvRows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const artistName = winners[0]?.artistName || "Artist";
    link.download = `${artistName}_Music_Taste_Ranking.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (winners.length === 0) return;
    setIsExporting(true);

    try {
      if (template === "pyramid") {
        const el = document.getElementById("export-pyramid-card");
        if (!el) throw new Error("Export element not found");
        
        const dataUrl = await htmlToImage.toPng(el, { 
           cacheBust: true, 
           pixelRatio: 3, // extremely high resolution
        });
        const link = document.createElement('a');
        link.download = `${winners[0]?.artistName || "Artist"}_Music_Taste_Pyramid.png`;
        link.href = dataUrl;
        link.click();
      } else {
        const pageSize = template === "list" ? 15 : 10;
        const totalPages = Math.ceil(winners.length / pageSize);

        let exportPages = [0]; // default: first page only
        
        if (totalPages > 1) {
          const confirmAll = window.confirm(`전체 랭킹(${winners.length}곡)을 인스타그램 스토리용 9:16 이미지 ${totalPages}장으로 나누어 다운로드하시겠습니까?\n\n(취소를 누르시면 TOP ${pageSize}이 있는 1페이지만 다운로드됩니다.)`);
          if (confirmAll) {
            exportPages = Array.from({ length: totalPages }, (_, i) => i);
          }
        }

        // Sequential exports with a slight delay to allow clean consecutive browser downloads
        for (let i = 0; i < exportPages.length; i++) {
          const pIdx = exportPages[i];
          const el = document.getElementById(`export-card-page-${pIdx}`);
          if (!el) continue;

          // Add a brief timeout to keep downloads ordered and prevent browser blocking
          await new Promise((resolve) => setTimeout(resolve, i * 450));

          const dataUrl = await htmlToImage.toPng(el, { 
             cacheBust: true, 
             pixelRatio: 3,
          });
          const link = document.createElement('a');
          link.download = `${winners[0]?.artistName || "Artist"}_Music_Taste_${template}_Part${pIdx + 1}.png`;
          link.href = dataUrl;
          link.click();
        }
      }
    } catch (err) {
      console.error('Failed to export image', err);
      alert('이미지 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsExporting(false);
    }
  };

  const executeSaveArchive = async (overwrite: boolean) => {
    if (!user) return;
    setIsSavingArchive(true);
    try {
      let artistId = null;
      let artistName = null;
      try {
        const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
        if (storedArtists) {
          const parsed = JSON.parse(storedArtists);
          if (parsed && parsed.length > 0) {
            artistId = parsed[0].id;
            artistName = parsed[0].name;
          }
        }
      } catch (e) {}

      const title = archiveTitle.trim() || (isSingleArtistMode && artistName 
        ? `${artistName}의 곡 Sort` 
        : `${winners[0]?.artistName || ""} 취향표`);

      let dbSuccess = false;
      if (overwrite && existingResult) {
        dbSuccess = await overwriteCompletedResult(existingResult.id, winners, winners.slice(1), title, { isPublic });
      } else {
        dbSuccess = await saveCompletedResult(winners, winners.slice(1), title, {
          isPublic,
          isSingleArtist: isSingleArtistMode,
          artistId,
          artistName
        });
      }

      if (!dbSuccess) throw new Error("Database save failed");

      // Clear active progress and wipe archives from user_metadata to prevent HTTP 431 cookie bloat
      const { error } = await supabase.auth.updateUser({
        data: {
          archives: null,
          worldcup_progress: null, // Clear active progress to free up cookie space
          worldcup_tracks: null
        }
      });
      
      if (error) throw error;
      
      setIsSaved(true);
      alert(overwrite ? "기존 기록을 성공적으로 갱신했습니다!" : "내 아카이브에 성공적으로 저장되었습니다!");
      setShowOverwriteModal(false);
    } catch (err) {
      console.error("Failed to save to archive:", err);
      alert("아카이브 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSavingArchive(false);
    }
  };

  const handleSaveToArchive = async () => {
    if (!user) return;
    setIsSavingArchive(true);

    try {
      let artistId = null;
      let artistName = null;
      try {
        const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
        if (storedArtists) {
          const parsed = JSON.parse(storedArtists);
          if (parsed && parsed.length > 0) {
            artistId = parsed[0].id;
            artistName = parsed[0].name;
          }
        }
      } catch (e) {}

      if (isSingleArtistMode && artistId) {
        const existing = await fetchCompletedResultByArtist(artistId);
        if (existing) {
          setExistingResult(existing);
          setShowOverwriteModal(true);
          setIsSavingArchive(false);
          return;
        }
      }

      await executeSaveArchive(false);
    } catch (e) {
      console.error(e);
      setIsSavingArchive(false);
    }
  };

  const handleExit = async () => {
    if (user && !isSaved) {
      const confirmExit = window.confirm("아직 취향표를 내 아카이브에 저장하지 않았습니다. 저장하지 않고 종료하시겠습니까?");
      if (!confirmExit) return;
    }

    // Clear active worldcup data so they start a new one next time
    sessionStorage.removeItem("worldcup_ranking");
    sessionStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_tracks");
    localStorage.removeItem("worldcup_progress");
    
    sessionStorage.removeItem("selectedArtists");
    localStorage.removeItem("selectedArtists");
    
    // Clear active progress from Supabase user_metadata so they don't get the popup next time
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: {
            worldcup_progress: null,
            worldcup_tracks: null,
            selected_artists: null
          }
        });
      } catch (err) {
        console.error("Error clearing active progress in Supabase:", err);
      }
    }

    window.location.href = "/";
  };

  const S = 3.8; // Restored 3.8x dramatic close-up zoom for immersive close-up tracking shots!
  const panDuration = Math.max(8.0, winners.length * 0.65); // Slower, highly legible cinematic tracking speed!
  const startDelay = 1.0; // Deliberate cinematic delay at the starting position to let vinyl records pop in
  const holdDuration = 1.5; // Freeze-frame focus hold on the #1 song
  const zoomOutDuration = 1.2; // Zoom out to reveal the full path
  const totalDuration = startDelay + panDuration + holdDuration + zoomOutDuration;

  // Resize observer and window resize listener to track exact width and height of the timeline viewport
  useEffect(() => {
    const el = timelineWrapperRef.current;
    if (!el) return;

    const updateDimensions = () => {
      if (timelineWrapperRef.current) {
        setDimensions({
          width: timelineWrapperRef.current.clientWidth,
          height: timelineWrapperRef.current.clientHeight
        });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(el);
    window.addEventListener("resize", updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  const handleLayoutComplete = useCallback((keyframes: {x: number, y: number}[], viewBoxHeight: number) => {
    setRawKeyframes(keyframes);
    setTimelineViewBoxHeight(viewBoxHeight);
  }, []);

  useEffect(() => {
    const K = rawKeyframes.length;
    if (K === 0) return;

    // Use measured dimensions, with conservative fallbacks if not yet measured
    const W = dimensions.width || (timelineWrapperRef.current ? timelineWrapperRef.current.clientWidth : 360) || 360;
    const H = dimensions.height || (timelineWrapperRef.current ? timelineWrapperRef.current.clientHeight : 500) || 500;

    // 화면에 하나씩만 보이도록, 선의 모든 Node와 코너를 완벽하게 정중앙에 위치하도록 X/Y 모두 픽셀 기반으로 절대 추적 (Drone Tracking)
    // S 배율 확대 공간 내에서의 절대 좌표 조정을 위해 가로/세로 이동 거리에 S(3.8) 배율 인자를 정확하게 곱해줍니다.
    const xKeyframes = rawKeyframes.map(k => `${S * W * (50 - k.x) / 100}px`);
    const yKeyframes = rawKeyframes.map(k => `${S * (H / 2 - k.y)}px`);

    // Distribute time proportionally based on path distance to track the line drawing evenly
    let totalDist = 0;
    const dists = [0];
    for (let i = 1; i < K; i++) {
       const dx = rawKeyframes[i].x - rawKeyframes[i-1].x;
       // Scale dy so it's visually proportional to dx (assuming ~9/16 aspect ratio on mobile)
       const dy_scaled = (rawKeyframes[i].y - rawKeyframes[i-1].y) * (100 * 16 / 9) / timelineViewBoxHeight;
       totalDist += Math.sqrt(dx*dx + dy_scaled*dy_scaled);
       dists.push(totalDist);
    }
    if (totalDist === 0) totalDist = 1;

    // Calculate time fractions for starting hold, panning, top hold, and final zoom out
    const startFraction = startDelay / totalDuration;
    const panFraction = panDuration / totalDuration;
    const holdFraction = holdDuration / totalDuration;

    const holdStartFraction = startFraction + panFraction;
    const holdEndFraction = holdStartFraction + holdFraction;

    // Build the times array
    const times = [
      0.0, // initial start position point
      ...dists.map(d => startFraction + (d / totalDist) * panFraction), // panning points
      holdEndFraction, // end of top focus hold
      1.0 // final zoom out point
    ];

    // Build extended keyframes for absolute control
    const firstX = xKeyframes[0];
    const firstY = yKeyframes[0];
    const finalX = xKeyframes[xKeyframes.length - 1];
    const finalY = yKeyframes[yKeyframes.length - 1];

    const extendedXKeyframes = [firstX, ...xKeyframes, finalX, "0px"];
    const extendedYKeyframes = [firstY, ...yKeyframes, finalY, "0px"];
    const scaleKeyframes = [S, ...xKeyframes.map(() => S), S, 1];

    setCameraRig({ 
      xKeyframes: extendedXKeyframes, 
      yKeyframes: extendedYKeyframes, 
      scaleKeyframes, 
      times 
    });
  }, [rawKeyframes, timelineViewBoxHeight, dimensions, winners.length]);

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">취향 기록표</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {}}
            className="w-10 h-10 rounded-full border border-navy/20 flex items-center justify-center hover:bg-navy/5 transition-colors"
            title="공유하기"
          >
            <Share2 size={18} className="text-navy" />
          </button>
          <button 
            onClick={handleExit}
            className="w-10 h-10 rounded-full border-2 border-navy flex items-center justify-center bg-white hover:bg-navy/5 transition-colors"
            title="종료하기"
          >
            <X size={18} className="text-navy font-bold" />
          </button>
        </div>
      </div>
      {/* Unboxed seamless full-screen results area */}
      <motion.div 
        layout
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // smooth spring-like layout ease
        ref={containerRef}
        className={showButton 
          ? "flex-1 w-full max-w-2xl relative bg-[#F5F2ED] flex flex-col min-h-screen py-4 px-2 sm:px-6 mx-auto pb-32 overflow-y-auto scrollbar-none" 
          : "fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 bg-[#F5F2ED] overflow-hidden flex flex-col"
        }
      >
         {/* Background Elements */}
         <div className="absolute inset-0 z-0 bg-[#F5F2ED]" />

         {/* Segmented Design Customization Selector */}
         {showButton && (
           <div className="relative z-30 w-full max-w-md mx-auto px-4 mt-2 mb-4 select-none">
             <div className="flex bg-[#1A2A6C]/5 p-1.5 rounded-2xl border border-[#1A2A6C]/10 backdrop-blur-sm gap-0.5">
               <button
                 onClick={() => setTemplate("pyramid")}
                 className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${
                   template === "pyramid" 
                     ? "bg-white text-navy shadow-sm" 
                     : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                 }`}
               >
                 📐 피라미드형
               </button>
               <button
                 onClick={() => setTemplate("list")}
                 className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${
                   template === "list" 
                     ? "bg-white text-navy shadow-sm" 
                     : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                 }`}
               >
                 📜 감성 리스트형
               </button>
               <button
                 onClick={() => setTemplate("retro")}
                 className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${
                   template === "retro" 
                     ? "bg-white text-navy shadow-sm" 
                     : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                 }`}
               >
                 📻 레코드형
               </button>
             </div>
           </div>
         )}

         {/* Floating Skip Button for Cinematic Zoom-in Animation */}
         {!showButton && (
           <button
             onClick={() => setShowButton(true)}
             className="absolute top-4 right-4 z-50 px-3.5 py-1.5 bg-white/90 hover:bg-white text-navy hover:text-point font-bold text-xs rounded-full border border-navy/15 hover:border-point/40 shadow-md backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1"
           >
             스킵 Skip ⏭️
           </button>
         )}

          <motion.div 
            layout 
            ref={timelineWrapperRef}
            className={`relative z-10 w-full mt-4 ${
              showButton ? "h-auto overflow-visible pb-20" : "flex-1 overflow-hidden"
            }`}
          >
             {winners.length > 0 && (
               <>
                 {/* 1. Pyramid Template */}
                 {template === "pyramid" && (
                   <motion.div
                     initial={cameraRig ? { scale: S, x: cameraRig.xKeyframes[0], y: cameraRig.yKeyframes[0] } : false}
                     animate={showButton ? { scale: 1, x: "0px", y: "0px" } : (cameraRig ? { 
                        scale: cameraRig.scaleKeyframes, 
                        x: cameraRig.xKeyframes,
                        y: cameraRig.yKeyframes
                     } : {})}
                     transition={showButton ? { duration: 0.1 } : { 
                        duration: totalDuration, 
                        times: cameraRig?.times,
                        ease: "linear"
                     }}
                     className={showButton ? "w-full origin-center" : "w-full h-full origin-center"}
                     style={showButton ? { height: timelineViewBoxHeight } : {}}
                     onAnimationComplete={() => {
                       if (!showButton) setShowButton(true);
                     }}
                   >
                      <SnakePathTimeline 
                         tracks={winners} 
                         drawDuration={panDuration} 
                         onLayoutComplete={handleLayoutComplete} 
                         isCompleted={showButton}
                      />
                   </motion.div>
                 )}

                 {/* 2. Emotional List Template */}
                 {showButton && template === "list" && (
                   <div className="w-full max-w-md mx-auto">
                     <EmotionalListTemplate tracks={winners} />
                   </div>
                 )}

                 {/* 3. Vintage Vinyl Template */}
                 {showButton && template === "retro" && (
                   <div className="w-full max-w-md mx-auto">
                     <VintageVinylTemplate tracks={winners} />
                   </div>
                 )}
               </>
             )}
          </motion.div>
      </motion.div>

      {/* Floating Actions */}
      <AnimatePresence>
         {showButton && (
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="fixed bottom-0 left-0 right-0 p-6 flex flex-col items-center gap-3 z-50 pointer-events-none"
           >
             {user && !isSaved && (
                <div className="w-full max-w-[380px] pointer-events-auto bg-[#FAF7F2]/90 backdrop-blur-sm border-2 border-navy/15 rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm z-30 mb-0.5 select-none text-left">
                  <div className="flex flex-col text-left">
                    <label htmlFor="archive-title-input" className="font-sans font-bold text-xs text-navy">아카이브 저장명</label>
                    <span className="font-sans text-[9px] text-charcoal/60 leading-none mt-1">기록될 나만의 취향표 제목을 입력해주세요.</span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      id="archive-title-input"
                      type="text"
                      maxLength={16}
                      value={archiveTitle}
                      onChange={(e) => setArchiveTitle(e.target.value)}
                      placeholder="제목을 입력하세요 (최대 16자)"
                      className="w-full px-3.5 py-2.5 bg-white border border-navy/20 focus:border-point focus:ring-1 focus:ring-point rounded-xl font-sans text-sm text-navy placeholder-charcoal/30 transition-all pr-12 focus:outline-none"
                    />
                    <span className="absolute right-3.5 font-sans text-[10px] font-bold text-charcoal/40 select-none">
                      {archiveTitle.length}/16
                    </span>
                  </div>
                </div>
              )}

             {user && (
               <div className="w-full max-w-[380px] pointer-events-auto bg-[#FAF7F2]/90 backdrop-blur-sm border-2 border-navy/15 rounded-2xl px-4 py-2 flex items-center justify-between shadow-sm z-30 mb-1 select-none">
                 <div className="flex flex-col text-left">
                   <span className="font-sans font-bold text-xs text-navy">취향 순위표 전체 공개</span>
                   <span className="font-sans text-[9px] text-charcoal/60 leading-none mt-0.5">비슷한 취향의 메이트 찾기에 사용됩니다.</span>
                 </div>
                 <button
                   type="button"
                   onClick={() => setIsPublic(p => !p)}
                   className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isPublic ? "bg-point" : "bg-navy/20"}`}
                 >
                   <span
                     className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPublic ? "translate-x-5" : "translate-x-0"}`}
                   />
                 </button>
               </div>
             )}

             {user && (
               <button 
                 onClick={handleSaveToArchive}
                 disabled={isSavingArchive || isSaved}
                 className={`w-full max-w-[380px] pointer-events-auto py-3.5 rounded-full font-sans font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2
                   ${isSaved 
                     ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-500/30 cursor-default' 
                     : 'bg-white border-2 border-navy text-navy hover:bg-navy/5'
                   }
                 `}
               >
                  {isSaved ? (
                    <>
                      <Check size={18} />
                      아카이브 저장 완료
                    </>
                  ) : (
                    <>
                      <Archive size={18} />
                      {isSavingArchive ? "아카이브 저장 중..." : "내 아카이브에 저장"}
                    </>
                  )}
                </button>
              )}
              
              <div className="w-full max-w-[380px] flex gap-2 pointer-events-auto shadow-lg rounded-full">
                <button 
                  onClick={handleDownloadCSV}
                  className="flex-1 py-4 bg-[#0F766E] hover:bg-[#0D625B] text-white font-sans font-bold text-xs border border-teal-800/20 rounded-l-full flex items-center justify-center gap-1 transition-all active:scale-[0.98] cursor-pointer"
                  title="Microsoft Excel / Google Sheets용 CSV 파일 저장"
                >
                   Excel 저장
                </button>
                
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className={`flex-[2] py-4 bg-navy text-cream font-sans font-bold text-xs border border-navy/20 rounded-r-full flex items-center justify-center gap-1 transition-all active:scale-[0.98] cursor-pointer ${isExporting ? 'opacity-70' : 'hover:bg-[#111A3E]'}`}
                >
                   <Download size={14} />
                   {isExporting ? "스토리 저장 중..." : "인스타 스토리 저장"}
                </button>
              </div>
            </motion.div>
          )}
       </AnimatePresence>

      {/* Overwrite Choice Dialog Modal */}
      <AnimatePresence>
        {showOverwriteModal && existingResult && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOverwriteModal(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-sm rounded-[2rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-4 mt-2 bg-point/5 shadow-[4px_4px_0_rgba(26,42,108,0.1)]">
                  <Archive className="text-point animate-bounce" size={24} />
                </div>
                
                <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">이전 기록이 있습니다!</h2>
                <p className="font-sans text-charcoal/80 text-xs leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  해당 아티스트로 이미 완료된 Sort 결과가 아카이브에 존재합니다. 기존 기록을 갱신하시겠습니까, 아니면 별도의 기록으로 새로 추가하여 저장하시겠습니까?
                </p>
                
                <div className="flex flex-col gap-2 w-full">
                  <button 
                    onClick={() => executeSaveArchive(true)}
                    className="w-full py-3.5 bg-navy text-cream font-bold text-sm rounded-xl hover:bg-navy/90 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
                  >
                    기존 기록 갱신하기 (Overwrite)
                  </button>
                  <button 
                    onClick={() => executeSaveArchive(false)}
                    className="w-full py-3.5 bg-white border-2 border-navy/20 text-navy font-bold text-sm rounded-xl hover:bg-navy/5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    새로운 기록으로 추가 (Save New)
                  </button>
                  <button 
                    onClick={() => setShowOverwriteModal(false)}
                    className="w-full py-3 bg-white border border-red-200 text-red-500 font-medium text-xs rounded-xl hover:bg-red-50/50 transition-all cursor-pointer mt-1"
                  >
                    취소
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      {/* Offscreen High-Fidelity 9:16 Instagram Story Export Cards */}
      {winners.length > 0 && (
        <div 
          className="absolute top-[-9999px] left-[-9999px] pointer-events-none select-none"
          style={{ width: "450px" }}
        >
          {/* 1. Pyramid Export Card (Uses computed scale factor to fit all songs in a single card) */}
          {(() => {
            const scaleFactor = Math.min(1.0, 600 / timelineViewBoxHeight);
            return (
              <div 
                id="export-pyramid-card"
                className="w-[450px] h-[800px] bg-[#F5F2ED] relative flex flex-col justify-between p-7 overflow-hidden"
              >
                {/* Header */}
                <div className="text-center flex flex-col items-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy/5 text-navy mb-1.5">
                    <Music size={16} />
                  </div>
                  <h3 className="font-serif text-2xl text-navy leading-none tracking-tight">My Taste</h3>
                  <p className="font-sans font-bold text-[7px] uppercase tracking-[0.2em] text-[#E67E22] mt-1">The Analog Record Shop</p>
                </div>

                {/* Vector Scaled Timeline Container */}
                <div className="relative flex-1 w-full my-3 overflow-hidden" style={{ height: "600px" }}>
                  <div 
                    style={{
                      width: `${100 / scaleFactor}%`,
                      height: `${timelineViewBoxHeight}px`,
                      transform: `scale(${scaleFactor})`,
                      transformOrigin: "top center",
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      marginLeft: `-${50 / scaleFactor}%`
                    }}
                  >
                    <SnakePathTimeline 
                      tracks={winners} 
                      drawDuration={0.1}
                      isCompleted={true}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-navy/15 pt-2 flex items-center justify-between text-navy/40 text-[9px] font-bold">
                  <span className="font-serif">The Record Shop</span>
                  <span className="font-sans uppercase tracking-wider">Total {winners.length} tracks</span>
                </div>
              </div>
            );
          })()}

          {/* 2. Paginated Export Cards for List and Retro Templates */}
          {(() => {
            const pageSize = template === "list" ? 15 : 10;
            const totalPages = Math.ceil(winners.length / pageSize);
            return Array.from({ length: totalPages }).map((_, pIdx) => (
              <div 
                key={`export-page-${pIdx}`}
                id={`export-card-page-${pIdx}`}
                className="w-[450px] h-[800px] bg-[#FAF7F2] relative flex flex-col justify-between overflow-hidden"
              >
                {template === "list" ? (
                  <EmotionalListTemplate 
                    tracks={winners} 
                    isExport 
                    pageIndex={pIdx} 
                    pageSize={15} 
                  />
                ) : (
                  <VintageVinylTemplate 
                    tracks={winners} 
                    isExport 
                    pageIndex={pIdx} 
                    pageSize={10} 
                  />
                )}
              </div>
            ));
          })()}
        </div>
      )}
    </main>
  );
}
