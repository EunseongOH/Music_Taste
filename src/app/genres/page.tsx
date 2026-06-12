"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Disc, Music, Check, ArrowRight } from "lucide-react";
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
  { id: "k-pop", name: "K-Pop", engName: "Korean Pop", color: "#E67E22" },
  { id: "pop", name: "해외 팝", engName: "Global Pop", color: "#1ABC9C" },
  { id: "korean hip hop", name: "국내 힙합", engName: "K-Hip Hop", color: "#9B59B6" },
  { id: "hip hop", name: "해외 힙합", engName: "Global Hip Hop", color: "#8E44AD" },
  { id: "korean r&b", name: "국내 R&B", engName: "K-R&B", color: "#F1C40F" },
  { id: "r&b", name: "해외 R&B", engName: "Global R&B", color: "#F39C12" },
  { id: "korean rock", name: "국내 록", engName: "K-Rock", color: "#E74C3C" },
  { id: "rock", name: "해외 록", engName: "Global Rock", color: "#C0392B" },
  { id: "korean indie", name: "국내 인디", engName: "K-Indie", color: "#34495E" },
  { id: "indie", name: "해외 인디", engName: "Global Indie", color: "#2C3E50" },
  { id: "electronic", name: "일렉트로닉", engName: "Electronic", color: "#2ECC71" },
  { id: "jazz", name: "재즈", engName: "Jazz", color: "#D35400" },
  { id: "ballad", name: "발라드", engName: "K-Ballad", color: "#2980B9" },
  { id: "trot", name: "트로트", engName: "K-Trot", color: "#9B59B6" },
  { id: "j-pop", name: "J-Pop", engName: "Japanese Pop", color: "#C0392B" },
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

      // Load previously selected genres if any
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
      // Sync to storages immediately
      sessionStorage.setItem("selected_genres", JSON.stringify(updated));
      localStorage.setItem("selected_genres", JSON.stringify(updated));
      return updated;
    });
  };

  const handleNext = () => {
    if (selectedGenres.length < 3) return;
    
    // Trigger GA4 funnel event with comma-separated genres string
    trackEvent("funnel_genre_complete", { 
      selected_genres_count: selectedGenres.length,
      selected_genres: selectedGenres.join(",")
    });

    // Track each selected genre individually for aggregate bar charts in GA4
    selectedGenres.forEach(genreId => {
      trackEvent("select_genre", { genre_id: genreId });
    });

    // Sync to storage (best-effort; may be in-memory if sandboxed)
    sessionStorage.setItem("selected_genres", JSON.stringify(selectedGenres));
    localStorage.setItem("selected_genres", JSON.stringify(selectedGenres));
    
    // ALSO encode genres in URL query params so they survive storage sandbox restrictions
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
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 20 } },
  };

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-28 bg-[var(--app-bg)]">
      {/* Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-3 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/5 flex items-center justify-between shadow-sm">
        <BackButton onClick={handleBackClick} className="border-none bg-transparent hover:bg-navy/5 w-9 h-9 shadow-none m-0 p-0 relative top-auto left-auto font-bold" />
        <ProfileHeader locale={locale} className="!relative !top-auto !right-auto" />
      </div>

      {/* Main Intro */}
      <div className="text-left mt-6 mb-8">
        <h1 className="font-serif text-[1.6rem] sm:text-3xl text-navy tracking-tight leading-snug font-bold">
          {locale === "ko" ? (
            <>
              선호하는 음악 장르를
              <br />
              골라주세요
            </>
          ) : (
            "Select your favorite genres"
          )}
        </h1>
        <p className="font-sans text-charcoal/90 font-medium text-sm sm:text-base mt-2">
          {locale === "ko" ? "최소 3개의 장르를 선택해 주세요." : "Please select at least 3 genres."}
        </p>
      </div>

      {/* Genres Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-3"
      >
        {GENRES.map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          const primaryName = locale === "ko" ? genre.name : genre.engName;
          const secondaryName = locale === "ko" ? genre.engName : genre.name;
          
          return (
            <motion.div
              key={genre.id}
              variants={itemVariants}
              onClick={() => handleGenreClick(genre.id)}
              className={`relative bg-[#FAF7F2] border-3 rounded-[1.5rem] p-3 py-4 flex flex-col items-center justify-between text-center cursor-pointer select-none transition-all duration-300 min-h-[140px] shadow-sm hover:shadow-md ${
                isSelected 
                  ? "border-point bg-[#FAF7F2] scale-102 ring-2 ring-point/20" 
                  : "border-navy hover:border-navy/70"
              }`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Spinning Vinyl Vinyl disc Graphic */}
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <motion.div
                  animate={isSelected ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center border border-navy/10 relative shadow-sm ${
                    isSelected ? "bg-navy" : "bg-charcoal/10"
                  }`}
                >
                  <Disc className={isSelected ? "text-cream" : "text-charcoal/50"} size={28} />
                  {/* Vinyl Label */}
                  <div 
                    className="absolute w-4 h-4 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border"
                    style={{ 
                      backgroundColor: isSelected ? genre.color : "#FAF7F2",
                      borderColor: isSelected ? "#FAF7F2" : "#2D3436"
                    }}
                  />
                </motion.div>
                
                {/* Micro selection check mark */}
                {isSelected && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-point rounded-full border-2 border-cream flex items-center justify-center shadow-sm"
                  >
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </motion.div>
                )}
              </div>

              {/* Genre Texts */}
              <div className="mt-3 flex flex-col items-center w-full px-1">
                <span className={`font-serif text-[13px] leading-tight font-bold text-center break-keep w-full ${isSelected ? "text-navy" : "text-charcoal"}`}>
                  {primaryName}
                </span>
                <span className="font-sans text-[9px] text-charcoal/40 font-medium uppercase mt-1 tracking-wider text-center break-words w-full leading-tight">
                  {secondaryName}
                </span>
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
            className="fixed bottom-0 left-0 right-0 z-40 w-full bg-[#F5F2ED]/98 border-t-[2.5px] border-navy/15 pt-4 pb-7 px-6 shadow-[0_-10px_35px_rgba(26,42,108,0.12)] backdrop-blur-md"
          >
            <div className="w-full max-w-[380px] mx-auto flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="font-sans text-[11px] font-bold text-navy/70 tracking-tight">
                  {locale === "ko" ? "선택한 음악 장르" : "Selected Genres"}
                </span>
                <span className="bg-point text-white text-[9px] px-2.5 py-0.5 rounded-full font-bold">
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
                      className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-base shadow-xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors cursor-pointer"
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
