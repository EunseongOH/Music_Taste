"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Disc, ArrowRight } from "lucide-react";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { trackEvent } from "@/utils/gtag";

interface GenreItem {
  id: string;
  name: string;
  engName: string;
  color: string;
}

const GENRES: GenreItem[] = [
  { id: "k-pop", name: "K-Pop", engName: "K-Pop", color: "#E67E22" },
  { id: "pop", name: "해외 팝", engName: "Pop", color: "#1ABC9C" },
  { id: "korean hip hop", name: "국내 힙합", engName: "K-Hip Hop", color: "#9B59B6" },
  { id: "hip hop", name: "해외 힙합", engName: "Hip Hop", color: "#8E44AD" },
  { id: "korean r&b", name: "국내 R&B", engName: "K-R&B", color: "#F1C40F" },
  { id: "r&b", name: "해외 R&B", engName: "R&B", color: "#F39C12" },
  { id: "korean rock", name: "국내 록", engName: "K-Rock", color: "#E74C3C" },
  { id: "rock", name: "해외 록", engName: "Rock", color: "#C0392B" },
  { id: "korean indie", name: "국내 인디", engName: "K-Indie", color: "#34495E" },
  { id: "indie", name: "해외 인디", engName: "Indie", color: "#2C3E50" },
  { id: "electronic", name: "일렉트로닉", engName: "Electronic", color: "#2ECC71" },
  { id: "jazz", name: "재즈", engName: "Jazz", color: "#D35400" },
  { id: "ballad", name: "발라드", engName: "K-Ballad", color: "#2980B9" },
  { id: "trot", name: "트로트", engName: "K-Trot", color: "#9B59B6" },
  { id: "j-pop", name: "J-Pop", engName: "J-Pop", color: "#C0392B" },
  { id: "classical", name: "클래식", engName: "Classical", color: "#7F8C8D" },
];

export default function GenresPage() {
  const router = useRouter();
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsSingleArtistMode(params.get("mode") === "single");

      const stored = sessionStorage.getItem("selected_genres") || localStorage.getItem("selected_genres");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSelectedGenres(parsed);
          }
        } catch (e) {}
      }

      setLocale(getSafeLocale());
    }
  }, []);

  const handleGenreClick = (id: string) => {
    setSelectedGenres((prev) => {
      let updated;
      if (prev.includes(id)) {
        updated = prev.filter((g) => g !== id);
      } else {
        updated = [...prev, id];
      }
      sessionStorage.setItem("selected_genres", JSON.stringify(updated));
      localStorage.setItem("selected_genres", JSON.stringify(updated));
      return updated;
    });
  };

  const handleNext = () => {
    if (selectedGenres.length < 3) return;
    
    trackEvent("funnel_genre_complete", { 
      selected_genres_count: selectedGenres.length,
      selected_genres: selectedGenres.join(",")
    });

    selectedGenres.forEach(genreId => {
      trackEvent("select_genre", { genre_id: genreId });
    });

    sessionStorage.setItem("selected_genres", JSON.stringify(selectedGenres));
    localStorage.setItem("selected_genres", JSON.stringify(selectedGenres));
    
    const genresParam = encodeURIComponent(JSON.stringify(selectedGenres));
    const modeQs = isSingleArtistMode ? "&mode=single" : "";
    router.push(`/explore?genres=${genresParam}${modeQs}`);
  };

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push("/");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 280, damping: 22 } },
  };

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-28 bg-[var(--app-bg)]">
      {/* Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-3 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/5 flex items-center justify-between shadow-sm">
        <BackButton onClick={handleBackClick} className="border-none bg-transparent hover:bg-navy/5 w-9 h-9 shadow-none m-0 p-0 relative top-auto left-auto font-bold" />
        <ProfileHeader locale={locale} className="ml-auto !relative !top-auto !right-auto" />
      </div>

      {/* Main Intro */}
      <div className="text-left mt-6 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-navy/5 rounded-full mb-3 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)]">
          <Disc size={13} className="text-point" />
          <span className="font-sans text-xs font-bold text-navy/80">
            {locale === "ko" ? `선택: ${selectedGenres.length} / 최소 3개` : `Selected: ${selectedGenres.length} / Min 3`}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl text-navy tracking-tight leading-snug font-bold">
          {locale === "ko" ? "선호하는 음악 장르를 골라주세요" : "Select your favorite music genres"}
        </h1>
        <p className="font-sans text-xs sm:text-sm text-charcoal/70 mt-1.5 leading-relaxed">
          {locale === "ko" ? "LP 레코드를 터치하여 좋아하는 음악 취향을 담아보세요." : "Tap LP sleeves to select your favorite music tastes."}
        </p>
      </div>

      {/* Option A: Analog LP Record Sleeve Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 gap-4"
      >
        {GENRES.map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          const genreName = locale === "ko" ? genre.name : genre.engName;
          
          return (
            <motion.div
              key={genre.id}
              variants={itemVariants}
              onClick={() => handleGenreClick(genre.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="relative cursor-pointer select-none pt-3"
            >
              {/* The LP Record Disc (Slides out top-right when selected) */}
              <motion.div
                animate={{
                  x: isSelected ? 18 : 6,
                  y: isSelected ? -14 : -2,
                  rotate: isSelected ? 18 : 0,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute top-0 right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#1c1c1c] border-2 border-navy/30 shadow-md flex items-center justify-center z-0 pointer-events-none"
              >
                {/* Vinyl Grooves */}
                <div className="absolute inset-1.5 rounded-full border border-white/10" />
                <div className="absolute inset-3 rounded-full border border-white/10" />
                
                {/* Vinyl Center Colored Label */}
                <div 
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white/30 flex items-center justify-center shadow-inner"
                  style={{ backgroundColor: genre.color }}
                >
                  <div className="w-2 h-2 rounded-full bg-[#FAF7F2] border border-black/20" />
                </div>
              </motion.div>

              {/* The Record Sleeve Box */}
              <div 
                className={`relative z-10 bg-[#FAF7F2] rounded-2xl p-3.5 sm:p-4 border-[3px] transition-all duration-300 h-[110px] flex flex-col justify-between ${
                  isSelected 
                    ? "border-point shadow-sm" 
                    : "border-navy hover:border-navy/70 shadow-sm"
                }`}
              >
                {/* Top Row: Genre Name */}
                <div className="flex items-center w-full">
                  <span className="text-sm sm:text-base font-bold text-navy tracking-tight leading-none whitespace-nowrap">
                    {genreName}
                  </span>
                </div>

                {/* Bottom Row: Vinyl Groove Line Indicator & Tag */}
                <div className="flex items-center justify-between border-t border-navy/10 pt-2 w-full">
                  <span className="font-sans text-[9px] sm:text-[10px] font-bold text-navy/40 uppercase tracking-wider whitespace-nowrap">
                    {genre.engName}
                  </span>
                  <div 
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border border-navy/20 shrink-0"
                    style={{ backgroundColor: genre.color }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Floating Action Dock */}
      <AnimatePresence>
        {selectedGenres.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-40 w-full bg-cream/95 border-t border-navy/15 pt-3.5 pb-7 px-6 shadow-[0_-10px_35px_rgba(26,42,108,0.12)] backdrop-blur-md"
          >
            <div className="w-full max-w-[380px] mx-auto flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="font-sans text-xs font-bold text-navy/70">
                  {locale === "ko" ? "선택한 장르" : "Selected Genres"}
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  selectedGenres.length >= 3 ? "bg-point text-white" : "bg-navy/10 text-navy"
                }`}>
                  {locale === "ko" ? `${selectedGenres.length}개 선택됨` : `${selectedGenres.length} selected`}
                </span>
              </div>
              
              <AnimatePresence>
                {selectedGenres.length >= 3 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, height: 0 }}
                    animate={{ opacity: 1, scale: 1, height: "auto" }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      onClick={handleNext}
                      className="w-full py-3.5 rounded-full bg-brand text-cream font-sans font-bold text-base shadow-lg border border-navy/20 hover:bg-brand/90 active:scale-[0.98] transition-all cursor-pointer inline-flex items-center justify-center gap-2 leading-none"
                    >
                      {locale === "ko" ? "아티스트 탐색하기" : "Explore Artists"}
                      <ArrowRight size={16} strokeWidth={2.5} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
