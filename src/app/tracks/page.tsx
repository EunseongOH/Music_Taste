"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Compass, Disc, Search, Plus, X, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { SafeImage } from "@/components/SafeImage";
import BackButton from "@/components/BackButton";
import { Sheet, Toast, primaryButton, secondaryButton, dangerButton, textLink } from "@/components/space/SpaceUI";
import ProfileHeader from "@/components/ProfileHeader";
import { getArtistAlbums, getAlbumTracks } from "@/utils/spotify";
import { saveTrackSelectionDraft, loadActiveDraft, deleteActiveDraft, downgradeDraftToArtistSelection } from "@/utils/worldcupDb";
import { trackEvent } from "@/utils/gtag";
import { MIX_MATCH } from "@/config/modes";
import { fetchUnreleasedTracksForArtist } from "@/utils/unreleasedDb";
import FeedbackModal from "@/components/FeedbackModal";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { coverPlaceholder } from "@/utils/coverPlaceholder";
import { songKey, betterTitle } from "@/utils/songKey";
import SpotifyLink from "@/components/SpotifyLink";
import { AlbumCard, useAlbumAccordion } from "@/components/album/AlbumCard";
import UnreleasedDialog, { getYouTubeVideoId, type AddedUnreleasedTrack } from "@/components/album/UnreleasedDialog";

const translations = {
  ko: {
    loadingTitle: "트랙 정리 중...",
    loadingDesc: "아티스트의 발매곡 정보를 받아오고 있어요",
    title: "트랙 디깅하기",
    subtitle: "앨범 커버를 탭해서 수록곡을 파헤쳐보세요",
    searchPlaceholder: "선택한 아티스트의 곡 제목 검색...",
    searchResults: "검색 결과",
    searching: "트랙을 검색하는 중...",
    noSearchResults: "선택한 아티스트 범위에 일치하는 트랙이 없어요. 🔍",
    albumLoading: "앨범 로딩 중...",
    openAlbums: "앨범 및 트랙 목록 열기",
    loadingFromSpotify: "스포티파이에서 앨범을 불러오고 있어요...",
    selectAll: "전체 선택",
    clearAll: "전체 해제",
    loadingTracks: "트랙을 불러오는 중...",
    noTracks: "이 앨범의 수록곡은 아직 준비 중이에요. 다른 앨범을 골라주세요.",
    close: "닫기",
    prev: "이전",
    next: "다음",
    unreleased: "미발매곡",
    addUnreleasedBtn: "미발매곡 추가",
    reportInfoBtn: "곡 정보가 잘못됐나요?",
    createWorldCup: "월드컵 대진 만드는 중",
    startWorldCup: "월드컵 시작하기",
    fetchingAllTracks: "발매곡 수집 중...",
    selectMore: "최소 {count}곡을 더 선택해 주세요",
    addUnreleasedModalTitle: "미발매곡 추가",
    trackTitleLabel: "곡 제목",
    trackTitlePlaceholder: "예: 미공개 자작곡 1번",
    videoUrlLabel: "공연 영상 링크",
    videoUrlPlaceholder: "유튜브 링크 등",
    dateLabel: "공연 날짜",
    infoText1: "공연 영상을 등록하면 유튜브 썸네일이 앨범 커버로 자동 적용돼요.",
    infoText2: "공식 승인 전이라도 ",
    infoText3: "월드컵 대진에 바로 넣을 수 있어요.",
    infoText4: "",
    submitAdd: "추가하기",
    unreleasedSavedDb: "미발매곡 등록을 요청했어요. 승인 대기 중이라도 월드컵 대진에 바로 쓸 수 있어요!",
    unreleasedSavedTemp: "아쉽게도 저장 과정에 문제가 생겼지만, 지금 바로 사용할 수 있어요!",
    unreleasedGuest: "로그인하지 않은 상태예요. 임시로 추가되어 바로 쓸 수 있지만, 브라우저를 닫으면 사라질 수 있어요.",
    confirm: "확인",
    needAtLeast4: "월드컵을 하려면 최소 4곡을 골라야 해요.",
  },
  en: {
    loadingTitle: "Organizing Tracks...",
    loadingDesc: "Fetching release information from the artists",
    title: "Digging Tracks",
    subtitle: "Tap album covers to explore their tracks",
    searchPlaceholder: "Search track titles of selected artists...",
    searchResults: "Search Results",
    searching: "Searching tracks...",
    noSearchResults: "No matching tracks found for the selected artists. 🔍",
    albumLoading: "Loading albums...",
    openAlbums: "Open albums & tracks list",
    loadingFromSpotify: "Loading albums from Spotify...",
    selectAll: "Select All",
    clearAll: "Deselect All",
    loadingTracks: "Loading tracks...",
    noTracks: "We don't have this album's tracks yet. Try another album.",
    close: "Close",
    prev: "Prev",
    next: "Next",
    unreleased: "Unreleased Tracks",
    addUnreleasedBtn: "Add Unreleased Track",
    reportInfoBtn: "Something wrong with this info?",
    createWorldCup: "Preparing lineup...",
    startWorldCup: "Start World Cup",
    fetchingAllTracks: "Fetching releases...",
    selectMore: "Select {count} more track(s)",
    addUnreleasedModalTitle: "Add Unreleased Track",
    trackTitleLabel: "Track Title",
    trackTitlePlaceholder: "e.g., Unreleased Song #1",
    videoUrlLabel: "Performance Video Link",
    videoUrlPlaceholder: "YouTube link, etc.",
    dateLabel: "Performance Date",
    infoText1: "Registering a video automatically uses the YouTube thumbnail as custom album art.",
    infoText2: "Even before official approval, you can ",
    infoText3: "immediately include it",
    infoText4: " in your song lineup.",
    submitAdd: "Add",
    unreleasedSavedDb: "Track submission requested. You can use it in your song lineup right away!",
    unreleasedSavedTemp: "Failed to save to database, but it has been added temporarily for now!",
    unreleasedGuest: "Using guest mode. The track is added temporarily but may be lost when the browser closes.",
    confirm: "Okay",
    needAtLeast4: "You need at least 4 tracks.",
  }
};

// --- DUMMY DATA STRUCTURE ---
interface Track {
  id: string;
  title: string;
  duration: string;
}

interface Album {
  id: string;
  title: string;
  type: "Album" | "Single" | "EP";
  year: string;
  image: string;
  /** 재킷 2순위 (1순위가 404 일 때) */
  image2?: string;
  tracks: Track[];
  totalTracks?: number;
}

interface ArtistGroup {
  id: string;
  name: string;
  image: string;
  albums: Album[];
  unreleasedAlbums?: Album[]; // decoupled virtual single albums
  albumsLoaded?: boolean;
  totalReleases?: number;
  albumsPage?: number; // 0-based page index
  allAlbums?: (Album | null)[]; // Cache of all albums loaded across all pages
  backgroundLoading?: boolean; // Is background loading active?
  backgroundProgress?: { loaded: number; total: number }; // Progress indicator values
}

/**
 * 머리말에 적는 "N Tracks". 월드컵에 실제로 올라가는 곡 수와 같아야 한다.
 *
 * 앨범이 말하는 곡 수(total_tracks)를 그냥 더하면 안 된다. 같은 곡을 리패키지·라이브·
 * 일본어판으로 여러 번 낸 아이돌은 그 수가 실제로 고를 수 있는 곡 수보다 훨씬 크다.
 * "전체 선택"과 같은 규칙(songKey)으로 세야 머리말과 시작 버튼의 숫자가 맞는다.
 * 아직 수록곡을 안 받은 앨범은 셀 방법이 없으니 앨범이 말하는 수를 그대로 더한다.
 */
/**
 * 고른 곡 중 월드컵에 실제로 올라가는 것만 남긴다.
 *
 * 같은 곡을 리패키지·라이브·일본어판으로 여러 번 낸 아티스트에서, 앨범을 통째로 고르면
 * 같은 곡이 여러 번 담긴다. 월드컵으로 넘길 때(handleStartWorldCup)는 이미 songKey 로
 * 걸러 내고 있었는데 화면에 적는 수는 안 걸러서, 뉴진스는 46곡이라고 적고 28곡만 넘어갔다.
 * 세는 쪽과 넘기는 쪽이 같은 함수를 써야 한다.
 */
function distinctSongIds(ids: Set<string>, meta: Record<string, any>): Set<string> {
  const best = new Map<string, string>();      // 곡 키 -> 남길 트랙 ID
  for (const id of ids) {
    const m = meta[id];
    const key = m?.title ? songKey(m.artistName ?? "", m.title) : id;   // 메타가 없으면 따로 센다
    const prev = best.get(key);
    // 판 표기가 없는 쪽을 남긴다 (handleStartWorldCup 과 같은 규칙)
    if (!prev || betterTitle(meta[prev]?.title ?? "", m?.title ?? "") > 0) best.set(key, id);
  }
  return new Set(best.values());
}

function countDistinctTracks(artist: ArtistGroup, singleMode: boolean): number {
  const keys = new Set<string>();
  let pending = 0, loaded = 0;
  for (const album of artist.allAlbums || artist.albums) {
    if (!album) continue;
    if (!album.tracks.length) { pending += album.totalTracks || 0; continue; }
    loaded++;
    for (const t of album.tracks) keys.add(songKey(artist.name, t.title));
  }
  // 미발매곡은 "전체 선택"이 중복을 가리지 않고 통째로 넣는다. 세는 쪽도 똑같이 한다
  const unreleased = (artist.unreleasedAlbums ?? []).reduce((n, a) => n + a.tracks.length, 0);

  // 전곡 모드에서 배경 수집이 끝났는데도 수록곡이 없는 앨범은, 앞으로도 안 들어온다
  // (우리 DB 에 없고 Spotify 하루 예산도 다 쓴 경우다). 그걸 세면 "70곡" 이라 적어 놓고
  // 52곡만 고를 수 있게 된다. 못 받은 건 빼고, 실제로 고를 수 있는 수만 적는다.
  const settled = singleMode && artist.albumsLoaded && !artist.backgroundLoading && loaded > 0;
  return keys.size + unreleased + (settled ? 0 : pending);
}

export default function TracksPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [artistData, setArtistData] = useState<ArtistGroup[]>([]);
  const [expandedArtistId, setExpandedArtistId] = useState<string | null>(null);
  /*
   * 앨범 펼침(하나만 열림·자동 스크롤·동작 줄이기)은 같이 소트하기와 공용이다.
   * src/components/album/AlbumCard.tsx
   */
  const { openId: expandedAlbumId, setOpenId: setExpandedAlbumId, toggle: toggleAlbum, cardRef, reduceMotion } = useAlbumAccordion();
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  
  // Advanced Selection Metadata Cache & Debounced Search States
  const [selectedTracksMetadata, setSelectedTracksMetadata] = useState<Record<string, any>>({});
  // 화면에 적는 곡 수. 월드컵에 실제로 올라가는 수와 같아야 한다.
  const pickedIds = useMemo(() => distinctSongIds(selectedTrackIds, selectedTracksMetadata),
    [selectedTrackIds, selectedTracksMetadata]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalArtistId, setModalArtistId] = useState<string | null>(null);
  // 오류 제보 모달. 아티스트 컨텍스트를 같이 들고 있어야 제보가 쓸모 있다.
  const [feedbackTarget, setFeedbackTarget] = useState<{ id: string; name: string; albumId?: string; albumTitle?: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [exitWizardStep, setExitWizardStep] = useState<'main' | 'exit_confirm' | null>(null);
  /** 배경 자동저장이 마지막으로 저장한(또는 복원한) 선택 집합. 같으면 저장하지 않는다. */
  const lastSavedSelRef = React.useRef<string>("");
  const [customAlert, setCustomAlert] = useState<string | null>(null);
  React.useEffect(() => {
    if (!customAlert) return;
    const timer = setTimeout(() => setCustomAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [customAlert]);
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      // 믹스 매치를 내린 동안에는 ?mode 가 없어도 단일이 기본이다 — docs/mode-pivot.md
      setIsSingleArtistMode(!MIX_MATCH || params.get("mode") === "single");
      setLocale(getSafeLocale());
    }
  }, []);

  // Reload prevention for unsaved changes
  React.useEffect(() => {
    if (selectedTrackIds.size === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedTrackIds.size]);

  // Back button interception
  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedTrackIds.size > 0) {
      setExitWizardStep('main');
    } else {
      router.push(isSingleArtistMode ? "/explore?mode=single" : "/explore");
    }
  };

  const handleReturnToArtists = async () => {
    setExitWizardStep(null);
    
    // Clear track selections locally
    localStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_tracks");
    setSelectedTrackIds(new Set());
    setSelectedTracksMetadata({});

    // Update draft to artist_selection status and wipe selected_tracks in Supabase
    if (user) {
      try {
        const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
        await downgradeDraftToArtistSelection(selectedArtists, isSingleArtistMode);
      } catch (err) {
        console.error("Error downgrading draft state to artist_selection:", err);
      }
    }
    
    router.push(isSingleArtistMode ? "/explore?mode=single" : "/explore");
  };

  const handleConfirmSaveExit = async () => {
    setExitWizardStep(null);
    
    // Build full tracks data using metadata cache and fallback search
    const selectedTracksData: any[] = [];
    selectedTrackIds.forEach(id => {
      if (selectedTracksMetadata[id]) {
        selectedTracksData.push(selectedTracksMetadata[id]);
      } else {
        artistData.forEach(artist => {
          artist.albums.forEach(album => {
            const track = album.tracks.find(t => t.id === id);
            if (track) {
              selectedTracksData.push({
                ...track,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              });
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
          }
        });
      }
    });

    const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
    if (storedTracksStr) {
      try {
        const previouslyLoadedTracks = JSON.parse(storedTracksStr);
        previouslyLoadedTracks.forEach((t: any) => {
          if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
            selectedTracksData.push(t);
          }
        });
      } catch (e) {}
    }

    const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
    await saveTrackSelectionDraft(selectedArtists, selectedTracksData, isSingleArtistMode);
    router.push("/");
  };

  const handleDiscardExit = async () => {
    setExitWizardStep(null);
    if (user) {
      await deleteActiveDraft(isSingleArtistMode);
    }
    localStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_tracks");
    router.push("/");
  };

  // Load selection draft & initial artists
  React.useEffect(() => {
    const fetchSpotifyData = async () => {
      let stored = sessionStorage.getItem('selectedArtists') || localStorage.getItem('selectedArtists');

      const params = new URLSearchParams(window.location.search);
      const isSingle = params.get("mode") === "single";

      // Load from active draft in Supabase if user is logged in
      if (user) {
        try {
          const draft = await loadActiveDraft(isSingle);
          if (draft) {
            if (draft.selected_artists && draft.selected_artists.length > 0) {
              // In single-artist mode, only keep the first (single) artist
              const draftArtists = isSingle ? draft.selected_artists.slice(0, 1) : draft.selected_artists;
              stored = JSON.stringify(draftArtists);
              sessionStorage.setItem('selectedArtists', stored);
              localStorage.setItem('selectedArtists', stored);
            }
            if (draft.selected_tracks && draft.selected_tracks.length > 0) {
              let tracksToLoad = draft.selected_tracks;

              // Build the set of valid artist IDs/names from the draft's own artist list
              if (draft.selected_artists && draft.selected_artists.length > 0) {
                if (isSingle) {
                  // Single-artist mode: only tracks belonging to the one artist
                  const singleArtistName = draft.selected_artists[0]?.name?.toLowerCase();
                  tracksToLoad = draft.selected_tracks.filter((t: any) =>
                    typeof t === 'object' && t !== null &&
                    (t.artistName?.toLowerCase() === singleArtistName)
                  );
                } else {
                  // Multi-artist mode: only tracks whose artist is in the selected list
                  const validArtistIds = new Set(
                    draft.selected_artists.map((a: any) => a.id?.toLowerCase()).filter(Boolean)
                  );
                  const validArtistNames = new Set(
                    draft.selected_artists.map((a: any) => a.name?.toLowerCase()).filter(Boolean)
                  );
                  tracksToLoad = draft.selected_tracks.filter((t: any) => {
                    if (typeof t !== 'object' || t === null) return false;
                    // Match by artistId first, fall back to artistName
                    const byId = t.artistId && validArtistIds.has(t.artistId.toLowerCase());
                    const byName = t.artistName && validArtistNames.has(t.artistName.toLowerCase());
                    return byId || byName;
                  });
                }
              }

              if (tracksToLoad.length > 0) {
                // Hydrate local storages with full track metadata
                const tracksStr = JSON.stringify(tracksToLoad);
                sessionStorage.setItem("worldcup_tracks", tracksStr);
                localStorage.setItem("worldcup_tracks", tracksStr);

                // Set selected track IDs
                const loadedTrackIds = tracksToLoad.map((t: any) => typeof t === 'string' ? t : t.id);
                lastSavedSelRef.current = [...loadedTrackIds].sort().join(",");
                setSelectedTrackIds(new Set(loadedTrackIds));

                // Load metadata cache
                const metadataMap: Record<string, any> = {};
                tracksToLoad.forEach((t: any) => {
                  if (typeof t === 'object' && t !== null) {
                    metadataMap[t.id] = t;
                  }
                });
                setSelectedTracksMetadata(metadataMap);
              } else {
                // No valid tracks for this mode — clear any stale storage
                sessionStorage.removeItem("worldcup_tracks");
                localStorage.removeItem("worldcup_tracks");
              }
            }
          }
        } catch (err) {
          console.error("Error loading active draft from Supabase:", err);
        }
      }

      // Fallback to user_metadata from Supabase
      if (!stored && user?.user_metadata?.selected_artists) {
        const artistsData = user.user_metadata.selected_artists;
        const normalizedArtists = isSingle ? artistsData.slice(0, 1) : artistsData;
        stored = JSON.stringify(normalizedArtists);
        sessionStorage.setItem('selectedArtists', stored);
        localStorage.setItem('selectedArtists', stored);
      }

      // Sync metadata cache from storage fallbacks
      const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      if (storedTracksStr) {
        try {
          const previouslyLoadedTracks: any[] = JSON.parse(storedTracksStr);

          // Validate stored tracks match the current artist selection
          let validTracks = previouslyLoadedTracks;
          if (stored) {
            try {
              const parsedArtists: { id?: string; name?: string }[] = JSON.parse(stored);
              if (isSingle) {
                const singleArtistName = parsedArtists[0]?.name?.toLowerCase();
                if (singleArtistName) {
                  validTracks = previouslyLoadedTracks.filter((t: any) =>
                    t.artistName?.toLowerCase() === singleArtistName
                  );
                }
              } else {
                // Multi-artist mode: keep only tracks that belong to a selected artist
                const validIds = new Set(
                  parsedArtists.map(a => a.id?.toLowerCase()).filter(Boolean)
                );
                const validNames = new Set(
                  parsedArtists.map(a => a.name?.toLowerCase()).filter(Boolean)
                );
                validTracks = previouslyLoadedTracks.filter((t: any) => {
                  const byId = t.artistId && validIds.has(t.artistId.toLowerCase());
                  const byName = t.artistName && validNames.has(t.artistName.toLowerCase());
                  return byId || byName;
                });
              }
              // If filtering changed the list, update storage to remove stale tracks
              if (validTracks.length !== previouslyLoadedTracks.length) {
                const cleanStr = JSON.stringify(validTracks);
                sessionStorage.setItem("worldcup_tracks", cleanStr);
                localStorage.setItem("worldcup_tracks", cleanStr);
              }
            } catch (e) {}
          }

          if (validTracks.length > 0) {
            const metadataMap: Record<string, any> = {};
            const loadedTrackIds: string[] = [];
            validTracks.forEach((t: any) => {
              metadataMap[t.id] = t;
              loadedTrackIds.push(t.id);
            });
            setSelectedTracksMetadata(prev => ({ ...prev, ...metadataMap }));
            if (selectedTrackIds.size === 0 && loadedTrackIds.length > 0) {
              setSelectedTrackIds(new Set(loadedTrackIds));
            }
          }
        } catch (e) {}
      }

      if (!stored) {
         setIsLoaded(true);
         return;
      }
      try {
        const parsed = JSON.parse(stored);
        // In single-artist mode: strictly enforce only 1 artist
        const artistsToLoad = isSingle ? parsed.slice(0, 1) : parsed;
        if (artistsToLoad.length > 0) {
          const initialData = artistsToLoad.map((a: any) => ({
            id: a.id,
            name: a.name,
            image: a.image,
            albums: [], 
            unreleasedAlbums: [],
            albumsLoaded: false,
            totalReleases: 0,
            albumsPage: 0
          }));
          setArtistData(initialData);
        }
      } catch (e) {
        console.error("Failed to parse spotify data", e);
      }
      setIsLoaded(true);
    };

    fetchSpotifyData();
  }, [user]);

  // Auto-expand single artist on mount in Single-Artist Mode
  React.useEffect(() => {
    if (isLoaded && isSingleArtistMode && artistData.length === 1) {
      const singleArtist = artistData[0];
      if (!singleArtist.albumsLoaded && !loadingAlbums.has(`artist_${singleArtist.id}`)) {
        toggleArtistAccordion(singleArtist.id);
      }
    }
  }, [isLoaded, isSingleArtistMode, artistData]);

  // Save selected tracks to Supabase in the background
  //
  // 선택이 실제로 바뀌었을 때만 저장한다. 마운트 직후 복원된 선택으로도 저장하면
  // 월드컵 진행 중(status=playing)인 초안을 track_selection 으로 강등시켜,
  // 홈의 이어하기가 트랙 디깅 단계로 가 버린다 (docs/worldcup-draft-plan.md 1-2).
  React.useEffect(() => {
    if (!user || artistData.length === 0) return;
    const selKey = [...selectedTrackIds].sort().join(",");
    if (selKey === lastSavedSelRef.current) return;
    const saveTrackDraft = async () => {
      lastSavedSelRef.current = selKey;
      const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
      
      const selectedTracksData: any[] = [];
      selectedTrackIds.forEach(id => {
        if (selectedTracksMetadata[id]) {
          selectedTracksData.push(selectedTracksMetadata[id]);
        } else {
          artistData.forEach(artist => {
            artist.albums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
            if (artist.unreleasedAlbums) {
              artist.unreleasedAlbums.forEach(album => {
                const track = album.tracks.find(t => t.id === id);
                if (track) {
                  selectedTracksData.push({
                    ...track,
                    artistName: artist.name,
                    albumTitle: album.title,
                    albumImage: album.image,
                    albumId: album.id
                  });
                }
              });
            }
          });
        }
      });

      const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
      if (storedTracksStr) {
        try {
          const previouslyLoadedTracks = JSON.parse(storedTracksStr);
          previouslyLoadedTracks.forEach((t: any) => {
            if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
              selectedTracksData.push(t);
            }
          });
        } catch (e) {}
      }

      await saveTrackSelectionDraft(selectedArtists, selectedTracksData, isSingleArtistMode);
      
      sessionStorage.setItem("worldcup_tracks", JSON.stringify(selectedTracksData));
      localStorage.setItem("worldcup_tracks", JSON.stringify(selectedTracksData));
    };
    
    const timer = setTimeout(() => {
      saveTrackDraft();
    }, 1500); 
    return () => clearTimeout(timer);
  }, [selectedTrackIds, artistData, user, selectedTracksMetadata]);

  // Debounced search effect
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const artistIds = artistData.map(a => a.id).join(",");
        const artistNames = artistData.map(a => a.name).join(",");
        
        const response = await fetch(`/api/spotify-search?q=${encodeURIComponent(searchQuery)}&artistIds=${artistIds}&artistNames=${artistNames}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("Search fetch failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, artistData]);

  const loadRemainingPagesInBackground = async (artistId: string, totalReleases: number, artistName: string) => {
    const totalPages = Math.ceil(totalReleases / 10);
    if (totalPages <= 1) return;

    for (let page = 1; page < totalPages; page++) {
      // 800ms delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 800));

      try {
        const offset = page * 10;
        const albumsData = await getArtistAlbums(artistId, offset, 10);
        
        const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
          id: albumRaw.id,
          title: albumRaw.name,
          type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
          year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
          image: albumRaw.images?.[0]?.url || coverPlaceholder(albumRaw.id),
          image2: albumRaw.images?.[1]?.url || "",
          tracks: [],
          totalTracks: albumRaw.total_tracks || 0
        }));

        // Fetch tracks for all these albums
        const finalAlbums = await Promise.all(
          mappedAlbums.map(async (album: any) => {
            try {
              const tracksRaw = await getAlbumTracks(album.id);
              const tracks = tracksRaw.map((t: any) => {
                const totalSeconds = Math.floor(t.duration_ms / 1000);
                const mins = Math.floor(totalSeconds / 60);
                const secs = String(totalSeconds % 60).padStart(2, '0');
                return {
                  id: t.id,
                  title: t.name,
                  duration: `${mins}:${secs}`,
                  previewUrl: t.preview_url
                };
              });

              // Auto-select these tracks
              setSelectedTrackIds(prev => {
                const next = new Set(prev);
                tracks.forEach((track: any) => next.add(track.id));
                return next;
              });

              setSelectedTracksMetadata(prev => {
                const next = { ...prev };
                tracks.forEach((track: any) => {
                  next[track.id] = {
                    id: track.id,
                    title: track.title,
                    duration: track.duration,
                    artistName: artistName,
                    albumTitle: album.title,
                    albumImage: album.image,
                    albumId: album.id
                  };
                });
                return next;
              });

              return { ...album, tracks };
            } catch (e) {
              console.error("Failed to load background tracks for album " + album.id, e);
              return album;
            }
          })
        );

        // Update cached allAlbums state
        setArtistData(prev => prev.map(a => {
          if (a.id === artistId) {
            const currentAllAlbums = a.allAlbums ? [...a.allAlbums] : [];
            // Merge in the newly fetched albums
            for (let i = 0; i < finalAlbums.length; i++) {
              currentAllAlbums[offset + i] = finalAlbums[i];
            }

            const loadedCount = currentAllAlbums.filter(Boolean).length;

            return {
              ...a,
              allAlbums: currentAllAlbums,
              backgroundProgress: { loaded: loadedCount, total: totalReleases },
              backgroundLoading: page < totalPages - 1
            };
          }
          return a;
        }));

      } catch (err) {
        console.error(`Failed to load page ${page} in background:`, err);
      }
    }

    // Set backgroundLoading to false explicitly at the end
    setArtistData(prev => prev.map(a => 
      a.id === artistId ? { ...a, backgroundLoading: false } : a
    ));
  };

  const toggleArtistAccordion = async (artistId: string) => {
    if (expandedArtistId === artistId) {
      setExpandedArtistId(null);
    } else {
      setExpandedArtistId(artistId);

      // Lazy load page 1 of albums for this artist
      const artist = artistData.find(a => a.id === artistId);
      if (artist && !artist.albumsLoaded) {
        setLoadingAlbums(prev => new Set(prev).add(`artist_${artistId}`));
        try {
          const albumsData = await getArtistAlbums(artistId, 0, 10);
          const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
            id: albumRaw.id,
            title: albumRaw.name,
            type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
            year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
            image: albumRaw.images?.[0]?.url || coverPlaceholder(albumRaw.id),
            image2: albumRaw.images?.[1]?.url || "",
            tracks: [], 
            totalTracks: albumRaw.total_tracks || 0
          }));

          // Fetch unreleased tracks from Supabase and map them to custom virtual Single albums
          let unreleasedAlbumsList: Album[] = [];
          try {
            const dbUnreleased = await fetchUnreleasedTracksForArtist(artistId);
            if (dbUnreleased && dbUnreleased.length > 0) {
              unreleasedAlbumsList = dbUnreleased.map((t: any) => {
                const youtubeId = getYouTubeVideoId(t.videoUrl || t.video_url || "");
                const coverImage = youtubeId 
                  ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
                  : coverPlaceholder(t.id);
                
                const trackYear = t.releaseDate 
                  ? t.releaseDate.substring(0, 4) 
                  : t.release_date 
                    ? t.release_date.substring(0, 4) 
                    : new Date().getFullYear().toString();

                return {
                  id: `al_unreleased_${t.id}`,
                  title: t.title, // album title matches track name perfectly
                  type: "Single" as const,
                  year: trackYear,
                  image: coverImage,
                  tracks: [
                    {
                      id: t.id,
                      title: t.title,
                      duration: "Live"
                    }
                  ],
                  totalTracks: 1
                };
              });
            }
          } catch (err) {
            console.error("Failed to fetch unreleased tracks from Supabase:", err);
          }

          let finalAlbums = mappedAlbums;
          if (isSingleArtistMode) {
            finalAlbums = await Promise.all(
              mappedAlbums.map(async (album: any) => {
                try {
                  const tracksRaw = await getAlbumTracks(album.id);
                  const tracks = tracksRaw.map((t: any) => {
                    const totalSeconds = Math.floor(t.duration_ms / 1000);
                    const mins = Math.floor(totalSeconds / 60);
                    const secs = String(totalSeconds % 60).padStart(2, '0');
                    return {
                      id: t.id,
                      title: t.name,
                      duration: `${mins}:${secs}`,
                      previewUrl: t.preview_url
                    };
                  });
                  
                  setSelectedTrackIds(prev => {
                    const next = new Set(prev);
                    tracks.forEach((track: any) => next.add(track.id));
                    return next;
                  });

                  setSelectedTracksMetadata(prev => {
                    const next = { ...prev };
                    tracks.forEach((track: any) => {
                      next[track.id] = {
                        id: track.id,
                        title: track.title,
                        duration: track.duration,
                        artistName: artist.name,
                        albumTitle: album.title,
                        albumImage: album.image,
                        albumId: album.id
                      };
                    });
                    return next;
                  });

                  return { ...album, tracks };
                } catch (e) {
                  console.error("Failed to load tracks for album " + album.id, e);
                  return album;
                }
              })
            );

            if (unreleasedAlbumsList.length > 0) {
              setSelectedTrackIds(prev => {
                const next = new Set(prev);
                unreleasedAlbumsList.forEach(album => {
                  album.tracks.forEach(track => next.add(track.id));
                });
                return next;
              });

              setSelectedTracksMetadata(prev => {
                const next = { ...prev };
                unreleasedAlbumsList.forEach(album => {
                  album.tracks.forEach(track => {
                    next[track.id] = {
                      id: track.id,
                      title: track.title,
                      duration: track.duration,
                      artistName: artist.name,
                      albumTitle: album.title,
                      albumImage: album.image,
                      albumId: album.id
                    };
                  });
                });
                return next;
              });
            }
          }

          setArtistData(prev => prev.map(a => {
            if (a.id === artistId) {
              const updatedAllAlbums = Array(albumsData.total).fill(null);
              for (let i = 0; i < finalAlbums.length; i++) {
                updatedAllAlbums[i] = finalAlbums[i];
              }

              return { 
                ...a, 
                albums: finalAlbums, 
                unreleasedAlbums: unreleasedAlbumsList,
                albumsLoaded: true, 
                totalReleases: albumsData.total,
                albumsPage: 0,
                allAlbums: updatedAllAlbums,
                backgroundLoading: isSingleArtistMode && albumsData.total > 10,
                backgroundProgress: isSingleArtistMode && albumsData.total > 10 
                  ? { loaded: 10, total: albumsData.total } 
                  : undefined
              };
            }
            return a;
          }));

          if (isSingleArtistMode && albumsData.total > 10) {
            loadRemainingPagesInBackground(artistId, albumsData.total, artist.name);
          }
        } catch (e) {
          console.error("Failed to load albums for artist", e);
        } finally {
          setLoadingAlbums(prev => {
            const next = new Set(prev);
            next.delete(`artist_${artistId}`);
            return next;
          });
        }
      }
    }
    setExpandedAlbumId(null); 
  };

  // Change album pagination page (server-side getArtistAlbums limit=10)
  const handleArtistAlbumsPageChange = async (artistId: string, targetPage: number) => {
    const artist = artistData.find(a => a.id === artistId);
    if (!artist) return;

    // Check cache
    const offset = targetPage * 10;
    const isCached = artist.allAlbums && 
                     artist.allAlbums.length > offset && 
                     artist.allAlbums.slice(offset, offset + 10).every(a => a && a.tracks && a.tracks.length > 0);

    if (isCached && artist.allAlbums) {
      const cachedAlbums = artist.allAlbums.slice(offset, offset + 10) as Album[];
      setArtistData(prev => prev.map(a => 
        a.id === artistId 
          ? { 
              ...a, 
              albums: cachedAlbums, 
              albumsPage: targetPage
            } 
          : a
      ));
      setExpandedAlbumId(null);
      return;
    }

    setLoadingAlbums(prev => new Set(prev).add(`artist_${artistId}`));
    try {
      const albumsData = await getArtistAlbums(artistId, offset, 10);
      
      const mappedAlbums = albumsData.items.map((albumRaw: any) => ({
        id: albumRaw.id,
        title: albumRaw.name,
        type: albumRaw.album_type === 'single' ? 'Single' : albumRaw.album_type === 'ep' ? 'EP' : 'Album',
        year: albumRaw.release_date ? albumRaw.release_date.substring(0, 4) : "",
        image: albumRaw.images?.[0]?.url || coverPlaceholder(albumRaw.id),
        image2: albumRaw.images?.[1]?.url || "",
        tracks: [],
        totalTracks: albumRaw.total_tracks || 0
      }));

      let finalAlbums = mappedAlbums;
      if (isSingleArtistMode) {
        finalAlbums = await Promise.all(
          mappedAlbums.map(async (album: any) => {
            try {
              const tracksRaw = await getAlbumTracks(album.id);
              const tracks = tracksRaw.map((t: any) => {
                const totalSeconds = Math.floor(t.duration_ms / 1000);
                const mins = Math.floor(totalSeconds / 60);
                const secs = String(totalSeconds % 60).padStart(2, '0');
                return {
                  id: t.id,
                  title: t.name,
                  duration: `${mins}:${secs}`,
                  previewUrl: t.preview_url
                };
              });
              
              setSelectedTrackIds(prev => {
                const next = new Set(prev);
                tracks.forEach((track: any) => next.add(track.id));
                return next;
              });

              setSelectedTracksMetadata(prev => {
                const next = { ...prev };
                tracks.forEach((track: any) => {
                  next[track.id] = {
                    id: track.id,
                    title: track.title,
                    duration: track.duration,
                    artistName: artist.name,
                    albumTitle: album.title,
                    albumImage: album.image,
                    albumId: album.id
                  };
                });
                return next;
              });

              return { ...album, tracks };
            } catch (e) {
              console.error("Failed to load tracks for album " + album.id, e);
              return album;
            }
          })
        );
      }

      setArtistData(prev => prev.map(a => {
        if (a.id === artistId) {
          const updatedAllAlbums = a.allAlbums ? [...a.allAlbums] : [];
          for (let i = 0; i < finalAlbums.length; i++) {
            updatedAllAlbums[offset + i] = finalAlbums[i];
          }

          return { 
            ...a, 
            albums: finalAlbums, 
            albumsPage: targetPage,
            totalReleases: albumsData.total,
            allAlbums: updatedAllAlbums
          };
        }
        return a;
      }));
      
      setExpandedAlbumId(null);
    } catch (e) {
      console.error("Failed to change album page:", e);
    } finally {
      setLoadingAlbums(prev => {
        const next = new Set(prev);
        next.delete(`artist_${artistId}`);
        return next;
      });
    }
  };

  /** 앨범을 펼치거나 접는다. 펼칠 때 수록곡이 아직 없으면 그때 받아 온다. */
  const handleAlbumClick = (albumId: string, artistId: string) => {
    if (expandedAlbumId !== albumId) void loadAlbumTracks(albumId, artistId);
    toggleAlbum(albumId);
  };

  const loadAlbumTracks = async (albumId: string, artistId: string) => {
    // 미발매곡은 가상 싱글이라 곡이 이미 안에 들어 있다
    if (albumId.startsWith("al_unreleased_")) return;

    // Check if we already have tracks for this album
    const isLoaded = artistData.some(artist =>
      artist.albums.some(album => album.id === albumId && album.tracks && album.tracks.length > 0)
    );
    if (isLoaded) return;
    if (loadingAlbums.has(albumId)) return;

    setLoadingAlbums(prev => new Set(prev).add(albumId));
    try {
      const tracksRaw = await getAlbumTracks(albumId);
      const tracks = tracksRaw.map((t: any) => {
        const totalSeconds = Math.floor(t.duration_ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = String(totalSeconds % 60).padStart(2, '0');
        return {
          id: t.id,
          title: t.name,
          duration: `${mins}:${secs}`,
          previewUrl: t.preview_url
        };
      });

      setArtistData(prev => prev.map(artist => {
        if (artist.id === artistId) {
          return {
            ...artist,
            albums: artist.albums.map(album =>
              album.id === albumId ? { ...album, tracks } : album
            )
          };
        }
        return artist;
      }));
    } catch (e) {
      console.error("Failed to load tracks", e);
    } finally {
      setLoadingAlbums(prev => {
        const next = new Set(prev);
        next.delete(albumId);
        return next;
      });
    }
  };

  const toggleTrack = (trackId: string, metadata?: {
    id: string;
    title: string;
    duration: string;
    artistName: string;
    albumTitle: string;
    albumImage: string;
    albumId?: string;
  }) => {
    const newSelected = new Set(selectedTrackIds);
    const newMetadata = { ...selectedTracksMetadata };

    if (newSelected.has(trackId)) {
      newSelected.delete(trackId);
      delete newMetadata[trackId];
    } else {
      newSelected.add(trackId);
      if (metadata) {
        newMetadata[trackId] = metadata;
      } else {
        // Fallback: Populate metadata from state arrays if not supplied
        let found = false;
        artistData.forEach(artist => {
          if (found) return;
          artist.albums.forEach(album => {
            if (found) return;
            const t = album.tracks.find(x => x.id === trackId);
            if (t) {
              newMetadata[trackId] = {
                id: t.id,
                title: t.title,
                duration: t.duration,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              };
              found = true;
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              if (found) return;
              const t = album.tracks.find(x => x.id === trackId);
              if (t) {
                newMetadata[trackId] = {
                  id: t.id,
                  title: t.title,
                  duration: t.duration,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                };
                found = true;
              }
            });
          }
        });
      }
    }
    setSelectedTrackIds(newSelected);
    setSelectedTracksMetadata(newMetadata);
  };

  /** 팝업이 등록을 마치면 화면에 앉힌다 — 가상 싱글 앨범 한 장으로 만들어 바로 고른 상태로 둔다. */
  const handleAddUnreleased = (track: AddedUnreleasedTrack, notice: string) => {
    const albumId = `al_unreleased_${track.id}`;
    const newAlbum: Album = {
      id: albumId,
      title: track.title, // 곡명이랑 앨범명 완벽 매칭
      type: "Single" as const,
      year: track.year,
      image: track.cover,
      tracks: [{ id: track.id, title: track.title, duration: "Live" }],
      totalTracks: 1,
    };

    setArtistData(prev =>
      prev.map(artist =>
        artist.id === modalArtistId
          ? { ...artist, unreleasedAlbums: [newAlbum, ...(artist.unreleasedAlbums || [])] }
          : artist
      )
    );

    toggleTrack(track.id, {
      id: track.id,
      title: track.title,
      duration: "Live",
      artistName: track.artistName,
      albumTitle: track.title,
      albumImage: track.cover,
      albumId,
    });

    setNotification(notice);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleStartWorldCup = async () => {
    // Gather full details for selected tracks
    const selectedTracksData: any[] = [];
    selectedTrackIds.forEach(id => {
      if (selectedTracksMetadata[id]) {
        selectedTracksData.push(selectedTracksMetadata[id]);
      } else {
        artistData.forEach(artist => {
          artist.albums.forEach(album => {
            const track = album.tracks.find(t => t.id === id);
            if (track) {
              selectedTracksData.push({
                ...track,
                artistName: artist.name,
                albumTitle: album.title,
                albumImage: album.image,
                albumId: album.id
              });
            }
          });
          if (artist.unreleasedAlbums) {
            artist.unreleasedAlbums.forEach(album => {
              const track = album.tracks.find(t => t.id === id);
              if (track) {
                selectedTracksData.push({
                  ...track,
                  artistName: artist.name,
                  albumTitle: album.title,
                  albumImage: album.image,
                  albumId: album.id
                });
              }
            });
          }
        });
      }
    });

    // Merge with legacy track list inside sessionStorage
    const storedTracksStr = sessionStorage.getItem("worldcup_tracks") || localStorage.getItem("worldcup_tracks");
    if (storedTracksStr) {
      try {
        const previouslyLoadedTracks = JSON.parse(storedTracksStr);
        previouslyLoadedTracks.forEach((t: any) => {
          if (selectedTrackIds.has(t.id) && !selectedTracksData.some(n => n.id === t.id)) {
            selectedTracksData.push(t);
          }
        });
      } catch (e) {}
    }

    // 마지막 안전장치: 같은 곡이 두 번 들어가면 월드컵에서 같은 곡끼리 붙는다.
    // 앨범을 따로따로 골랐을 때도 여기서 걸린다. 판 표기가 없는 쪽을 남긴다.
    const bySong = new Map<string, any>();
    for (const t of selectedTracksData) {
      const k = songKey(t.artistName ?? "", t.title ?? "");
      const prev = bySong.get(k);
      if (!prev || betterTitle(prev.title, t.title) > 0) bySong.set(k, t);
    }
    const uniqueTracks = [...bySong.values()];

    if (uniqueTracks.length < 4) {
      setCustomAlert(locale === "en" ? translations.en.needAtLeast4 : translations.ko.needAtLeast4);
      return;
    }

    const tracksStr = JSON.stringify(uniqueTracks);
    sessionStorage.setItem("worldcup_tracks", tracksStr);
    localStorage.setItem("worldcup_tracks", tracksStr);

    // Save as track selection draft before pushing
    if (user) {
      try {
        const selectedArtists = artistData.map(a => ({ id: a.id, name: a.name, image: a.image }));
        await saveTrackSelectionDraft(selectedArtists, uniqueTracks, isSingleArtistMode);
      } catch (err) {
        console.error("Error saving draft before tournament:", err);
      }
    }

    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_progress");

    // Trigger GA4 events
    trackEvent("funnel_song_complete", { selected_songs_count: uniqueTracks.length });
    trackEvent("tournament_start", { selected_songs_count: uniqueTracks.length });

    router.push(isSingleArtistMode ? "/worldcup?mode=single" : "/worldcup");
  };

  const t = locale === "en" ? translations.en : translations.ko;

  if (!isLoaded) {
    return (
      <main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="mb-8 relative w-20 h-20 flex items-center justify-center text-point opacity-80"
        >
          <Disc size={80} strokeWidth={1} />
        </motion.div>
        <h1 className="text-2xl text-navy font-bold tracking-tight">{t.loadingTitle}</h1>
        <p className="font-sans text-sm text-charcoal/70 mt-2 font-medium">{t.loadingDesc}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative z-10 w-full mb-10 overflow-hidden bg-[var(--app-bg)]">
      {/* Sticky Header with Toggles & Tabs */}
      <div className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md pt-6 pb-2 border-b border-navy/10 flex flex-col gap-4 mx-[-1.5rem] w-[calc(100%+3rem)] shadow-sm">
        <div className="flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BackButton onClick={handleBackClick} className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
            <h1 className="type-title-1 text-navy">{t.title}</h1>
          </div>
          <ProfileHeader locale={locale} className="" />
        </div>

        <p className="font-sans text-sm text-charcoal/80 px-6">
          {t.subtitle}
        </p>

        {/* Search Bar */}
        <div className="relative w-full px-6 mt-1 mb-1">
          <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
            <Search className="text-navy/50" size={18} strokeWidth={2} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full py-2.5 pl-11 pr-10 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/40 transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-10 flex items-center text-navy/40 hover:text-navy transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {searchQuery.trim() !== "" ? (
        <div className="py-6 pb-32 px-3 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-xl text-navy">{t.searchResults} ({searchResults.length})</h2>
          </div>
          {isSearching ? (
            <div className="py-20 flex flex-col items-center justify-center text-navy/50 gap-3">
              <Disc className="animate-spin text-point/70" size={28} />
              <p className="font-sans text-sm">{t.searching}</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-20 text-center font-sans text-charcoal/50 text-sm">
              {t.noSearchResults}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {searchResults.map((result) => {
                const isSelected = selectedTrackIds.has(result.trackId);
                return (
                  <div
                    key={result.trackId}
                    onClick={() => {
                      toggleTrack(result.trackId, {
                        id: result.trackId,
                        title: result.title,
                        duration: result.duration,
                        artistName: result.artistName,
                        albumTitle: result.albumTitle,
                        albumImage: result.albumImage,
                        albumId: result.albumId
                      });
                    }}
                    className={`flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all active:scale-[0.98] border ${
                      isSelected 
                        ? "bg-[#F1EADC] border-point/30 shadow-[0_4px_15px_rgba(26,42,108,0.06)]" 
                        : "bg-white/60 border-navy/5 hover:border-navy/10 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm shrink-0">
                        <SafeImage src={result.albumImage} alt={result.albumTitle} fill fallbackType="track" className="object-cover" />
                      </div>
                      <div className="text-left max-w-[200px] sm:max-w-[400px]">
                        <h4 className={`font-sans text-sm font-bold line-clamp-1 ${isSelected ? "text-point" : "text-navy"}`}>
                          {result.title}
                        </h4>
                        <p className="font-sans text-xs text-charcoal/60 mt-0.5 line-clamp-1">
                          {result.artistName} • {result.albumTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-charcoal/40 font-sans mr-1">{result.duration}</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "border-point bg-point text-white" : "border-navy/20"
                      }`}>
                        {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Standard Accordion Content */
        <div className="py-6 pb-32 flex flex-col gap-4 px-3">
          {artistData.map((artist, idx) => {
            const isArtistExpanded = expandedArtistId === artist.id;
            return (
              <section id={`artist-section-${artist.id}`} key={artist.id} className="scroll-m-40 flex flex-col border border-navy/10 rounded-[2rem] bg-white/60 p-5 shadow-sm transition-all hover:border-navy/20">
                 {/* Artist Header (Accordion Toggle) */}
                 <div
                    className="flex items-center justify-between cursor-pointer w-full group"
                    onClick={() => toggleArtistAccordion(artist.id)}
                 >
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                         <SafeImage src={artist.image} alt={artist.name} fill sizes="56px" priority={idx === 0} fallbackType="artist" className="object-cover" />
                      </div>
                      <div className="text-left">
                         <h2 className="text-xl text-navy">{artist.name}</h2>
                         <p className="font-sans text-xs text-charcoal/60 mt-0.5">
                           {loadingAlbums.has(`artist_${artist.id}`)
                             ? t.albumLoading
                             : artist.albumsLoaded
                               ? `${countDistinctTracks(artist, isSingleArtistMode)} Tracks${artist.backgroundLoading ? (locale === "ko" ? " (로딩 중...)" : " (Loading...)") : ""} • ${artist.totalReleases || artist.albums.length} Releases`
                               : t.openAlbums}
                         </p>
                      </div>
                    </div>
                    {/* 이 아티스트 묶음의 Spotify 링크백 (약관 II.4). 카드마다가 아니라 묶음에 하나 */}
                    <SpotifyLink href={`https://open.spotify.com/artist/${artist.id}`} />
                 </div>

                 {/* Artist Albums Grid (Accordion Content) */}
                 <AnimatePresence>
                   {isArtistExpanded && (
                     <motion.div
                       initial={{ height: 0, opacity: 0 }}
                       animate={{ height: "auto", opacity: 1 }}
                       exit={{ height: 0, opacity: 0 }}
                       className="overflow-hidden"
                     >
                       <div className="mt-5 mb-2 h-px bg-navy/5 w-full hidden" />
                       {loadingAlbums.has(`artist_${artist.id}`) && artist.albums.length === 0 ? (
                          <div className="py-10 flex flex-col items-center justify-center text-navy/50 gap-3">
                             <Disc className="animate-spin text-point/70" size={28} />
                             <p className="font-sans text-sm">{t.loadingFromSpotify}</p>
                          </div>
                       ) : (
                         <>
                           {isSingleArtistMode && artist.albums.length > 0 && (
                             <div className="flex justify-end gap-2.5 mt-4 px-1.5">
                               <button
                                 type="button"
                                 onClick={() => {
                                   const nextIds = new Set(selectedTrackIds);
                                   const nextMetadata = { ...selectedTracksMetadata };
                                   // 같은 곡은 한 번만 고른다. 정규 앨범 -> EP -> 싱글 순으로, 오래된 것부터 본다.
                                   // (아이돌은 같은 곡을 리패키지·라이브·일본어판으로 여러 번 낸다)
                                   const rank = (ty: string) => (ty === "Album" ? 0 : ty === "EP" ? 1 : 2);
                                   const albumsToSelect = [...(artist.allAlbums || artist.albums)]
                                     .filter((a): a is Album => Boolean(a))
                                     .sort((x, y) => rank(x.type) - rank(y.type) || String(x.year).localeCompare(String(y.year)));
                                   const takenSongs = new Map<string, string>();   // 곡 키 -> 이미 고른 트랙 ID
                                   for (const id of nextIds) {
                                     const m = nextMetadata[id];
                                     if (m?.title) takenSongs.set(songKey(m.artistName ?? artist.name, m.title), id);
                                   }

                                   albumsToSelect.forEach(album => {
                                     if (!album) return;
                                     album.tracks.forEach(track => {
                                       const key = songKey(artist.name, track.title);
                                       const already = takenSongs.get(key);
                                       if (already) {
                                         // 이미 같은 곡이 있다. 판 표기가 없는 쪽을 남긴다
                                         const prev = nextMetadata[already];
                                         if (!prev || betterTitle(prev.title, track.title) <= 0) return;
                                         nextIds.delete(already);
                                         delete nextMetadata[already];
                                       }
                                       takenSongs.set(key, track.id);
                                       nextIds.add(track.id);
                                       nextMetadata[track.id] = {
                                         id: track.id,
                                         title: track.title,
                                         duration: track.duration,
                                         artistName: artist.name,
                                         albumTitle: album.title,
                                         albumImage: album.image,
                                         albumId: album.id
                                       };
                                     });
                                   });

                                   if (artist.unreleasedAlbums) {
                                     artist.unreleasedAlbums.forEach(album => {
                                       album.tracks.forEach(track => {
                                         nextIds.add(track.id);
                                         nextMetadata[track.id] = {
                                           id: track.id,
                                           title: track.title,
                                           duration: track.duration,
                                           artistName: artist.name,
                                           albumTitle: album.title,
                                           albumImage: album.image,
                                           albumId: album.id
                                         };
                                       });
                                     });
                                   }

                                   setSelectedTrackIds(nextIds);
                                   setSelectedTracksMetadata(nextMetadata);
                                 }}
                                 className="px-3.5 py-1.5 rounded-full border border-navy/15 hover:border-navy text-xs font-sans font-bold text-navy bg-white hover:bg-navy/5 shadow-sm active:scale-95 transition-all cursor-pointer"
                               >
                                 {t.selectAll}
                               </button>
                               <button
                                 type="button"
                                 onClick={() => {
                                   const nextIds = new Set(selectedTrackIds);
                                   const albumsToDeselect = artist.allAlbums || artist.albums;
                                   albumsToDeselect.forEach(album => {
                                     if (!album) return;
                                     album.tracks.forEach(track => {
                                       nextIds.delete(track.id);
                                     });
                                   });

                                   if (artist.unreleasedAlbums) {
                                     artist.unreleasedAlbums.forEach(album => {
                                       album.tracks.forEach(track => {
                                         nextIds.delete(track.id);
                                       });
                                     });
                                   }

                                   setSelectedTrackIds(nextIds);
                                 }}
                                 className="px-3.5 py-1.5 rounded-full border border-navy/15 hover:border-point hover:text-point text-xs font-sans font-bold text-navy bg-white hover:bg-point/5 shadow-sm active:scale-95 transition-all cursor-pointer"
                               >
                                 {t.clearAll}
                               </button>
                             </div>
                           )}

                           {/* 발매 앨범 */}
                           <ul className="grid grid-cols-2 gap-4 mt-6">
                              {artist.albums.map(album => (
                                  <AlbumCard
                                    key={album.id}
                                    id={album.id}
                                    title={album.title}
                                    cover={album.image}
                                    coverFallback={album.image2}
                                    meta={`${album.type} • ${album.year}`}
                                    open={expandedAlbumId === album.id}
                                    onToggle={() => handleAlbumClick(album.id, artist.id)}
                                    badge={album.tracks.filter(tr => selectedTrackIds.has(tr.id)).length}
                                    reduceMotion={reduceMotion}
                                    cardRef={cardRef(album.id)}
                                  >
                                    <div className="w-full h-px bg-navy/10 mb-2 mt-2" />
                                    {loadingAlbums.has(album.id) ? (
                                      <div className="py-6 flex flex-col items-center justify-center text-navy/50 font-sans text-sm gap-2">
                                        <Disc className="animate-spin text-point/70" size={20} />
                                        <span>{t.loadingTracks}</span>
                                      </div>
                                    ) : album.tracks.length === 0 ? (
                                      // 트랙리스트가 아직 없는 앨범. 빈 칸만 보이면 고장으로 읽힌다
                                      <div className="py-6 px-4 text-center text-navy/50 font-sans text-sm">
                                        {t.noTracks}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {album.tracks.map((track, idx) => {
                                          const isSelected = selectedTrackIds.has(track.id);
                                          return (
                                            <div
                                              key={track.id}
                                              onClick={() =>
                                                toggleTrack(track.id, {
                                                  id: track.id,
                                                  title: track.title,
                                                  duration: track.duration,
                                                  artistName: artist.name,
                                                  albumTitle: album.title,
                                                  albumImage: album.image,
                                                  albumId: album.id,
                                                })
                                              }
                                              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors active:scale-[0.98] ${isSelected ? "bg-point/10" : "hover:bg-navy/5"}`}
                                            >
                                              <div className="flex items-center gap-3">
                                                <span className="text-xs font-num tabular-nums text-navy/40 w-4 text-right">{idx + 1}</span>
                                                <span className={`font-sans text-sm line-clamp-1 ${isSelected ? "text-point font-bold" : "text-charcoal"}`}>{track.title}</span>
                                              </div>
                                              {isSelected ? (
                                                <Check size={18} className="text-point" strokeWidth={3} />
                                              ) : (
                                                <span className="text-xs text-charcoal/40 font-sans">{track.duration}</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 이 앨범의 Spotify 링크백 (약관 II.4). 우리 DB 로만 아는 앨범
                                        (mb:/deezer:)은 재킷·곡이 Spotify 에서 온 게 아니라 링크를 걸지 않는다 */}
                                    {!album.id.includes(":") && !album.id.startsWith("al_unreleased_") && (
                                      <div className="flex justify-center mt-3">
                                        <SpotifyLink
                                          href={`https://open.spotify.com/album/${album.id}`}
                                          label={locale === "ko" ? "Spotify에서 듣기" : "Play on Spotify"}
                                        />
                                      </div>
                                    )}
                                      <button
                                        onClick={() => setExpandedAlbumId(null)}
                                        className="mt-4 py-3 w-full text-center text-sm font-sans font-medium text-navy/70 bg-navy/5 rounded-full hover:bg-navy/10 transition-colors"
                                      >
                                        {t.close}
                                      </button>
                                  </AlbumCard>
                              ))}
                           </ul>

                           {/* Spotify Released Albums Pagination Bar */}
                           {artist.totalReleases && artist.totalReleases > 10 && (
                             <div className="flex items-center justify-center gap-4 mt-6 py-2 border-t border-b border-navy/5 font-sans">
                               <button
                                                 disabled={(artist.albumsPage || 0) === 0}
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   handleArtistAlbumsPageChange(artist.id, (artist.albumsPage || 0) - 1);
                                                 }}
                                                 className="px-3 py-1.5 rounded-lg border border-navy/10 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                               >
                                                 {t.prev}
                                               </button>
                                               <span className="text-xs font-medium text-navy/70">
                                                 {(artist.albumsPage || 0) + 1} / {Math.ceil(artist.totalReleases / 10)}
                                               </span>
                                               <button
                                                 disabled={(artist.albumsPage || 0) >= Math.ceil(artist.totalReleases / 10) - 1}
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   handleArtistAlbumsPageChange(artist.id, (artist.albumsPage || 0) + 1);
                                                 }}
                                                 className="px-3 py-1.5 rounded-lg border border-navy/10 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                               >
                                                 {t.next}
                                               </button>
                             </div>
                           )}

                           {/* Decoupled Unreleased Section - Renders individual virtual Single albums */}
                           {artist.unreleasedAlbums && artist.unreleasedAlbums.length > 0 && (
                             <div className="mt-8 pt-6 border-t border-dashed border-navy/10 text-left">
                               <h3 className="text-lg text-navy mb-4 flex items-center gap-2">
                                 <Compass size={18} className="text-point shrink-0" />
                                 {t.unreleased}
                               </h3>
                               <ul className="grid grid-cols-2 gap-4">
                                  {artist.unreleasedAlbums.map(album => (
                                  <AlbumCard
                                    key={album.id}
                                    id={album.id}
                                    title={album.title}
                                    cover={album.image}
                                    coverFallback={album.image2}
                                    meta={`${album.type} • ${album.year}`}
                                    open={expandedAlbumId === album.id}
                                    onToggle={() => handleAlbumClick(album.id, artist.id)}
                                    badge={album.tracks.filter(tr => selectedTrackIds.has(tr.id)).length}
                                    reduceMotion={reduceMotion}
                                    cardRef={cardRef(album.id)}
                                  >
                                    <div className="w-full h-px bg-navy/10 mb-2 mt-2" />
                                      <div className="flex flex-col gap-1">
                                        {album.tracks.map((track, idx) => {
                                          const isSelected = selectedTrackIds.has(track.id);
                                          return (
                                            <div
                                              key={track.id}
                                              onClick={() =>
                                                toggleTrack(track.id, {
                                                  id: track.id,
                                                  title: track.title,
                                                  duration: track.duration,
                                                  artistName: artist.name,
                                                  albumTitle: album.title,
                                                  albumImage: album.image,
                                                  albumId: album.id,
                                                })
                                              }
                                              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors active:scale-[0.98] ${isSelected ? "bg-point/10" : "hover:bg-navy/5"}`}
                                            >
                                              <div className="flex items-center gap-3">
                                                <span className="text-xs font-num tabular-nums text-navy/40 w-4 text-right">{idx + 1}</span>
                                                <span className={`font-sans text-sm line-clamp-1 ${isSelected ? "text-point font-bold" : "text-charcoal"}`}>{track.title}</span>
                                              </div>
                                              {isSelected ? (
                                                <Check size={18} className="text-point" strokeWidth={3} />
                                              ) : (
                                                <span className="text-xs text-charcoal/40 font-sans">{track.duration}</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => setExpandedAlbumId(null)}
                                        className="mt-4 py-3 w-full text-center text-sm font-sans font-medium text-navy/70 bg-navy/5 rounded-full hover:bg-navy/10 transition-colors"
                                      >
                                        {t.close}
                                      </button>
                                  </AlbumCard>
                                  ))}
                               </ul>
                             </div>
                           )}
                         </>
                       )}
                       
                       <button
                         onClick={(e) => { e.stopPropagation(); setModalArtistId(artist.id); setIsModalOpen(true); }}
                         className="w-full mt-6 py-3 rounded-2xl border border-dashed border-navy/30 text-navy/70 font-sans text-sm font-medium flex items-center justify-center gap-2 hover:bg-navy/5 hover:text-navy transition-colors"
                       >
                         <Plus size={16} />
                         미발매곡 추가
                       </button>

                       {/* 오류 제보. 펼쳐 둔 앨범이 이 아티스트의 것이면 그 앨범까지 컨텍스트에 담는다 */}
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           const openAlbum = [...(artist.albums ?? []), ...(artist.unreleasedAlbums ?? [])]
                             .find(al => al.id === expandedAlbumId);
                           setFeedbackTarget({
                             id: artist.id,
                             name: artist.name,
                             albumId: openAlbum?.id,
                             albumTitle: openAlbum?.title,
                           });
                         }}
                         className="w-full mt-2 py-2.5 rounded-2xl text-navy/70 type-caption flex items-center justify-center gap-1.5 hover:text-navy hover:bg-navy/5 transition-colors"
                       >
                         <AlertCircle size={13} />
                         {t.reportInfoBtn}
                       </button>
                     </motion.div>
                   )}
                 </AnimatePresence>
              </section>
            )
          })}
        </div>
      )}

      {/* FAB Bottom - Morphing Unified Dock / Button */}
      {(() => {
        const isCurrentlyLoadingTracks = artistData.some(a => a.backgroundLoading) || loadingAlbums.size > 0;
        const isReadyToStart = !isCurrentlyLoadingTracks && pickedIds.size >= 4;

        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 p-6 flex flex-col items-center pointer-events-none">
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              onClick={isReadyToStart ? handleStartWorldCup : undefined}
              className={`w-full max-w-[380px] pointer-events-auto transition-colors duration-300 overflow-hidden ${
                isCurrentlyLoadingTracks
                  ? "bg-cream/95 backdrop-blur-xl border border-navy/15 shadow-[0_12px_40px_rgba(26,42,108,0.2)] rounded-[2.2rem] p-3.5 flex flex-col gap-3 select-none cursor-not-allowed"
                  : isReadyToStart
                    ? "bg-navy text-cream border border-navy/20 shadow-[0_10px_30px_rgba(26,42,108,0.35)] rounded-full py-4 px-6 hover:bg-navy/90 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    : "bg-cream/90 backdrop-blur-md border border-navy/20 shadow-[0_4px_15px_rgba(0,0,0,0.1)] rounded-full py-3 px-6 text-center text-navy font-bold text-sm"
              }`}
            >
              {/* 1. Loading State Layout */}
              <AnimatePresence initial={false}>
                {isCurrentlyLoadingTracks && (
                  <motion.div
                    key="loading-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="flex flex-col gap-2.5 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center text-xs font-sans font-bold text-navy px-1">
                      <span className="flex items-center gap-2">
                        {/* Soundwave Equalizer Animation (4 Bars) */}
                        <div className="flex items-end gap-[3px] h-3.5 w-4 pb-[1px]">
                          <motion.span
                            animate={{ height: ["20%", "100%", "30%", "85%", "20%"] }}
                            transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut", delay: 0 }}
                            className="w-[3px] bg-point rounded-full"
                          />
                          <motion.span
                            animate={{ height: ["60%", "20%", "100%", "40%", "60%"] }}
                            transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut", delay: 0.15 }}
                            className="w-[3px] bg-point rounded-full"
                          />
                          <motion.span
                            animate={{ height: ["30%", "90%", "40%", "100%", "30%"] }}
                            transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut", delay: 0.3 }}
                            className="w-[3px] bg-point rounded-full"
                          />
                          <motion.span
                            animate={{ height: ["80%", "30%", "75%", "20%", "80%"] }}
                            transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut", delay: 0.45 }}
                            className="w-[3px] bg-point rounded-full"
                          />
                        </div>
                        <span className="tracking-tight">{t.fetchingAllTracks}</span>
                      </span>
                      <span className="text-point text-[11px] bg-point/10 px-2.5 py-0.5 rounded-full font-bold">
                        {artistData.find(a => a.backgroundLoading)?.backgroundProgress?.loaded || (loadingAlbums.size > 0 ? "..." : 0)} / {artistData.find(a => a.backgroundLoading)?.backgroundProgress?.total || 0} {locale === "ko" ? "앨범" : "Albums"}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-navy/10 rounded-full overflow-hidden relative">
                      <motion.div
                        className="h-full bg-gradient-to-r from-point to-amber-500 rounded-full"
                        initial={{ width: "10%" }}
                        animate={{
                          width: `${
                            Math.max(
                              10,
                              ((artistData.find(a => a.backgroundLoading)?.backgroundProgress?.loaded || 1) /
                                (artistData.find(a => a.backgroundLoading)?.backgroundProgress?.total || 1)) *
                              100
                            )
                          }%`
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>

                    {/* Disabled Status Button inside Loading Card */}
                    <div className="w-full py-3 rounded-[1.4rem] bg-navy/10 text-navy/50 text-center font-semibold text-sm border border-navy/5 flex items-center justify-center gap-2">
                      <span>{t.createWorldCup}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-navy/10 text-navy/60 font-bold">
                        {pickedIds.size}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 2. Loaded & Ready State (Standalone Navy Button) */}
              {!isCurrentlyLoadingTracks && pickedIds.size >= 4 && (
                <motion.div
                  key="ready-content"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center justify-center gap-2 font-sans font-bold text-lg text-cream w-full"
                >
                  <span>{t.startWorldCup}</span>
                  <span className="text-xs bg-point text-white px-2.5 py-1 rounded-full font-bold">
                    {pickedIds.size}
                  </span>
                </motion.div>
              )}

              {/* 3. Minimal Counter when < 4 tracks */}
              {!isCurrentlyLoadingTracks && pickedIds.size > 0 && pickedIds.size < 4 && (
                <motion.div
                  key="minimal-counter"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center font-sans font-bold text-xs text-navy w-full"
                >
                  {t.selectMore.replace("{count}", String(4 - pickedIds.size))}
                </motion.div>
              )}
            </motion.div>
          </div>
        );
      })()}

      {/* 미발매곡 등록. 같이 소트하기 만들기와 같은 팝업을 쓴다. */}
      <UnreleasedDialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        artistId={modalArtistId}
        artistName={artistData.find(a => a.id === modalArtistId)?.name ?? "Unknown Artist"}
        locale={locale === "en" ? "en" : "ko"}
        onAdded={handleAddUnreleased}
      />

      {/* 곡 정보 오류 제보 */}
      <FeedbackModal
        isOpen={feedbackTarget !== null}
        onClose={() => setFeedbackTarget(null)}
        locale={locale}
        kind="data_error"
        contextLabel={
          feedbackTarget
            ? [feedbackTarget.name, feedbackTarget.albumTitle].filter(Boolean).join(" · ")
            : undefined
        }
        context={
          feedbackTarget
            ? {
                artist_id: feedbackTarget.id,
                artist_name: feedbackTarget.name,
                ...(feedbackTarget.albumId
                  ? { album_id: feedbackTarget.albumId, album_title: feedbackTarget.albumTitle }
                  : {}),
              }
            : undefined
        }
        onSubmitted={(msg) => {
          setNotification(msg);
          setTimeout(() => setNotification(null), 5000);
        }}
      />

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <div className="fixed top-20 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
            <motion.div
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
              className="bg-navy text-cream px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 max-w-md w-full pointer-events-auto border border-white/10"
            >
              <Check size={18} className="text-point shrink-0" strokeWidth={3} />
              <p className="font-sans text-sm leading-snug">{notification}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* 나가기 확인 — 하단 시트 하나 (docs/design-system/dialogs.md 3장) */}
      <Sheet
        open={exitWizardStep !== null}
        onClose={() => setExitWizardStep(null)}
        closeLabel={locale === "en" ? "Keep choosing" : "계속 고르기"}
        header={
          <>
            <h2 className="type-title-1 text-navy">{locale === "en" ? "Stop choosing songs?" : "곡 고르기를 그만둘까요?"}</h2>
            <p className="type-sub text-navy/70 mt-1 whitespace-pre-line break-keep">
              {locale === "en"
                ? "Save to pick up later from Home or My Taste Space.\nChoosing artists again clears the songs you picked."
                : "저장하면 홈이나 내 취향 스페이스에서 이어서 할 수 있어요.\n아티스트를 다시 고르면 지금 고른 곡은 지워져요."}
            </p>
          </>
        }
        footer={
          <div className="flex flex-col gap-2">
            <button onClick={handleConfirmSaveExit} className={`${primaryButton} w-full`}>{locale === "en" ? "Save and leave" : "저장하고 나가기"}</button>
            <button onClick={handleReturnToArtists} className={`${secondaryButton} w-full`}>{locale === "en" ? "Choose artists again" : "아티스트 다시 고르기"}</button>
            <button onClick={handleDiscardExit} className={`${dangerButton} w-full`}>{locale === "en" ? "Leave without saving" : "저장하지 않고 나가기"}</button>
            <button onClick={() => setExitWizardStep(null)} className={`${textLink} self-center mt-2`}>{locale === "en" ? "Keep choosing" : "계속 고르기"}</button>
          </div>
        }
      />

      {/* 고를 것이 없는 알림은 토스트 */}
      <Toast toast={customAlert ? { text: customAlert, tone: "info" } : null} />
    </main>
  );
}
