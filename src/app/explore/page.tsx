"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Disc, X, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { searchSpotifyArtists, getInitialArtists, getRelatedArtists } from "@/utils/spotify";
import { saveArtistSelectionDraft, loadActiveDraft, deleteActiveDraft } from "@/utils/worldcupDb";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";

interface Artist {
  id: string;
  name: string;
  image: string;
  type: "main" | "similar";
  parentId?: string;
  popularity?: number;
}

export default function ExplorePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [defaultArtists, setDefaultArtists] = useState<Artist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const selectedIds = React.useMemo(() => new Set(selectedArtists.map(a => a.id)), [selectedArtists]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(true); // Start true to show loading initially
  const [showSaveWarning, setShowSaveWarning] = useState(false);

  // Reload prevention for unsaved changes
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedIds.size]);

  // Back button interception
  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedIds.size > 0) {
      setShowSaveWarning(true);
    } else {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    }
  };

  const handleConfirmSaveExit = async () => {
    setShowSaveWarning(false);
    await saveArtistSelectionDraft(selectedArtists);
    router.push("/");
  };

  const handleDiscardExit = async () => {
    setShowSaveWarning(false);
    if (user) {
      await deleteActiveDraft();
    }
    localStorage.removeItem("selectedArtists");
    sessionStorage.removeItem("selectedArtists");
    router.push("/");
  };

  // Load initial artists and active draft on mount
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const results = await getInitialArtists();
        const mappedArtists: Artist[] = results.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          image: artist.images?.[0]?.url || `https://picsum.photos/seed/${artist.id}/300/300`,
          type: "main",
          popularity: artist.popularity || 0,
        }));
        setDefaultArtists(mappedArtists);
        
        let restoredArtists: any[] = [];

        // 1. First, check if there is an active draft in Supabase (if logged in)
        if (user) {
          try {
            const draft = await loadActiveDraft();
            if (draft && draft.selected_artists && draft.selected_artists.length > 0) {
              restoredArtists = draft.selected_artists;
            }
          } catch (err) {
            console.error("Error loading draft inside explore mount:", err);
          }
        }

        // 2. If nothing from draft, fallback to sessionStorage or localStorage
        if (restoredArtists.length === 0) {
          const localStored = sessionStorage.getItem('selectedArtists') || localStorage.getItem('selectedArtists');
          if (localStored) {
            try {
              const parsed = JSON.parse(localStored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                restoredArtists = parsed;
              }
            } catch (e) {}
          }
        }

        // 3. Apply restored state and merge with viewport list
        if (restoredArtists.length > 0) {
          // MERGED & SANITIZED restoredArtists to match Artist interface
          const sanitizedRestored: Artist[] = restoredArtists.map((a: any) => ({
            id: a.id,
            name: a.name,
            image: a.image || a.images?.[0]?.url || `https://picsum.photos/seed/${a.id}/300/300`,
            type: a.type || 'main',
            parentId: a.parentId
          }));

          setSelectedArtists(sanitizedRestored);
          
          // Hydrate local storages to keep them fully synced
          sessionStorage.setItem('selectedArtists', JSON.stringify(sanitizedRestored));
          localStorage.setItem('selectedArtists', JSON.stringify(sanitizedRestored));

          const mergedArtists = [...mappedArtists];
          sanitizedRestored.forEach((draftArtist: Artist) => {
            if (!mergedArtists.some(a => a.id === draftArtist.id)) {
              mergedArtists.push(draftArtist);
            }
          });
          setArtists(mergedArtists);
        } else {
          setArtists(mappedArtists);
        }
      } catch (error) {
        console.error("Failed to fetch initial artists:", error);
      } finally {
        setIsSearching(false);
      }
    };
    fetchInitial();
  }, [user]);

  // Save artist selection to Supabase in background
  useEffect(() => {
    if (!user) return;
    const saveDraft = async () => {
      // Save draft (updates even if empty, so deselecting all updates correctly)
      await saveArtistSelectionDraft(selectedArtists);
    };
    // Debounce saving slightly so we don't spam requests when user is clicking multiple artists quickly
    const timer = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedArtists, user]);

  // Handle Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length === 0) {
        if (selectedIds.size === 0 && defaultArtists.length > 0) {
          setArtists(defaultArtists);
        }
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchSpotifyArtists(searchQuery);
        const mappedArtists: Artist[] = results.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          image: artist.images?.[0]?.url || `https://picsum.photos/seed/${artist.id}/300/300`,
          type: "main",
          popularity: artist.popularity || 0,
        }));
        setArtists(mappedArtists);
      } catch (error) {
        console.error("Failed to search artists:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, selectedIds.size, defaultArtists]);

  const handleArtistClick = async (artist: Artist) => {
    // If it's a similar artist, just toggle selection without spawning more
    if (artist.type === "similar") {
      setSelectedArtists(prev => {
        if (prev.some(a => a.id === artist.id)) {
          return prev.filter(a => a.id !== artist.id);
        } else {
          return [...prev, artist];
        }
      });
      return;
    }

    const isSearchedArtist = searchQuery.trim().length > 0 && artists.some(a => a.id === artist.id);

    if (isSearchedArtist) {
      // Toggle selection only, do NOT load similar related artists for searched selections
      setSelectedArtists(prev => {
        if (prev.some(a => a.id === artist.id)) {
          return prev.filter(a => a.id !== artist.id);
        } else {
          return [...prev, artist];
        }
      });
      return;
    }

    const isInDefault = defaultArtists.some(a => a.id === artist.id);

    if (selectedIds.has(artist.id)) {
      // Collapse / Deselect for main artists
      setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
      
      // Remove the generated similar items for this artist
      if (isInDefault) {
        setDefaultArtists(prev => prev.filter(a => a.parentId !== artist.id));
      }
    } else {
      // Expand / Select for main artists
      setSelectedArtists(prev => {
        if (prev.some(a => a.id === artist.id)) return prev;
        return [...prev, artist];
      });

      try {
        const related = await getRelatedArtists(artist.id);
        
        const getExpandedList = (prev: Artist[]) => {
          const index = prev.findIndex(a => a.id === artist.id);
          if (index === -1) return prev;
          
          // Filter out related artists that are already in the list to prevent duplicates
          const uniqueRelated = related.filter((r: any) => !prev.some((a: any) => a.id === r.id));
          const topRelated = uniqueRelated.slice(0, 3); // top 3 unique similar
          
          const similar: Artist[] = topRelated.map((r: any) => ({
            id: r.id,
            name: r.name,
            image: r.images?.[0]?.url || `https://picsum.photos/seed/${r.id}/300/300`,
            type: "similar" as const,
            parentId: artist.id,
            popularity: r.popularity || 0,
          }));

          return [
            ...prev.slice(0, index + 1),
            ...similar,
            ...prev.slice(index + 1)
          ];
        };

        if (isInDefault) {
          setDefaultArtists(prev => getExpandedList(prev));
        }
      } catch (error) {
        console.error("Failed to fetch related artists", error);
      }
    }
  };

  const [sortOrder, setSortOrder] = useState<"추천순" | "가나다순" | "선택순">("추천순");

  if (isSearching && defaultArtists.length === 0) {
    return (
      <main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
        <Loader2 className="animate-spin text-point mb-6" size={48} strokeWidth={2.5} />
        <h1 className="font-serif text-2xl text-navy font-bold">아티스트 탐색 중...</h1>
        <p className="font-sans text-sm text-charcoal/70 mt-2">오늘의 추천 아티스트를 찾고 있어요</p>
      </main>
    );
  }

  const renderSearchArtistRow = (artist: Artist) => {
    const isSelected = selectedIds.has(artist.id);
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        key={artist.id}
        onClick={() => handleArtistClick(artist)}
        className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer select-none transition-all duration-300 ${
          isSelected 
            ? "bg-point/10 border-2 border-point shadow-[0_4px_12px_rgba(230,126,34,0.15)]" 
            : "bg-white/50 hover:bg-white border-2 border-navy/5 hover:border-navy/10"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`relative w-14 h-14 rounded-full overflow-hidden border-2 ${isSelected ? "border-point" : "border-navy/10"}`}>
            <Image 
              src={artist.image} 
              alt={artist.name} 
              fill 
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className={`font-sans font-bold text-base ${isSelected ? "text-navy" : "text-charcoal"}`}>
              {artist.name}
            </span>
            <span className="font-sans text-[11px] text-charcoal/50 font-medium">
              아티스트
            </span>
          </div>
        </div>

        <div className="pr-2">
          {isSelected ? (
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-6 h-6 bg-point rounded-full border-2 border-cream flex items-center justify-center shadow-sm"
            >
              <Check size={14} className="text-cream" strokeWidth={3} />
            </motion.div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-navy/15 hover:border-point transition-colors" />
          )}
        </div>
      </motion.div>
    );
  };

  const renderArtistCard = (artist: Artist, idx?: number) => {
    const isSimilar = artist.type === "similar";
    const isSelected = selectedIds.has(artist.id);
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.4, type: "spring", bounce: 0.25 }}
        key={artist.id}
        onClick={() => handleArtistClick(artist)}
        className="flex flex-col items-center gap-3 cursor-pointer group select-none"
      >
        <motion.div 
          layout="position"
          className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 transition-all duration-300 ${isSimilar && !isSelected ? 'border-point border-dashed bg-point/5 scale-90' : isSimilar && isSelected ? 'border-point border-solid bg-point/10 scale-90 shadow-[0_0_15px_rgba(230,126,34,0.4)]' : isSelected ? 'border-point shadow-[0_0_15px_rgba(230,126,34,0.3)]' : 'border-navy/20 group-hover:border-navy/60 group-hover:shadow-md'}`}
        >
          <div className={`relative w-full h-full rounded-full overflow-hidden ${isSelected ? 'p-1 bg-cream/50' : ''}`}>
            <div className="relative w-full h-full rounded-full overflow-hidden">
              <Image 
                src={artist.image} 
                alt={artist.name} 
                fill 
                sizes="112px"
                priority={idx !== undefined && idx < 3}
                className={`object-cover ${isSimilar ? 'opacity-80 mix-blend-multiply filter sepia-[0.4]' : ''} transition-all duration-300 ${isSelected && isSimilar ? 'filter-none mix-blend-normal opacity-100' : ''}`} 
              />
            </div>
          </div>
          {isSelected && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-navy/20 flex items-center justify-center rounded-full pointer-events-none"
            >
              <div className="w-5 h-5 bg-point rounded-full border-2 border-cream shadow-sm" />
            </motion.div>
          )}
        </motion.div>
        <motion.span 
          layout="position"
          className={`font-sans text-xs sm:text-sm text-center line-clamp-1 w-full px-1 ${isSimilar && !isSelected ? 'text-point font-medium' : isSelected ? 'text-navy font-bold' : 'text-charcoal'}`}
        >
          {artist.name}
        </motion.span>
      </motion.div>
    );
  };

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-20 bg-[var(--app-bg)]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-[#F5F2ED]/95 backdrop-blur-md pt-6 pb-3 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between">
          <BackButton onClick={handleBackClick} className="border-none bg-transparent hover:bg-navy/5 w-9 h-9 shadow-none m-0 p-0 relative top-auto left-auto md:top-auto md:left-auto right-auto font-bold" />
          <ProfileHeader className="!relative !top-auto !right-auto !md:top-auto !md:right-auto" />
        </div>

        <div className="text-left mt-1 mb-2 px-1">
          <h1 className="font-serif text-[1.4rem] text-navy tracking-tight leading-snug font-bold">어떤 아티스트를 좋아하시나요?</h1>
          <p className="font-sans text-charcoal/90 font-medium text-sm mt-1">최소 3명의 아티스트를 선택해주세요.</p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            {isSearching ? (
              <Loader2 className="text-navy/50 animate-spin" size={18} strokeWidth={2} />
            ) : (
              <Search className="text-navy/50" size={18} strokeWidth={2} />
            )}
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="아티스트 검색 (예: The Beatles)..." 
            className="w-full py-2.5 pl-11 pr-4 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
        </div>

        {/* Sorting Tags */}
        <div className="flex overflow-x-auto gap-2 scrollbar-none py-1 mt-1 px-1">
          {["추천순", "가나다순", "선택순"].map((sort) => (
            <button
              key={sort}
              onClick={() => setSortOrder(sort as any)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full border-2 transition-all font-sans text-[0.8rem] font-bold ${sortOrder === sort ? 'border-point text-point bg-point/5 shadow-sm' : 'border-navy/10 text-charcoal/70 hover:border-navy/30 hover:bg-navy/5'}`}
            >
              {sort}
            </button>
          ))}
        </div>
      </div>

      {/* Grids Container */}
      <div className="flex flex-col mt-6 px-1 gap-10">
        {searchQuery.trim().length > 0 ? (
          <>
            {/* 1. Search Results Section */}
            <div className="flex flex-col">
              <h2 className="font-serif text-lg text-navy font-bold mb-4 flex items-center gap-2">
                검색 결과
                <span className="text-xs font-sans text-point font-medium">"{searchQuery}" 검색 결과입니다</span>
              </h2>
              {artists.length === 0 ? (
                <div className="py-12 text-center font-sans text-sm text-charcoal/50 bg-white/20 border border-dashed border-navy/10 rounded-3xl">
                  검색 결과가 없습니다. 다른 검색어를 입력해 보세요.
                </div>
              ) : (
                <motion.div layout className="flex flex-col gap-2.5">
                  <AnimatePresence>
                    {artists.map(renderSearchArtistRow)}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>

            {/* 2. Recommended Section (Separated below with visual gap) */}
            <div className="flex flex-col border-t border-navy/5 pt-8">
              <h2 className="font-serif text-lg text-navy/60 font-bold mb-4 flex items-center justify-between">
                오늘의 추천 아티스트
                <span className="text-[10px] font-sans text-charcoal/40 font-medium">기존 추천 목록도 함께 살펴보세요</span>
              </h2>
              <motion.div 
                layout 
                className="grid grid-cols-3 gap-x-3 gap-y-8 opacity-75 hover:opacity-100 transition-opacity duration-300"
              >
                <AnimatePresence>
                  {defaultArtists.map(renderArtistCard)}
                </AnimatePresence>
              </motion.div>
            </div>
          </>
        ) : (
          /* 3. Recommended Section Only (When no search active) */
          <div className="flex flex-col">
            <h2 className="font-serif text-lg text-navy font-bold mb-4 flex items-center gap-2">
              오늘의 추천 아티스트
              <span className="text-xs font-sans text-charcoal/60 font-medium">매일 새로운 아티스트를 소개해드려요</span>
            </h2>
            <motion.div layout className="grid grid-cols-3 gap-x-3 gap-y-8">
              <AnimatePresence>
                {defaultArtists.map(renderArtistCard)}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </div>
      
      {/* Bottom Fixed Dock Panel (Full-Width Segmented View) */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-40 w-full bg-[#F5F2ED]/98 border-t-[2.5px] border-navy/15 pt-4 pb-7 px-6 shadow-[0_-10px_35px_rgba(26,42,108,0.12)] backdrop-blur-md flex flex-col gap-4"
          >
            {/* 1. Selection Horizontal Bar */}
            <div className="flex flex-col gap-1.5 w-full max-w-[380px] mx-auto">
              <div className="flex items-center justify-between px-1">
                <span className="font-sans text-[11px] font-bold text-navy/70 tracking-tight">선택한 아티스트</span>
                <span className="bg-point text-white text-[9px] px-2 py-0.5 rounded-full font-bold">{selectedIds.size}명</span>
              </div>
              
              <div className="flex overflow-x-auto gap-3 scrollbar-none py-1.5 w-full">
                {selectedArtists.map(artist => {
                  return (
                    <motion.div
                      key={artist.id}
                      layout
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      className="flex-shrink-0 flex flex-col items-center relative group"
                    >
                      {/* Avatar with delete X overlay */}
                      <div className="relative w-11 h-11 rounded-full overflow-hidden border border-navy/20">
                        <Image 
                          src={artist.image} 
                          alt={artist.name} 
                          fill 
                          sizes="44px"
                          className="object-cover"
                        />
                        
                        {/* Hover delete X badge */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArtistClick(artist);
                          }}
                          className="absolute inset-0 bg-red-500/80 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                        >
                          <X size={14} className="text-white font-bold" strokeWidth={3} />
                        </button>
                      </div>
                      
                      {/* Compact Name */}
                      <span className="font-sans text-[9px] text-charcoal font-medium text-center line-clamp-1 w-12 mt-1">
                        {artist.name}
                      </span>
                      
                      {/* Mobile always visible micro X delete badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArtistClick(artist);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border border-cream flex items-center justify-center shadow-sm cursor-pointer md:hidden"
                      >
                        <X size={8} className="text-white font-bold" strokeWidth={3} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* 2. Transition Button (Renders when selection count >= 3 with a gap) */}
            <AnimatePresence>
              {selectedIds.size >= 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, height: 0 }}
                  animate={{ opacity: 1, scale: 1, height: "auto" }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  className="w-full max-w-[380px] mx-auto"
                >
                  <button 
                    onClick={async () => {
                      sessionStorage.setItem('selectedArtists', JSON.stringify(selectedArtists));
                      localStorage.setItem('selectedArtists', JSON.stringify(selectedArtists));
                      
                      if (user) {
                        try {
                          // Await database draft update to ensure it is written before redirecting!
                          await saveArtistSelectionDraft(selectedArtists);
                          
                          // Sync user metadata as a secondary backup
                          await supabase.auth.updateUser({
                            data: {
                              selected_artists: selectedArtists
                            }
                          });
                        } catch (err) {
                          console.error("Error saving selected artists to Supabase:", err);
                        }
                      }
                      
                      router.push('/tracks');
                    }}
                    className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors cursor-pointer"
                  >
                    다음으로 넘어가기
                    <span className="bg-point text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{selectedIds.size}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacing bottom padding adjusted for taller Bottom Dock */}
      <div className={selectedIds.size > 0 ? "h-64" : "h-32"} />

      {/* Save Exit Confirmation Warning Modal */}
      <AnimatePresence>
        {showSaveWarning && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveWarning(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-[340px] rounded-[2.5rem] border-[4px] border-navy p-7 shadow-[0_20px_50px_rgba(26,42,108,0.3)] relative pointer-events-auto flex flex-col items-center text-center overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
              >
                {/* Decorative LP Record Graphic */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                  className="w-16 h-16 bg-navy rounded-full flex items-center justify-center mb-5 shadow-lg border-2 border-point relative shrink-0"
                >
                  <Disc className="text-cream" size={32} />
                  <div className="absolute w-4 h-4 bg-cream rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-navy" />
                </motion.div>

                <h2 className="font-serif text-2xl font-bold text-navy mb-3 tracking-tight">진행 내역을 저장할까요?</h2>
                <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  선택한 아티스트 목록이 있습니다. 지금까지의 진행 내역을 보관하고 나갈까요?<br/>
                  <span className="text-point font-medium">(보관한 내역은 프로필의 내 아카이브에서 언제든 이어할 수 있습니다.)</span>
                </p>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmSaveExit}
                    className="w-full py-3.5 bg-navy text-cream font-bold rounded-2xl hover:bg-navy/90 transition-all shadow-md text-sm cursor-pointer"
                  >
                    저장하고 나가기
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDiscardExit}
                    className="w-full py-3.5 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50/50 font-bold rounded-2xl transition-all text-sm cursor-pointer"
                  >
                    저장하지 않고 나가기
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSaveWarning(false)}
                    className="w-full py-3.5 bg-white border-2 border-navy/10 text-charcoal font-bold rounded-2xl hover:bg-navy/5 transition-all text-sm cursor-pointer"
                  >
                    취소
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
