"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Disc, X, Check, ChevronUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { searchSpotifyArtists, getInitialArtists, getRelatedArtists, getSpotifyGenreQuery, searchArtistsByGenres, getLastSpotifyError } from "@/utils/spotify";
import { saveArtistSelectionDraft, loadActiveDraft, deleteActiveDraft } from "@/utils/worldcupDb";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { curatedArtists } from "@/utils/curatedArtists";
import { trackEvent } from "@/utils/gtag";

interface Artist {
  id: string;
  name: string;
  image: string;
  type: "main" | "similar";
  parentId?: string;
  popularity?: number;
}

const GENRES = [
  { id: "all", name: "전체" },
  { id: "k-pop", name: "K-Pop" },
  { id: "pop", name: "Pop" },
  { id: "hip-hop", name: "Hip-Hop" },
  { id: "rock", name: "Rock" },
  { id: "r-b", name: "R&B" },
  { id: "indie", name: "Indie" },
  { id: "electronic", name: "Electronic" },
  { id: "jazz", name: "Jazz" },
  { id: "ballad", name: "Ballad" },
  { id: "trot", name: "Trot" },
  { id: "j-pop", name: "J-Pop" },
  { id: "classical", name: "Classical" },
];

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
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [pendingSingleArtist, setPendingSingleArtist] = useState<Artist | null>(null);
  const [visibleDefaultCount, setVisibleDefaultCount] = useState(30);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreSearch, setHasMoreSearch] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // observerInstanceRef holds the active IntersectionObserver so we can disconnect on cleanup
  const observerInstanceRef = useRef<IntersectionObserver | null>(null);
  // observerRef is kept as a regular ref so other code can read the DOM node if needed
  const observerRef = useRef<HTMLDivElement | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);

  // Always-fresh ref of ALL loaded artist IDs (for deduplication in recommendations)
  const allArtistIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    allArtistIdsRef.current = new Set(defaultArtists.map(a => a.id));
  }, [defaultArtists]);

  // ─── Direct refs (not synced from state) to avoid stale-closure in observer ───
  // These are the ONLY source of truth for the observer callback.
  const searchQueryRef = useRef("");
  const isLoadingMoreRef = useRef(false);
  const isSearchingRef = useRef(true);
  // genre pagination: managed ONLY via ref so observer always reads latest value
  const genreOffsetRef = useRef(0);
  const selectedGenresRef = useRef<string[]>([]);
  // search pagination
  const searchOffsetRef = useRef(0);
  const hasMoreSearchRef = useRef(true);
  const hasMoreGenreRef = useRef(true);

  // Keep search-related refs in sync (search still uses state + ref)
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { isSearchingRef.current = isSearching; }, [isSearching]);

  // Pre-selected genres from the previous step
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [hasMoreGenre, setHasMoreGenre] = useState(true);
  // selectedGenres ref stays in sync
  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);

  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  const checkSpotifyError = useCallback(async () => {
    try {
      const err = await getLastSpotifyError();
      if (err) {
        setSpotifyError(err);
      } else {
        setSpotifyError(null);
      }
    } catch {
      setSpotifyError(null);
    }
  }, []);

  const t = {
    ko: {
      title: isSingleArtistMode ? "최애 아티스트를 선택해 주세요" : "어떤 아티스트를 좋아하시나요?",
      desc: isSingleArtistMode ? "단 한 명의 아티스트를 선택해, 그동안 발표된 모든 곡을 내 마음에 드는 순서대로 정렬해보세요." : "최소 3명의 아티스트를 선택해 주세요.",
      genreLabel: "선택 장르:",
      placeholder: "아티스트 검색 (예: The Beatles)...",
      searchResult: "검색 결과",
      searchResultSub: `"${searchQuery}" 검색 결과예요`,
      noResults: "검색 결과가 없어요. 다른 검색어로 검색해 볼까요?",
      loadingMore: "아티스트 더 불러오는 중...",
      selectedLabel: "선택한 아티스트",
      countLabel: "명",
      nextBtn: "다음으로 넘어가기",
      saveExitTitle: "진행 내역을 저장할까요?",
      saveExitDesc: "선택한 아티스트 목록이 있어요. 지금까지 진행한 내역을 보관하고 나갈까요?\n(보관한 내역은 프로필의 '내 취향 스페이스'에서 언제든 이어할 수 있어요.)",
      saveExitConfirm: "저장하고 나가기",
      saveExitDiscard: "저장하지 않고 나가기",
      cancel: "취소",
      singleConfirmTitle: "곡들을 소트해볼까요?",
      singleConfirmDesc: `'${pendingSingleArtist?.name}'의 모든 발표곡을 내 마음에 드는 순서대로 정렬해보세요.`,
      proceed: "시작할게요",
      loadingTitle: "아티스트 탐색 중...",
      loadingDesc: "오늘의 추천 아티스트를 찾고 있어요",
      artistLabel: "아티스트",
    },
    en: {
      title: isSingleArtistMode ? "Select your favorite artist" : "Who are your favorite artists?",
      desc: isSingleArtistMode ? "Select a single artist and line up all of their tracks in the order of your choice." : "Please select at least 3 artists.",
      genreLabel: "Selected Genres:",
      placeholder: "Search artists (e.g., The Beatles)...",
      searchResult: "Search Results",
      searchResultSub: `Results for "${searchQuery}"`,
      noResults: "No results found. Let's try searching for something else.",
      loadingMore: "Loading more artists...",
      selectedLabel: "Selected Artists",
      countLabel: "",
      nextBtn: "Next Step",
      saveExitTitle: "Save progress?",
      saveExitDesc: "You have selected artists. Would you like to save your choice and exit?\n(You can pick up right where you left off from 'My Taste Space'.)",
      saveExitConfirm: "Save and Exit",
      saveExitDiscard: "Exit without Saving",
      cancel: "Cancel",
      singleConfirmTitle: "Line up songs?",
      singleConfirmDesc: `Would you like to line up all songs by '${pendingSingleArtist?.name}' in your preferred order?`,
      proceed: "Start",
      loadingTitle: "Searching artists...",
      loadingDesc: "Finding recommended artists for you",
      artistLabel: "Artist",
    }
  }[locale];

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsSingleArtistMode(params.get("mode") === "single");
      setLocale(getSafeLocale());
    }
  }, []);

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

  // Scroll-to-top button visibility — show after any meaningful scroll (50px)
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    await saveArtistSelectionDraft(selectedArtists, isSingleArtistMode);
    router.push("/");
  };

  const handleDiscardExit = async () => {
    setShowSaveWarning(false);
    if (user) {
      await deleteActiveDraft(isSingleArtistMode);
    }
    localStorage.removeItem("selectedArtists");
    sessionStorage.removeItem("selectedArtists");
    router.push("/");
  };

  // Load initial artists and active draft on mount
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const isSingle = params.get("mode") === "single";

        // Load selected genres — priority: URL params > storage > all curated (fallback)
        let genresList: string[] = [];

        // 1. Try URL query param first (most reliable — survives storage sandbox)
        const genresParam = params.get("genres");
        if (genresParam) {
          try {
            const parsed = JSON.parse(decodeURIComponent(genresParam));
            if (Array.isArray(parsed) && parsed.length > 0) {
              genresList = parsed;
              // Sync back to storage so later reads work
              sessionStorage.setItem("selected_genres", JSON.stringify(genresList));
              localStorage.setItem("selected_genres", JSON.stringify(genresList));
            }
          } catch (e) {}
        }

        // 2. Fall back to storage if URL param was absent
        if (genresList.length === 0) {
          const storedGenres = sessionStorage.getItem("selected_genres") || localStorage.getItem("selected_genres");
          if (storedGenres) {
            try {
              const parsed = JSON.parse(storedGenres);
              if (Array.isArray(parsed) && parsed.length > 0) {
                genresList = parsed;
              }
            } catch (e) {}
          }
        }

        // If single artist mode and no genres specified (skipped selection), select all genres by default
        if (genresList.length === 0 && isSingle) {
          genresList = [
            "k-pop", "pop", "korean hip hop", "hip hop", "korean r&b", "r&b",
            "korean rock", "rock", "korean indie", "indie", "electronic", "jazz",
            "ballad", "trot", "j-pop", "classical"
          ];
        }

        if (genresList.length > 0) {
          setSelectedGenres(genresList);
        }

        
        let results: any[] = [];
        if (genresList && genresList.length > 0) {
          // Step 1: Load curated artists (offline, instant)
          const allCurated: any[] = [];
          genresList.forEach((genreId) => {
            const artistsInGenre = curatedArtists[genreId.toLowerCase()];
            if (artistsInGenre) {
              artistsInGenre.forEach((a) => {
                allCurated.push({
                  id: a.id,
                  name: a.name,
                  image: a.image,
                  popularity: 50
                });
              });
            }
          });
          
          // Remove duplicates from curated list
          const curatedUnique = Array.from(new Map(allCurated.map((a: any) => [a.id, a])).values());

          // Step 2: Fetch additional artists from Spotify API to supplement curated list
          // We do ONE API call with limit=50 and offset=0 to get fresh artists
          let apiArtists: any[] = [];
          try {
            const { items: apiResults } = await searchArtistsByGenres(genresList, 50, 0);
            const curatedIds = new Set(curatedUnique.map((a: any) => a.id));
            // Only add artists not already in curated list
            apiArtists = apiResults
              .filter((a: any) => !curatedIds.has(a.id) && a.images?.[0]?.url)
              .map((a: any) => ({
                id: a.id,
                name: a.name,
                image: a.images[0].url,
                popularity: a.popularity || 50
              }));
          } catch (e) {
            console.warn("[explore] Initial API fetch for genres failed, using curated only:", e);
          }

          // Merge: curated first (familiar names), then API extras
          const merged = [...curatedUnique, ...apiArtists];
          
          // Shuffle the consolidated results
          for (let i = merged.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [merged[i], merged[j]] = [merged[j], merged[i]];
          }
          results = merged;
          // Set genre offset to 50 (past the initial API batch) — write DIRECTLY to ref
          genreOffsetRef.current = 50;
          setHasMoreGenre(true);
          hasMoreGenreRef.current = true;
        } else {
          // Fallback to getInitialArtists if no genres selected
          results = await getInitialArtists();
        }

        const mappedArtists: Artist[] = results.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          image: artist.image || artist.images?.[0]?.url || "/default-artist.png",
          type: "main",
          popularity: artist.popularity || 0,
        }));
        setDefaultArtists(mappedArtists);
        
        let restoredArtists: any[] = [];

        // 1. First, check if there is an active draft in Supabase (if logged in)
        if (user) {
          try {
            const draft = await loadActiveDraft(isSingle);
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
            image: a.image || a.images?.[0]?.url || "/default-artist.png",
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
        await checkSpotifyError();
      }
    };
    fetchInitial();
  }, [user]);

  // Save artist selection to Supabase in background
  useEffect(() => {
    if (!user) return;
    const saveDraft = async () => {
      // Save draft (updates even if empty, so deselecting all updates correctly)
      await saveArtistSelectionDraft(selectedArtists, isSingleArtistMode);
    };
    // Debounce saving slightly so we don't spam requests when user is clicking multiple artists quickly
    const timer = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedArtists, user, isSingleArtistMode]);

  // Pre-selected genre search effect removed

  // Handle Search
  const prevSearchQueryRef = React.useRef("");
  useEffect(() => {
    // Only re-run the search if the query itself changed (not just selection state)
    const queryChanged = prevSearchQueryRef.current !== searchQuery;
    prevSearchQueryRef.current = searchQuery;

    const timer = setTimeout(async () => {
      if (searchQuery.trim().length === 0) {
        setArtists(defaultArtists);
        setIsSearching(false);
        setSearchOffset(0);
        setHasMoreSearch(true);
        return;
      }

      if (!queryChanged) return; // Don't re-search if only selected artists changed

      setIsSearching(true);
      setSearchOffset(0);
      setHasMoreSearch(true);
      try {
        const results = await searchSpotifyArtists(searchQuery, 10, 0);
        const mappedArtists: Artist[] = results.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          image: artist.images?.[0]?.url || "/default-artist.png",
          type: "main",
          popularity: artist.popularity || 0,
        }));
        setArtists(mappedArtists);
        if (results.length < 10) {
          setHasMoreSearch(false);
        }
      } catch (error) {
        console.error("Failed to search artists:", error);
      } finally {
        setIsSearching(false);
        await checkSpotifyError();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, defaultArtists]);

  // Stable callback using refs to avoid stale closures in IntersectionObserver.
  // IMPORTANT: genreOffsetRef is updated DIRECTLY (not via setState) so this
  // closure always reads the current offset without stale-value issues.
  const handleLoadMore = useCallback(async () => {
    const isSearchingActive = searchQueryRef.current.trim().length > 0;

    if (isSearchingActive) {
      // ── Search mode ──────────────────────────────────────────────────────
      if (!hasMoreSearchRef.current || isLoadingMoreRef.current || isSearchingRef.current) return;

      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      try {
        const nextOffset = searchOffsetRef.current + 10;
        const results = await searchSpotifyArtists(searchQueryRef.current, 10, nextOffset);
        if (results.length === 0) {
          setHasMoreSearch(false);
          hasMoreSearchRef.current = false;
        } else {
          const mapped: Artist[] = results.map((a: any) => ({
            id: a.id,
            name: a.name,
            image: a.images?.[0]?.url || "/default-artist.png",
            type: "main",
            popularity: a.popularity || 0,
          }));
          setArtists(prev => {
            const prevIds = new Set(prev.map(a => a.id));
            return [...prev, ...mapped.filter(a => !prevIds.has(a.id))];
          });
          searchOffsetRef.current = nextOffset;
          if (results.length < 10) {
            setHasMoreSearch(false);
            hasMoreSearchRef.current = false;
          }
        }
      } catch (e) {
        console.error("[explore] Failed to load more search results:", e);
      } finally {
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        await checkSpotifyError();
      }

    } else if (selectedGenresRef.current.length > 0) {
      // ── Genre mode: fetch fresh artists from Spotify API on every scroll ──
      if (!hasMoreGenreRef.current || isLoadingMoreRef.current) return;

      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      try {
        // Read offset DIRECTLY from ref — never stale
        const currentOffset = genreOffsetRef.current;
        const nextOffset = currentOffset + 20;

        console.log(`[explore] Loading genre artists: offset=${currentOffset} → ${nextOffset}`);
        const { items: results, isFallback } = await searchArtistsByGenres(selectedGenresRef.current, 20, nextOffset);

        if (results.length === 0) {
          // If it's a fallback and returned nothing, do not stop the infinite scroll permanently
          if (!isFallback) {
            setHasMoreGenre(false);
            hasMoreGenreRef.current = false;
          }
        } else {
          const mapped: Artist[] = results
            .filter((a: any) => a.images?.[0]?.url)
            .map((a: any) => ({
              id: a.id,
              name: a.name,
              image: a.images[0].url,
              type: "main" as const,
              popularity: a.popularity || 0,
            }));

          setDefaultArtists(prev => {
            const prevIds = new Set(prev.map(a => a.id));
            const fresh = mapped.filter(a => !prevIds.has(a.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          setVisibleDefaultCount(prev => prev + 20);

          // Advance offset only if we fetched successfully from API, preserving the query point on error fallback
          if (!isFallback) {
            genreOffsetRef.current = nextOffset;
          }
        }
      } catch (e) {
        console.error("[explore] Failed to load more genre artists:", e);
      } finally {
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        await checkSpotifyError();
      }

    } else {
      // ── No genre: just reveal more of the already-loaded list ──────────
      setVisibleDefaultCount(prev => prev + 20);
    }
  }, []); // empty deps — all mutable values are read via refs


  // A stable ref to the latest handleLoadMore for the IntersectionObserver
  const handleLoadMoreRef = useRef(handleLoadMore);
  useEffect(() => {
    handleLoadMoreRef.current = handleLoadMore;
  }, [handleLoadMore]);

  // Callback ref for the infinite-scroll sentinel.
  // Using a callback ref (instead of useRef + useEffect[]) ensures the observer
  // is set up the moment the sentinel div actually enters the DOM — even if that
  // happens after the initial loading-spinner render (which returns early and
  // never renders the sentinel, leaving a plain useRef null).
  const setSentinelRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect any previous observer
    if (observerInstanceRef.current) {
      observerInstanceRef.current.disconnect();
      observerInstanceRef.current = null;
    }
    observerRef.current = node;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMoreRef.current();
        }
      },
      // rootMargin pre-loads 300px before the user actually hits the bottom
      { threshold: 0.1, rootMargin: '0px 0px 300px 0px' }
    );
    observer.observe(node);
    observerInstanceRef.current = observer;
  }, []); // stable — recreated only if deps change (none here)

  const handleArtistClick = async (artist: Artist) => {
    if (isSingleArtistMode) {
      setPendingSingleArtist(artist);
      return;
    }

    // If it's a similar/recommended artist, just toggle selection without spawning more
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
    const isInDefault = defaultArtists.some(a => a.id === artist.id);

    if (isSearchedArtist) {
      if (selectedIds.has(artist.id)) {
        // Deselect searched artist: remove its recommendations
        setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
        setArtists(prev => prev.filter(a => a.parentId !== artist.id));
      } else {
        // Select searched artist
        setSelectedArtists(prev => {
          if (prev.some(a => a.id === artist.id)) return prev;
          return [...prev, artist];
        });

        try {
          const related = await getRelatedArtists(artist.id);
          
          setArtists(prev => {
            const index = prev.findIndex(a => a.id === artist.id);
            if (index === -1) return prev;
            
            // Deduplicate: exclude anything already in default list OR current search list
            const allExistingIds = new Set([
              ...allArtistIdsRef.current,
              ...prev.map((a: any) => a.id)
            ]);
            const filteredRelated = related.filter((r: any) => !allExistingIds.has(r.id));
            const topRelated = filteredRelated.slice(0, 3);
            
            if (topRelated.length === 0) return prev;

            const similar: Artist[] = topRelated.map((r: any) => ({
              id: r.id,
              name: r.name,
              image: r.images?.[0]?.url || "/default-artist.png",
              type: "similar" as const,
              parentId: artist.id,
              popularity: r.popularity || 0,
            }));

            return [
              ...prev.slice(0, index + 1),
              ...similar,
              ...prev.slice(index + 1)
            ];
          });
        } catch (error) {
          console.error("Failed to fetch related artists in search:", error);
        }
      }
      return;
    }

    if (selectedIds.has(artist.id)) {
      // Collapse / Deselect for main artists
      setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
      
      // Remove the generated similar items for this artist
      if (isInDefault) {
        setDefaultArtists(prev => {
          const removedCount = prev.filter(a => a.parentId === artist.id).length;
          if (removedCount > 0) {
            setVisibleDefaultCount(curr => Math.max(30, curr - removedCount));
          }
          return prev.filter(a => a.parentId !== artist.id);
        });
      }
    } else {
      // Expand / Select for main artists — fetch recommendations
      trackEvent("select_curated_artist", { artist_name: artist.name });
      setSelectedArtists(prev => {
        if (prev.some(a => a.id === artist.id)) return prev;
        return [...prev, artist];
      });

      try {
        const related = await getRelatedArtists(artist.id);
        
        if (isInDefault) {
          setDefaultArtists(prev => {
            const index = prev.findIndex(a => a.id === artist.id);
            if (index === -1) return prev;
            
            // Deduplicate against the FULL list (ref) + already-injected similar artists in prev
            const allExistingIds = new Set([
              ...allArtistIdsRef.current,
              ...prev.map((a: any) => a.id)
            ]);
            const filteredRelated = related.filter((r: any) => !allExistingIds.has(r.id));
            const topRelated = filteredRelated.slice(0, 3);

            if (topRelated.length === 0) return prev;
            
            const similar: Artist[] = topRelated.map((r: any) => ({
              id: r.id,
              name: r.name,
              image: r.images?.[0]?.url || "/default-artist.png",
              type: "similar" as const,
              parentId: artist.id,
              popularity: r.popularity || 0,
            }));

            const addedCount = similar.length;
            setVisibleDefaultCount(curr => curr + addedCount);

            return [
              ...prev.slice(0, index + 1),
              ...similar,
              ...prev.slice(index + 1)
            ];
          });
        }
      } catch (error) {
        console.error("Failed to fetch related artists", error);
      }
    }
  };



  if (isSearching && defaultArtists.length === 0) {
    return (
      <main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
        <Loader2 className="animate-spin text-point mb-6" size={48} strokeWidth={2.5} />
        <h1 className="font-serif text-2xl text-navy font-bold">{t.loadingTitle}</h1>
        <p className="font-sans text-sm text-charcoal/70 mt-2">{t.loadingDesc}</p>
      </main>
    );
  }

  const renderSearchArtistRow = (artist: Artist) => {
    const isSelected = selectedIds.has(artist.id);
    const isSimilar = artist.type === "similar";
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        key={isSimilar ? `${artist.parentId}-${artist.id}` : artist.id}
        onClick={() => handleArtistClick(artist)}
        className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer select-none transition-all duration-300 ${
          isSelected 
            ? "bg-point/10 border-2 border-point shadow-[0_4px_12px_rgba(230,126,34,0.15)]" 
            : isSimilar
              ? "bg-point/5 border-2 border-point border-dashed opacity-90 scale-[0.98]"
              : "bg-white/50 hover:bg-white border-2 border-navy/5 hover:border-navy/10"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`relative w-14 h-14 rounded-full overflow-hidden border-2 ${isSelected ? "border-point" : isSimilar ? "border-point border-dashed" : "border-navy/10"}`}>
            <Image 
              src={artist.image} 
              alt={artist.name} 
              fill 
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className={`font-sans font-bold text-base ${isSelected ? "text-navy" : isSimilar ? "text-point" : "text-charcoal"}`}>
              {artist.name}
            </span>
            <span className="font-sans text-[11px] text-charcoal/50 font-medium">
              {isSimilar ? (locale === "ko" ? "추천 아티스트" : "Recommended Artist") : t.artistLabel}
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
            <div className={`w-6 h-6 rounded-full border-2 ${isSimilar ? "border-point/40" : "border-navy/15"} hover:border-point transition-colors`} />
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
        key={isSimilar ? `${artist.parentId}-${artist.id}` : artist.id}
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
          <ProfileHeader locale={locale} className="!relative !top-auto !right-auto !md:top-auto !md:right-auto" />
        </div>

        <div className="text-left mt-1 mb-2 px-1">
          <h1 className="font-serif text-[1.4rem] text-navy tracking-tight leading-snug font-bold">
            {t.title}
          </h1>
          <p className="font-sans text-charcoal/90 font-medium text-sm mt-1">
            {t.desc}
          </p>
          
          {/* Pre-selected genres badges */}
          {selectedGenres.length > 0 && !isSingleArtistMode && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="font-sans text-[10px] text-navy/40 font-bold self-center mr-1">{t.genreLabel}</span>
              {selectedGenres.map(genreId => {
                const label = genreId.toUpperCase();
                return (
                  <span key={genreId} className="px-2.5 py-0.5 bg-navy/5 border border-navy/10 rounded-full font-sans text-[10px] text-navy font-semibold">
                    {label}
                  </span>
                );
              })}
            </div>
          )}
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
            placeholder={t.placeholder} 
            className="w-full py-2.5 pl-11 pr-10 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
          {searchQuery.length > 0 && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-4 flex items-center justify-center text-navy/40 hover:text-point transition-colors cursor-pointer"
              aria-label="Clear search query"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>

        </div>

      {/* Grids Container */}
      <div className="flex flex-col mt-6 px-1 gap-10">
        {searchQuery.trim().length > 0 ? (
          /* 1. Search Results Section */
          <div className="flex flex-col">
            <h2 className="font-serif text-lg text-navy font-bold mb-4 flex items-center gap-2">
              {t.searchResult}
              <span className="text-xs font-sans text-point font-medium">{t.searchResultSub}</span>
            </h2>
            {artists.length === 0 ? (
              <div className="py-12 text-center font-sans text-sm text-charcoal/50 bg-white/20 border border-dashed border-navy/10 rounded-3xl">
                {t.noResults}
              </div>
            ) : (
              <motion.div layout className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {artists.map(renderSearchArtistRow)}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        ) : (
          /* 2. Recommended Section Only (When no search active) */
          <div className="flex flex-col">
            <motion.div layout className="grid grid-cols-3 gap-x-3 gap-y-8">
              <AnimatePresence>
                {defaultArtists.slice(0, visibleDefaultCount).map(renderArtistCard)}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </div>

      {/* Infinite Scroll Sentinel — callback ref ensures observer attaches when this element mounts */}
      <div ref={setSentinelRef} className="h-20 w-full flex items-center justify-center mt-4">
        {((searchQuery.trim().length > 0 && hasMoreSearch) || 
          (searchQuery.trim().length === 0 && selectedGenres.length > 0 && hasMoreGenre)) && (
          <div className="flex flex-col items-center gap-1.5 py-4">
            <Loader2 className="animate-spin text-point/60" size={24} />
            <span className="font-sans text-[10px] text-navy/40 font-bold">{t.loadingMore}</span>
          </div>
        )}
      </div>
      
      {/* Bottom Fixed Dock Panel (Full-Width Segmented View) */}
      <AnimatePresence>
        {selectedIds.size > 0 && !isSingleArtistMode && (
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
                <span className="font-sans text-[11px] font-bold text-navy/70 tracking-tight">{t.selectedLabel}</span>
                <span className="bg-point text-white text-[9px] px-2 py-0.5 rounded-full font-bold">{selectedIds.size}{t.countLabel}</span>
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
                      // Check if artist selection changed from what was previously stored
                      const prevStoredStr = sessionStorage.getItem('selectedArtists') || localStorage.getItem('selectedArtists');
                      let artistsChanged = true;
                      if (prevStoredStr) {
                        try {
                          const prevArtists: { id: string }[] = JSON.parse(prevStoredStr);
                          const prevIds = new Set(prevArtists.map(a => a.id));
                          const curIds = new Set(selectedArtists.map(a => a.id));
                          artistsChanged =
                            prevIds.size !== curIds.size ||
                            selectedArtists.some(a => !prevIds.has(a.id));
                        } catch (e) {}
                      }

                      sessionStorage.setItem('selectedArtists', JSON.stringify(selectedArtists));
                      localStorage.setItem('selectedArtists', JSON.stringify(selectedArtists));
                      localStorage.setItem('worldcup_is_single_artist', 'false');
                      sessionStorage.setItem('worldcup_is_single_artist', 'false');

                      // If the artist lineup changed, discard stale track selections
                      if (artistsChanged) {
                        sessionStorage.removeItem('worldcup_tracks');
                        localStorage.removeItem('worldcup_tracks');
                      }
                      
                      if (user) {
                        try {
                          // Await database draft update to ensure it is written before redirecting!
                          await saveArtistSelectionDraft(selectedArtists, false);
                          
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
                      
                      trackEvent("funnel_artist_complete", { selected_artists_count: selectedIds.size });
                      router.push('/tracks');
                    }}
                    className="w-full py-4 rounded-full bg-navy text-cream font-sans font-medium text-lg shadow-xl border flex items-center justify-center gap-2 border-navy/20 hover:bg-navy/90 transition-colors cursor-pointer"
                  >
                    {t.nextBtn}
                    <span className="bg-point text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{selectedIds.size}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacing bottom padding adjusted for taller Bottom Dock */}
      <div className={selectedIds.size > 0 && !isSingleArtistMode ? "h-64" : "h-32"} />

      {/* Scroll-to-Top Floating Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            key="scroll-top-btn"
            initial={{ opacity: 0, scale: 0.7, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`fixed right-5 z-50 w-12 h-12 rounded-full bg-navy shadow-[0_6px_24px_rgba(26,42,108,0.28)] flex items-center justify-center hover:bg-navy/90 active:scale-95 transition-all cursor-pointer ${selectedIds.size > 0 && !isSingleArtistMode ? "bottom-56" : "bottom-6"}`}
            aria-label="맨 위로 이동"
          >
            <ChevronUp size={22} className="text-cream" strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

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

                <h2 className="font-serif text-2xl font-bold text-navy mb-3 tracking-tight">{t.saveExitTitle}</h2>
                <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-1">
                  {t.saveExitDesc}
                </p>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmSaveExit}
                    className="w-full py-3.5 bg-navy text-cream font-bold rounded-2xl hover:bg-navy/90 transition-all shadow-md text-sm cursor-pointer"
                  >
                    {t.saveExitConfirm}
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDiscardExit}
                    className="w-full py-3.5 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50/50 font-bold rounded-2xl transition-all text-sm cursor-pointer"
                  >
                    {t.saveExitDiscard}
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSaveWarning(false)}
                    className="w-full py-3.5 bg-white border-2 border-navy/10 text-charcoal font-bold rounded-2xl hover:bg-navy/5 transition-all text-sm cursor-pointer"
                  >
                    {t.cancel}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Single Artist Mode Selection Confirmation Popup Modal */}
      <AnimatePresence>
        {pendingSingleArtist && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingSingleArtist(null)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-[340px] rounded-[2.5rem] border-[4px] border-navy p-7 shadow-[0_20px_50px_rgba(26,42,108,0.3)] relative pointer-events-auto flex flex-col items-center text-center overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
              >
                {/* Artist Avatar with Spinning LP vibe */}
                <div className="relative w-24 h-24 rounded-full border-4 border-navy overflow-hidden bg-white shadow-md mb-4 mt-2">
                  <Image 
                    src={pendingSingleArtist.image} 
                    alt={pendingSingleArtist.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
                
                <h2 className="font-serif text-2xl font-bold text-navy mb-2 tracking-tight">{t.singleConfirmTitle}</h2>
                <p className="font-sans text-charcoal/80 text-[13px] leading-relaxed mb-6 whitespace-pre-wrap break-keep px-2">
                  {t.singleConfirmDesc}
                </p>
                
                <div className="flex flex-col gap-2 w-full">
                  <button 
                    onClick={async () => {
                      const selected = [pendingSingleArtist];
                      setSelectedArtists(selected);
                      sessionStorage.setItem('selectedArtists', JSON.stringify(selected));
                      localStorage.setItem('selectedArtists', JSON.stringify(selected));
                      localStorage.setItem('worldcup_is_single_artist', 'true');
                      sessionStorage.setItem('worldcup_is_single_artist', 'true');

                      // Clear any stale track selections — a new single artist means fresh start
                      sessionStorage.removeItem('worldcup_tracks');
                      localStorage.removeItem('worldcup_tracks');
                      
                      if (user) {
                        try {
                          await saveArtistSelectionDraft(selected, true);
                          await supabase.auth.updateUser({
                            data: {
                              selected_artists: selected
                            }
                          });
                        } catch (err) {
                          console.error("Error saving draft inside explore proceed:", err);
                        }
                      }
                      
                      setPendingSingleArtist(null);
                      router.push('/tracks?mode=single');
                    }}
                    className="w-full py-3.5 bg-navy text-cream font-bold text-sm rounded-xl hover:bg-navy/90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                  >
                    {t.proceed}
                  </button>
                  <button 
                    onClick={() => setPendingSingleArtist(null)}
                    className="w-full py-3.5 bg-white border-2 border-navy/20 text-navy font-bold text-sm rounded-xl hover:bg-navy/5 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}

        {/* Spotify API Error 안내 모달 (UX 라이팅 가이드 준수) */}
        {spotifyError && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSpotifyError(null)}
              className="fixed inset-0 bg-black/45 backdrop-blur-[2px] z-50 cursor-pointer"
            />
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center pointer-events-none">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-sm bg-[#F5F2ED] border-2 border-navy p-6 rounded-2xl shadow-xl flex flex-col items-center text-center pointer-events-auto"
              >
                <div className="w-12 h-12 rounded-full bg-[#E67E22]/10 flex items-center justify-center mb-4">
                  <Disc className="w-6 h-6 text-[#E67E22] animate-spin" />
                </div>
                
                <h3 className="text-base font-bold text-navy mb-2">
                  {spotifyError === "429" ? "음원 정보를 가져올 수 없어요" : "일시적인 연결 오류가 발생했어요"}
                </h3>
                
                <p className="text-xs text-navy/70 leading-relaxed mb-6 whitespace-pre-line">
                  {spotifyError === "429" 
                    ? "지금 음악 검색 서비스를 이용하는 분이 너무 많아 스포티파이 서버가 지쳤나 봐요.\n\n하지만 걱정 마세요! 이미 준비해 둔 인기 아티스트 목록이나 저장된 캐시 정보로 계속 서비스를 시작할 수 있어요."
                    : "스포티파이 서버와 연결하는 도중 잠시 문제가 발생했어요. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요."}
                </p>
                
                <div className="flex flex-col gap-2 w-full">
                  <button 
                    onClick={() => setSpotifyError(null)}
                    className="w-full py-3 bg-navy text-cream font-bold text-xs rounded-xl hover:bg-navy/90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                  >
                    {spotifyError === "429" ? "인기 목록에서 고를래요" : "확인"}
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
