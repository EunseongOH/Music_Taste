"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share2, Music } from "lucide-react";
import Image from "next/image";
import * as htmlToImage from "html-to-image";
import SnakePathTimeline from "@/components/SnakePathTimeline";
import BackButton from "@/components/BackButton";

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

export default function ResultPage() {
  const router = useRouter();
  const [winners, setWinners] = useState<Track[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cameraRig, setCameraRig] = useState<{xKeyframes: string[], yKeyframes: string[], times: number[]} | null>(null);

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

  const handleExport = async () => {
    if (!containerRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await htmlToImage.toPng(containerRef.current, { 
         cacheBust: true, 
         pixelRatio: 2,
         style: { transform: 'scale(1)', borderRadius: '0' } // fix for some rounded corner cutoffs
      });
      const link = document.createElement('a');
      link.download = 'music_taste_result.png';
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export image', err);
      alert('이미지 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsExporting(false);
    }
  };

  const rowCount = Math.max(1, Math.ceil(winners.length / 3) + 1);
  const S = Math.max(2.5, rowCount / 2); // Deeper zoom for cinematic tracking!
  const panDuration = Math.max(5, winners.length * 0.3); // Path drawing time
  const totalDuration = panDuration + 1.5; // Path + Zoom out

  const handleLayoutComplete = (keyframes: {x: number, y: number}[], viewBoxHeight: number) => {
    const K = keyframes.length;
    if (K === 0) return;
    
    const xKeyframes = keyframes.map(k => `${50 - k.x}%`);
    const yKeyframes = keyframes.map(k => `${50 - (k.y / viewBoxHeight * 100)}%`);
    
    // Distribute time proportionally to track the line drawing evenly
    const fraction = panDuration / totalDuration;
    const times = keyframes.map((_, i) => (i / (K - 1)) * fraction);
    times.push(1); // Final zoom out point

    setCameraRig({ xKeyframes, yKeyframes, times });
  };

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">취향 기록표</h1>
        </div>
        <button 
          onClick={() => {}}
          className="w-10 h-10 rounded-full border border-navy/20 flex items-center justify-center hover:bg-navy/5 transition-colors"
        >
          <Share2 size={18} className="text-navy" />
        </button>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
         {/* Instruction / Top Section */}
         <div className="p-6 text-center">
            <h2 className="font-serif text-2xl text-navy">My Music Taste</h2>
            <p className="font-sans text-sm text-charcoal/70 mt-1">
               월드컵 결과, 나의 최애 곡들입니다.
            </p>
         </div>

         {/* 9:16 Canvas Area */}
         <div className="px-0 sm:px-4 flex justify-center w-full relative z-50">
            <motion.div 
              layout
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // smooth spring-like layout ease
              ref={containerRef}
              className={showButton 
                ? "w-full max-w-md aspect-[9/16] relative bg-[#F5F2ED] rounded-[2rem] shadow-xl overflow-hidden border-4 border-navy border-opacity-10" 
                : "fixed inset-0 z-50 bg-[#F5F2ED] overflow-hidden flex flex-col pt-12 sm:pt-0"
              }
            >
               {/* Background Elements */}
               <div className="absolute inset-0 z-0 bg-[#F5F2ED]" />

               {/* Header inside the image */}
               <motion.div layout className="relative z-10 pt-10 px-6 text-center bg-gradient-to-b from-[#F5F2ED] via-[#F5F2ED]/80 to-transparent pb-8">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-navy/5 text-navy mb-3">
                     <Music size={24} />
                  </div>
                  <h3 className="font-serif text-4xl text-navy mb-1 leading-tight tracking-tighter">My Taste</h3>
                  <p className="font-sans font-bold text-[10px] uppercase tracking-[0.2em] text-point">The Analog Record Shop</p>
               </motion.div>

               {/* Timeline Content */}
               <motion.div layout className="relative z-10 flex-1 w-full h-[calc(100%-120px)] mt-4">
                  {winners.length > 0 && (
                    <motion.div
                      initial={cameraRig ? { scale: S, x: cameraRig.xKeyframes[0], y: cameraRig.yKeyframes[0] } : false}
                      animate={cameraRig ? { 
                        scale: [...cameraRig.xKeyframes.map(() => S), 1], 
                        x: [...cameraRig.xKeyframes, "0%"],
                        y: [...cameraRig.yKeyframes, "0%"]
                      } : {}}
                      transition={{ 
                        duration: totalDuration, 
                        times: cameraRig?.times,
                        ease: "linear"
                      }}
                      className="w-full h-full origin-center"
                      onAnimationComplete={() => setShowButton(true)}
                    >
                      <SnakePathTimeline 
                         tracks={winners} 
                         drawDuration={panDuration} 
                         onLayoutComplete={handleLayoutComplete} 
                      />
                    </motion.div>
                  )}
               </motion.div>
            </motion.div>
         </div>

         {/* Floating Actions */}
         <AnimatePresence>
            {showButton && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-50 pointer-events-none"
              >
                 <button 
                   onClick={handleExport}
                   disabled={isExporting}
                   className={`w-full max-w-[380px] pointer-events-auto py-4 rounded-full bg-navy text-cream font-sans font-bold text-lg shadow-[0_10px_30px_rgba(26,42,108,0.3)] border border-navy/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${isExporting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-navy/90 hover:-translate-y-1'}`}
                 >
                    <Download size={20} className="mr-1" />
                    {isExporting ? "이미지 저장 중..." : "인스타그램 스토리 이미지 저장"}
                 </button>
              </motion.div>
            )}
         </AnimatePresence>
      </div>
    </main>
  );
}
