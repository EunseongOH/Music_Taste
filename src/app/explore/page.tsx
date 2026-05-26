"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Disc } from "lucide-react";
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
}

export default function ExplorePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [defaultArtists, setDefaultArtists] = useState<Artist[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    const selectedData = artists.filter(a => selectedIds.has(a.id));
    const uniqueSelectedData = Array.from(new Map(selectedData.map(a => [a.id, a])).values());
    await saveArtistSelectionDraft(uniqueSelectedData);
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
        }));
        setDefaultArtists(mappedArtists);
        
        if (user) {
          const draft = await loadActiveDraft();
          if (draft && draft.selected_artists && draft.selected_artists.length > 0) {
            // Restore from active draft
            const draftIds = draft.selected_artists.map((a: any) => a.id);
            setSelectedIds(new Set(draftIds));
            
            // Merge draft artists into mappedArtists to ensure selected ones are shown on screen
            const mergedArtists = [...mappedArtists];
            draft.selected_artists.forEach((draftArtist: any) => {
              if (!mergedArtists.some(a => a.id === draftArtist.id)) {
                mergedArtists.push({
                  id: draftArtist.id,
                  name: draftArtist.name,
                  image: draftArtist.image,
                  type: 'main'
                });
              }
            });
            setArtists(mergedArtists);
          } else {
            setArtists(mappedArtists);
          }
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
      const selectedData = artists.filter(a => selectedIds.has(a.id));
      const uniqueSelectedData = Array.from(new Map(selectedData.map(a => [a.id, a])).values());
      // Save draft (updates even if empty, so deselecting all updates correctly)
      await saveArtistSelectionDraft(uniqueSelectedData);
    };
    // Debounce saving slightly so we don't spam requests when user is clicking multiple artists quickly
    const timer = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedIds, artists, user]);

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
      const newSelected = new Set(selectedIds);
      if (newSelected.has(artist.id)) newSelected.delete(artist.id);
      else newSelected.add(artist.id);
      setSelectedIds(newSelected);
      return;
    }

    if (selectedIds.has(artist.id)) {
      // Collapse / Deselect for main artists
      const newSelected = new Set(selectedIds);
      newSelected.delete(artist.id);
      setSelectedIds(newSelected);
      // Remove the generated similar items for this artist
      setArtists(prev => prev.filter(a => a.parentId !== artist.id));
    } else {
      // Expand / Select for main artists
      const newSelected = new Set(selectedIds);
      newSelected.add(artist.id);
      setSelectedIds(newSelected);

      try {
        const related = await getRelatedArtists(artist.id);
        
        setArtists(prev => {
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
            parentId: artist.id
          }));

          return [
            ...prev.slice(0, index + 1),
            ...similar,
            ...prev.slice(index + 1)
          ];
        });
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

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-3 gap-x-3 gap-y-8 mt-6 px-1"
      >
        <AnimatePresence>
          {artists.map((artist) => {
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
                className={`flex flex-col items-center gap-3 cursor-pointer group select-none`}
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
          })}
        </AnimatePresence>
      </motion.div>
      
      {/* Floating Action Button */}
      <AnimatePresence>
        {selectedIds.size >= 3 && (
          <motion.div 
            initial={{ y: 100, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 100, opacity: 0, x: "-50%" }}
            className="fixed bottom-8 left-1/2 z-50 w-[90%] max-w-[380px]"
          >
            <button 
              onClick={async () => {
                const selectedData = artists.filter(a => selectedIds.has(a.id));
                // Ensure absolute uniqueness before passing to tracks page
                const uniqueSelectedData = Array.from(new Map(selectedData.map(a => [a.id, a])).values());
                sessionStorage.setItem('selectedArtists', JSON.stringify(uniqueSelectedData));
                localStorage.setItem('selectedArtists', JSON.stringify(uniqueSelectedData));
                
                if (user) {
                  try {
                    await supabase.auth.updateUser({
                      data: {
                        selected_artists: uniqueSelectedData
                      }
                    });
                  } catch (err) {
                    console.error("Error saving selected artists to Supabase:", err);
                  }
                }
                
                router.push('/tracks');
              }}
              className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-2xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors cursor-pointer"
            >
              다음으로 넘어가기
              <span className="bg-point text-white text-xs px-2 py-1 rounded-full">{selectedIds.size}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="h-32" /> {/* Bottom padding */}

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
