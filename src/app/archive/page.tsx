"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Disc, Search, ChevronDown } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";
import { useAuth } from "@/components/AuthProvider";
import LoginModal from "@/components/LoginModal";
import {
  fetchAllApprovedUnreleasedTracks,
  submitLyricSuggestion,
  submitUnreleasedTrack,
  reportTrackReleased,
  fetchAllReleasedUnreleasedTracks
} from "@/utils/unreleasedDb";
import { searchSpotifyArtists } from "@/utils/spotify";
import { displayNickname } from "@/utils/nickname";
import { VISIBLE_MODES } from "@/config/modes";
import {
  ConfirmSheet,
  EmptyState,
  Sheet,
  Toast,
  UnderlineTabs,
  formatDate,
  primaryButton,
  secondaryButton,
  textLink,
  useToast,
} from "@/components/space/SpaceUI";

interface Track {
  id?: string;
  i?: string;
  title: string;
  t?: string;
  artistName: string;
  a?: string;
  albumImage: string;
  m?: string;
}

/** 목록 한 줄에 실제로 쓰는 열. ranking 은 무거워서 넣지 않는다(상세 화면에서 읽는다). */
const LIST_COLUMNS =
  "id,title,winner_track_title,winner_track_artist,winner_track_image,user_nickname,user_profile_image,created_at,is_single_artist";
const PAGE_SIZE = 20;

interface TournamentResult {
  id: string;
  user_id: string;
  title: string;
  winner_track_id: string;
  winner_track_title: string;
  winner_track_artist: string;
  winner_track_image: string;
  total_candidates: number;
  ranking: Track[];
  is_public: boolean;
  is_single_artist: boolean;
  artist_id?: string;
  artist_name?: string;
  user_nickname: string;
  user_profile_image: string;
  created_at: string;
}

interface UnreleasedTrack {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  video_url: string | null;
  release_date: string | null;
  lyrics: string | null;
  lyrics_fanchant: string | null;
  created_at: string;
  user_id: string;
}

const translations = {
  ko: {
    title: "우리의 취향 아카이브",
    desc: "다른 리스너들이 공개한 취향표를 둘러보세요.",
    emptyTitle: "아직 공개된 취향표가 없어요",
    emptyDesc: "월드컵을 끝내고 취향표를 공개하면 여기에 올라와요.",
    emptyAction: "월드컵 하러 가기",
    winnerPrefix: "1위",
    nicknameDefault: "음악팬",
    singleDiscography: "최애 곡 소트하기",
    mixLabel: "믹스 매치",
    loading: "불러오는 중이에요",
    moreBtn: "더 보기",
    loginSuccess: "로그인했어요.",
    required: "필수",

    // 미발매곡
    tabTaste: "취향표",
    tabUnreleased: "미발매곡",
    filterUnreleased: "미발매",
    tabReleasedHistory: "발매됨",
    searchPlaceholder: "곡명이나 아티스트 검색",
    addUnreleasedBtn: "등록 신청",
    unreleasedDesc: "음원 사이트에는 없지만 공연·유튜브로 사랑받는 미발매곡을 모았어요.",
    emptyUnreleasedTitle: "아직 등록된 미발매곡이 없어요",
    emptyUnreleasedDesc: "처음으로 미발매곡을 등록해 보세요.",
    emptySearchTitle: "검색 결과가 없어요",
    emptySearchDesc: "다른 곡명이나 아티스트로 찾아보세요.",
    emptyReleasedTitle: "아직 발매로 전환된 곡이 없어요",
    playBtn: "들어보기",
    stopBtn: "영상 닫기",
    lyricsOpen: "가사 보기",
    lyricsClose: "가사 접기",
    reportReleaseBtn: "발매 제보",
    reportReleaseDone: "제보했어요",
    reportReleaseSuccess: "발매 제보 고마워요. 확인한 뒤 며칠 안에 반영할게요.",
    reportReleaseError: "제보하지 못했어요. 다시 시도해 주세요.",
    reportConfirmTitle: "공식 발매 제보",
    reportConfirmHeading: "'{title}' 곡이 공식 발매되었나요?",
    reportConfirmDesc: "제보해 주시면 발매 여부를 확인한 뒤 며칠 안에 반영할게요.",
    reportConfirmBtn: "제보하기",
    reportConfirmCancel: "취소",
    lyricsTabPlain: "일반 가사",
    lyricsTabFanchant: "떼창·응원법",
    noLyricsPlain: "아직 등록된 가사가 없어요.",
    noLyricsFanchant: "아직 등록된 떼창·응원법이 없어요.",
    lyricsContributeBtn: "가사 등록·수정 제안",
    lyricsContributeTitle: "가사 기여",
    lyricsLabelPlain: "일반 가사",
    lyricsLabelFanchant: "떼창·응원법 가사",
    lyricsPlaceholderPlain: "가사를 적어 주세요",
    lyricsPlaceholderFanchant: "떼창 부분을 [대괄호]로 감싸 적어 주세요",
    editorGuideTitle: "작성 가이드",
    editorGuidePlain: "팬들 사이에 공유되는 정확한 가사를 적어 주세요. 관리자가 확인한 뒤 반영돼요.",
    editorGuideFanchant: "떼창·응원 부분을 대괄호 [ ] 로 감싸 주세요. 감싼 부분은 강조색으로 보여요.\n예: [떼창할 부분]",
    fanchantWrapBtn: "선택한 부분을 [ ] 로",
    livePreviewTitle: "미리보기",
    pledgeTitle: "기여 서약",
    pledgeText: "비방·거짓·장난 내용을 넣지 않겠습니다. 고의로 어기면 서비스 이용이 제한될 수 있음을 알고 동의합니다.",
    pledgeCheckbox: "확인했고 동의합니다 (필수)",
    cancelBtn: "취소",
    submitBtn: "제안 보내기",
    submitting: "보내는 중…",
    lyricsSubmittedSuccess: "가사 제안을 보냈어요. 관리자가 확인한 뒤 반영돼요.",
    lyricsSubmittedError: "가사 제안을 보내지 못했어요. 다시 시도해 주세요.",

    // 등록 신청
    addTrackTitle: "미발매곡 등록 신청",
    addTrackSub: "관리자가 확인한 뒤 목록에 올라와요.",
    formTrackTitle: "곡 제목",
    formArtist: "아티스트",
    formArtistSearch: "아티스트 이름 검색 (예: 아이유)",
    changeArtist: "변경",
    formVideoUrl: "공연·라이브 영상 링크 (유튜브)",
    formReleaseDate: "공연·공개일 (선택)",
    performDate: "공연일",
    formPlaceholderTitle: "예: 임시동맹",
    formPlaceholderVideoUrl: "https://youtu.be/...",
    submitTrackBtn: "신청하기",
    submittingTrack: "신청 중…",
    trackSubmittedSuccess: "등록 신청을 보냈어요. 관리자가 확인한 뒤 목록에 올라와요.",
    trackSubmittedError: "등록 신청을 보내지 못했어요. 다시 시도해 주세요.",
    checkAuthText: "가사를 등록하려면 로그인이 필요해요.",
    checkAuthAddTrack: "미발매곡을 신청하려면 로그인이 필요해요.",
  },
  en: {
    title: "Our Taste Archive",
    desc: "Browse taste cards other listeners have made public.",
    emptyTitle: "No public taste cards yet",
    emptyDesc: "Finish a World Cup and make your card public to show it here.",
    emptyAction: "Play a World Cup",
    winnerPrefix: "#1",
    nicknameDefault: "Music Fan",
    singleDiscography: "Favorite Songs Sort",
    mixLabel: "Mix Match",
    loading: "Loading",
    moreBtn: "Show more",
    loginSuccess: "Logged in.",
    required: "required",

    tabTaste: "Taste Cards",
    tabUnreleased: "Unreleased",
    filterUnreleased: "Unreleased",
    tabReleasedHistory: "Released",
    searchPlaceholder: "Search song or artist",
    addUnreleasedBtn: "Request a song",
    unreleasedDesc: "Songs not on streaming services but loved through live shows and YouTube.",
    emptyUnreleasedTitle: "No unreleased songs yet",
    emptyUnreleasedDesc: "Be the first to request one.",
    emptySearchTitle: "No results",
    emptySearchDesc: "Try another song or artist.",
    emptyReleasedTitle: "No released songs yet",
    playBtn: "Listen",
    stopBtn: "Close video",
    lyricsOpen: "Lyrics",
    lyricsClose: "Hide lyrics",
    reportReleaseBtn: "Report release",
    reportReleaseDone: "Reported",
    reportReleaseSuccess: "Thanks for reporting. We'll verify and update it in a few days.",
    reportReleaseError: "Couldn't report. Please try again.",
    reportConfirmTitle: "Report official release",
    reportConfirmHeading: "Has '{title}' been officially released?",
    reportConfirmDesc: "We'll verify the release and update it in a few days.",
    reportConfirmBtn: "Report",
    reportConfirmCancel: "Cancel",
    lyricsTabPlain: "Lyrics",
    lyricsTabFanchant: "Fanchants",
    noLyricsPlain: "No lyrics yet.",
    noLyricsFanchant: "No fanchants yet.",
    lyricsContributeBtn: "Suggest lyrics",
    lyricsContributeTitle: "Contribute lyrics",
    lyricsLabelPlain: "Lyrics",
    lyricsLabelFanchant: "Fanchant lyrics",
    lyricsPlaceholderPlain: "Write the lyrics",
    lyricsPlaceholderFanchant: "Wrap singalong parts in [brackets]",
    editorGuideTitle: "Guide",
    editorGuidePlain: "Please write accurate lyrics. An admin reviews them before they appear.",
    editorGuideFanchant: "Wrap singalong parts in square brackets [ ]. They show in a highlight color.\nExample: [singalong part]",
    fanchantWrapBtn: "Wrap selection in [ ]",
    livePreviewTitle: "Preview",
    pledgeTitle: "Contribution pledge",
    pledgeText: "I won't include slander, false information, or jokes. I understand intentional violations may restrict my account.",
    pledgeCheckbox: "I understand and agree (required)",
    cancelBtn: "Cancel",
    submitBtn: "Send suggestion",
    submitting: "Sending…",
    lyricsSubmittedSuccess: "Suggestion sent. It appears after admin review.",
    lyricsSubmittedError: "Couldn't send your suggestion. Please try again.",

    addTrackTitle: "Request an unreleased song",
    addTrackSub: "It appears in the list after admin review.",
    formTrackTitle: "Song title",
    formArtist: "Artist",
    formArtistSearch: "Search artist name (e.g. IU)",
    changeArtist: "Change",
    formVideoUrl: "Live video link (YouTube)",
    formReleaseDate: "Performance date (optional)",
    performDate: "Performed",
    formPlaceholderTitle: "e.g. Temporary Alliance",
    formPlaceholderVideoUrl: "https://youtu.be/...",
    submitTrackBtn: "Send request",
    submittingTrack: "Sending…",
    trackSubmittedSuccess: "Request sent. It appears after admin review.",
    trackSubmittedError: "Couldn't send your request. Please try again.",
    checkAuthText: "Log in to contribute lyrics.",
    checkAuthAddTrack: "Log in to request unreleased songs.",
  }
};

export default function ArchivePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();
  
  // App context/locales
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  const [activeTab, setActiveTab] = useState<"taste" | "unreleased">("taste");
  const [isLoading, setIsLoading] = useState(true);
  
  // Taste cards state
  const [results, setResults] = useState<TournamentResult[]>([]);
  /** 더 받을 게 남았는지. 한 번에 20건씩 받는다. */
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [loadingMoreResults, setLoadingMoreResults] = useState(false);
  
  // Unreleased tracks state
  const [unreleasedTracks, setUnreleasedTracks] = useState<UnreleasedTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPlayingVideoId, setIsPlayingVideoId] = useState<string | null>(null);
  const [expandedLyricsTrackId, setExpandedLyricsTrackId] = useState<string | null>(null);
  const [lyricsVersion, setLyricsVersion] = useState<"plain" | "fanchant">("plain");
  const [showReleasedHistory, setShowReleasedHistory] = useState(false);
  const [reportedTracks, setReportedTracks] = useState<string[]>([]);
  const [reportConfirmTrack, setReportConfirmTrack] = useState<UnreleasedTrack | null>(null);
  
  // Lyrics suggestion states
  const [editModalTrack, setEditModalTrack] = useState<UnreleasedTrack | null>(null);
  const [editLyricsType, setEditLyricsType] = useState<"plain" | "fanchant">("plain");
  const [editLyricsContent, setEditLyricsContent] = useState("");
  const [isPledgeChecked, setIsPledgeChecked] = useState(false);
  const [isSubmittingLyrics, setIsSubmittingLyrics] = useState(false);
  
  // Add Track states
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", artistId: "", artistName: "", videoUrl: "", releaseDate: "" });
  const [isSubmittingTrack, setIsSubmittingTrack] = useState(false);
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [artistSearchResults, setArtistSearchResults] = useState<any[]>([]);
  const [isSearchingArtist, setIsSearchingArtist] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<any | null>(null);
  
  // Login trigger
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginReason, setLoginReason] = useState("");
  
  // Toast notifications
  const { toast, showToast } = useToast(4000);

  // Set locale
  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  /** "더 보기" — 다음 20건을 뒤에 붙인다. */
  const loadMoreResults = async () => {
    if (loadingMoreResults) return;
    setLoadingMoreResults(true);
    try {
      const { data, error } = await supabase
        .from("tournament_results")
        .select(LIST_COLUMNS)
        .eq("is_public", true)
        .in("is_single_artist", VISIBLE_MODES)
        .order("created_at", { ascending: false })
        .range(results.length, results.length + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data || []) as unknown as TournamentResult[];
      setResults((prev) => [...prev, ...rows]);
      setHasMoreResults(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error loading more archives:", err);
    } finally {
      setLoadingMoreResults(false);
    }
  };

  // Fetch Public Taste Cards
  useEffect(() => {
    const fetchPublicData = async () => {
      if (activeTab !== "taste") return;
      setIsLoading(true);
      try {
        /*
         * 목록에 필요한 열만, 20건씩 받는다.
         *
         * 예전에는 `select("*")` 에 limit 도 없어서, 화면에 들어올 때마다 공개 취향표
         * **전건의 ranking jsonb**(곡 제목·아티스트·커버 주소 전부)가 내려왔다.
         * 목록에는 1위 한 곡만 보이는데도 그랬다. 취향표가 쌓일수록 선형으로 무거워진다.
         *
         * VISIBLE_MODES 필터는 .range() 보다 **먼저** 걸어야 20건이 꽉 찬다.
         */
        const { data, error } = await supabase
          .from("tournament_results")
          .select(LIST_COLUMNS)
          .eq("is_public", true)
          .in("is_single_artist", VISIBLE_MODES)
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (error) throw error;
        setResults((data || []) as unknown as TournamentResult[]);
        setHasMoreResults((data?.length ?? 0) === PAGE_SIZE);
      } catch (err) {
        console.error("Error fetching public archives:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicData();
  }, [supabase, activeTab]);

  // Initialize reportedTracks from sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("reported_releases");
      if (stored) {
        try {
          setReportedTracks(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Fetch Approved Unreleased Tracks
  const loadUnreleasedTracks = async () => {
    setIsLoading(true);
    try {
      const data = showReleasedHistory
        ? await fetchAllReleasedUnreleasedTracks()
        : await fetchAllApprovedUnreleasedTracks();
      setUnreleasedTracks(data as UnreleasedTrack[]);
    } catch (err) {
      console.error("Error loading unreleased tracks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "unreleased") {
      loadUnreleasedTracks();
    }
  }, [activeTab, showReleasedHistory]);

  const handleReportRelease = async (trackId: string) => {
    try {
      await reportTrackReleased(trackId);
      const updated = [...reportedTracks, trackId];
      setReportedTracks(updated);
      sessionStorage.setItem("reported_releases", JSON.stringify(updated));
      showToast(t.reportReleaseSuccess);
    } catch (err) {
      console.error(err);
      showToast(t.reportReleaseError, "error");
    }
  };

  // Fetch Spotify artists for Track suggest modal
  useEffect(() => {
    if (!isAddTrackOpen) return;
    if (artistSearchQuery.trim().length === 0) {
      setArtistSearchResults([]);
      setIsSearchingArtist(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingArtist(true);
      try {
        const results = await searchSpotifyArtists(artistSearchQuery, 5, 0);
        const mapped = results.map((a: any) => ({
          id: a.id,
          name: a.name,
          image: a.images?.[0]?.url || "/default-artist.png",
        }));
        setArtistSearchResults(mapped);
      } catch (err) {
        console.error("Error searching Spotify artists:", err);
      } finally {
        setIsSearchingArtist(false);
      }
    }, 450); // 450ms debounce

    return () => clearTimeout(timer);
  }, [artistSearchQuery, isAddTrackOpen]);

  // Video ID parser
  const getYouTubeVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Fanchant renderer (text interpreter)
  const renderFanchantLyrics = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const parts = [];
      let currentIdx = 0;
      const regex = /\[([^\]]+)\]/g;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const matchIndex = match.index;
        const matchText = match[1];
        if (matchIndex > currentIdx) {
          parts.push({ text: line.substring(currentIdx, matchIndex), isFanchant: false });
        }
        parts.push({ text: matchText, isFanchant: true });
        currentIdx = regex.lastIndex;
      }
      if (currentIdx < line.length) {
        parts.push({ text: line.substring(currentIdx), isFanchant: false });
      }
      return (
        <div key={lineIdx} className="min-h-[1.5em]">
          {parts.length === 0 ? (
            <span className="opacity-0"> </span>
          ) : (
            parts.map((part, partIdx) => (
              <span
                key={partIdx}
                className={
                  part.isFanchant
                    ? "text-point-ink font-bold"
                    : undefined
                }
              >
                {part.text}
              </span>
            ))
          )}
        </div>
      );
    });
  };

  // Selection wrapping helper
  const handleWrapSelection = () => {
    const textarea = document.getElementById("edit-lyrics-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editLyricsContent;
    const selected = text.substring(start, end);
    const replacement = `[${selected}]`;
    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setEditLyricsContent(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1 + selected.length);
    }, 50);
  };

  // Open Edit Modal
  const openEditLyrics = (track: UnreleasedTrack) => {
    if (!user) {
      setLoginReason(t.checkAuthText);
      setIsLoginModalOpen(true);
      return;
    }
    setEditModalTrack(track);
    setEditLyricsType("plain");
    setEditLyricsContent(track.lyrics || "");
    setIsPledgeChecked(false);
  };

  // Track Type change auto-populator
  useEffect(() => {
    if (!editModalTrack) return;
    if (editLyricsType === "fanchant") {
      // If fanchant lyrics is empty, prefill with general lyrics
      if (!editModalTrack.lyrics_fanchant) {
        setEditLyricsContent(editModalTrack.lyrics || "");
      } else {
        setEditLyricsContent(editModalTrack.lyrics_fanchant);
      }
    } else {
      setEditLyricsContent(editModalTrack.lyrics || "");
    }
  }, [editLyricsType, editModalTrack]);

  // Submit lyrics suggestion
  const handleLyricsSubmit = async () => {
    if (!editModalTrack || !isPledgeChecked || !user) return;
    
    // Nickname retrieval
    const nickname = user.user_metadata?.nickname || translations[locale].nicknameDefault;
    
    setIsSubmittingLyrics(true);
    try {
      const isPlain = editLyricsType === "plain";
      await submitLyricSuggestion(
        editModalTrack.id,
        isPlain ? editLyricsContent : null,
        !isPlain ? editLyricsContent : null,
        nickname
      );
      showToast(t.lyricsSubmittedSuccess);
      setEditModalTrack(null);
    } catch (err) {
      console.error(err);
      showToast(t.lyricsSubmittedError, "error");
    } finally {
      setIsSubmittingLyrics(false);
    }
  };

  // Add Track submit
  const handleAddTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setLoginReason(t.checkAuthAddTrack);
      setIsLoginModalOpen(true);
      return;
    }
    if (!addForm.title.trim() || !addForm.artistId) return;

    setIsSubmittingTrack(true);
    try {
      const uniqueTrackId = `t_unreleased_${Date.now()}`;
      await submitUnreleasedTrack({
        id: uniqueTrackId,
        title: addForm.title.trim(),
        artistId: addForm.artistId,
        artistName: addForm.artistName,
        videoUrl: addForm.videoUrl.trim() || undefined,
        releaseDate: addForm.releaseDate || undefined,
      });
      showToast(t.trackSubmittedSuccess);
      setIsAddTrackOpen(false);
      setAddForm({ title: "", artistId: "", artistName: "", videoUrl: "", releaseDate: "" });
      setArtistSearchQuery("");
      setArtistSearchResults([]);
      setSelectedArtist(null);
    } catch (err) {
      console.error(err);
      showToast(t.trackSubmittedError, "error");
    } finally {
      setIsSubmittingTrack(false);
    }
  };

  const t = translations[locale];

  // Filtering unreleased tracks
  const filteredUnreleased = unreleasedTracks.filter(
    (track) =>
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artist_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const textAction = "type-sub font-semibold text-navy cursor-pointer disabled:text-navy/40 disabled:cursor-default";
  const inputClass =
    "w-full h-12 px-4 bg-white border border-navy/15 rounded-xl type-body text-navy outline-none focus:border-navy placeholder:text-navy/40";

  const closeAddTrack = () => {
    setIsAddTrackOpen(false);
    setArtistSearchQuery("");
    setArtistSearchResults([]);
    setSelectedArtist(null);
  };

  const unreleasedEmpty = searchQuery.trim()
    ? { title: t.emptySearchTitle, desc: t.emptySearchDesc }
    : showReleasedHistory
      ? { title: t.emptyReleasedTitle, desc: undefined }
      : { title: t.emptyUnreleasedTitle, desc: t.emptyUnreleasedDesc };

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      <Toast toast={toast} />

      {/* Header Panel */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton
            className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0"
            onClick={() => router.push("/")}
          />
          <h1 className="type-title-1 text-navy">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileHeader locale={locale} />
        </div>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
        <p className="type-sub text-navy/70 pt-5 pb-4">
          {activeTab === "taste" ? t.desc : t.unreleasedDesc}
        </p>

        <UnderlineTabs
          tabs={[
            { id: "taste" as const, label: t.tabTaste },
            { id: "unreleased" as const, label: t.tabUnreleased },
          ]}
          active={activeTab}
          onChange={(id) => {
            setActiveTab(id);
            if (id === "unreleased") {
              setIsPlayingVideoId(null);
              setExpandedLyricsTrackId(null);
            }
          }}
        />

        {/* 미발매곡: 목록 전환 · 검색 · 등록 (로딩 중에도 자리를 유지) */}
        {activeTab === "unreleased" && (
          <div className="flex flex-col gap-4 pt-5">
            <div className="flex items-center justify-between">
              <div role="group" className="flex items-center gap-4">
                {[
                  { released: false, label: t.filterUnreleased },
                  { released: true, label: t.tabReleasedHistory },
                ].map(({ released, label }) => (
                  <button
                    key={label}
                    aria-pressed={showReleasedHistory === released}
                    onClick={() => setShowReleasedHistory(released)}
                    className={`type-body-strong cursor-pointer transition-colors ${
                      showReleasedHistory === released ? "text-navy" : "!font-normal text-navy/70 hover:text-navy"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!user) {
                    setLoginReason(t.checkAuthAddTrack);
                    setIsLoginModalOpen(true);
                  } else {
                    setIsAddTrackOpen(true);
                    setArtistSearchQuery("");
                    setArtistSearchResults([]);
                    setSelectedArtist(null);
                  }
                }}
                className={textLink}
              >
                {t.addUnreleasedBtn}
              </button>
            </div>

            <label className="flex items-center gap-2 h-11 border-b-2 border-navy/15 focus-within:border-navy transition-colors">
              <Search size={18} className="text-navy/70 shrink-0" />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none type-body text-navy placeholder:text-navy/40"
              />
            </label>
          </div>
        )}

        {isLoading && (
          <div className="py-24 flex flex-col items-center gap-3">
            <Disc className="animate-spin text-point" size={28} />
            <p className="type-sub text-navy/70">{t.loading}</p>
          </div>
        )}

        {/* 취향표 */}
        {!isLoading && activeTab === "taste" && (
          results.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              desc={t.emptyDesc}
              action={
                <button onClick={() => router.push("/")} className={primaryButton}>
                  {t.emptyAction}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-navy/10">
              {results.map((result) => {
                const nickname = displayNickname(result.user_nickname, t.nicknameDefault);
                return (
                  <li key={result.id}>
                    <button
                      onClick={() => router.push(`/taste/${result.id}`)}
                      className="w-full flex items-center gap-3 py-4 text-left cursor-pointer"
                    >
                      <div className="relative w-14 h-14 shrink-0 overflow-hidden rounded-lg bg-navy/5">
                        <SafeImage
                          src={result.winner_track_image}
                          alt={result.winner_track_title}
                          fill
                          sizes="56px"
                          fallbackType="track"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="type-body-strong text-navy truncate">{result.title}</p>
                        <p className="type-sub text-navy/70 truncate">
                          {t.winnerPrefix} {result.winner_track_title} · {result.winner_track_artist}
                        </p>
                        <div className="flex items-center gap-1.5 type-caption text-navy/70 min-w-0">
                          <span className="relative w-4 h-4 shrink-0 overflow-hidden rounded-full bg-navy/5">
                            <SafeImage
                              src={result.user_profile_image || "/default-profile.png"}
                              alt={nickname}
                              fill
                              sizes="16px"
                              fallbackType="artist"
                              className="object-cover"
                            />
                          </span>
                          <span className="truncate">
                            {nickname} · {formatDate(result.created_at, locale)} ·{" "}
                            {result.is_single_artist ? t.singleDiscography : t.mixLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {!isLoading && activeTab === "taste" && hasMoreResults && (
          <div className="flex justify-center mt-6">
            <button onClick={loadMoreResults} disabled={loadingMoreResults} className={secondaryButton}>
              {loadingMoreResults ? t.loading : t.moreBtn}
            </button>
          </div>
        )}

        {/* 미발매곡 목록 */}
        {!isLoading && activeTab === "unreleased" && (
          filteredUnreleased.length === 0 ? (
            <EmptyState title={unreleasedEmpty.title} desc={unreleasedEmpty.desc} />
          ) : (
            <ul className="divide-y divide-navy/10 mt-2">
              {filteredUnreleased.map((track) => {
                const youtubeId = track.video_url ? getYouTubeVideoId(track.video_url) : null;
                const isPlaying = isPlayingVideoId === track.id;
                const isLyricsExpanded = expandedLyricsTrackId === track.id;
                const isReported = reportedTracks.includes(track.id);

                return (
                  <li key={track.id} className="py-4">
                    <div className="flex items-start gap-3">
                      {youtubeId && (
                        <button
                          onClick={() => setIsPlayingVideoId(isPlaying ? null : track.id)}
                          aria-label={isPlaying ? t.stopBtn : t.playBtn}
                          className="relative w-24 aspect-video shrink-0 overflow-hidden rounded-md bg-navy/5 cursor-pointer"
                        >
                          <SafeImage
                            src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                            alt={track.title}
                            fill
                            sizes="96px"
                            fallbackType="track"
                            className="object-cover"
                          />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="type-body-strong text-navy break-words">{track.title}</p>
                        <p className="type-sub text-navy/70 break-words">{track.artist_name}</p>
                        {track.release_date && (
                          <p className="type-caption text-navy/70">
                            {t.performDate} {track.release_date}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 행 동작 — 들어보기는 영상이 실제로 재생 가능할 때만 */}
                    <div className="flex items-center gap-5 mt-3">
                      {youtubeId && (
                        <button onClick={() => setIsPlayingVideoId(isPlaying ? null : track.id)} className={textAction}>
                          {isPlaying ? t.stopBtn : t.playBtn}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setExpandedLyricsTrackId(isLyricsExpanded ? null : track.id);
                          setLyricsVersion("plain");
                        }}
                        aria-expanded={isLyricsExpanded}
                        className={`${textAction} inline-flex items-center gap-0.5`}
                      >
                        {isLyricsExpanded ? t.lyricsClose : t.lyricsOpen}
                        <ChevronDown size={16} className={`transition-transform ${isLyricsExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {!showReleasedHistory && (
                        <button
                          onClick={() => setReportConfirmTrack(track)}
                          disabled={isReported}
                          className={textAction}
                        >
                          {isReported ? t.reportReleaseDone : t.reportReleaseBtn}
                        </button>
                      )}
                    </div>

                    <AnimatePresence>
                      {isPlaying && youtubeId && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="w-full aspect-video mt-3 overflow-hidden rounded-xl bg-black">
                            <iframe
                              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                              title={track.title}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {isLyricsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-3 pt-4">
                            <div role="group" className="flex items-center gap-4">
                              {(["plain", "fanchant"] as const).map((version) => (
                                <button
                                  key={version}
                                  aria-pressed={lyricsVersion === version}
                                  onClick={() => setLyricsVersion(version)}
                                  className={`type-sub font-semibold cursor-pointer ${
                                    lyricsVersion === version ? "text-navy border-b-2 border-point" : "text-navy/70"
                                  }`}
                                >
                                  {version === "plain" ? t.lyricsTabPlain : t.lyricsTabFanchant}
                                </button>
                              ))}
                            </div>

                            <div className="max-h-72 overflow-y-auto border-l-2 border-navy/10 pl-4 type-body text-navy whitespace-pre-wrap">
                              {lyricsVersion === "plain" ? (
                                track.lyrics || <p className="type-sub text-navy/70">{t.noLyricsPlain}</p>
                              ) : track.lyrics_fanchant ? (
                                renderFanchantLyrics(track.lyrics_fanchant)
                              ) : (
                                <p className="type-sub text-navy/70">{t.noLyricsFanchant}</p>
                              )}
                            </div>

                            <div>
                              <button onClick={() => openEditLyrics(track)} className={textLink}>
                                {t.lyricsContributeBtn}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      {/* 가사 기여 */}
      <Sheet
        open={!!editModalTrack}
        onClose={() => setEditModalTrack(null)}
        closeLabel={t.cancelBtn}
        header={
          editModalTrack && (
            <>
              <p className="type-caption text-navy/70">{t.lyricsContributeTitle}</p>
              <h2 className="type-title-1 text-navy break-words">{editModalTrack.title}</h2>
              <p className="type-sub text-navy/70">{editModalTrack.artist_name}</p>
            </>
          )
        }
        footer={
          <div className="flex gap-2">
            <button onClick={() => setEditModalTrack(null)} className={`${secondaryButton} flex-1`}>
              {t.cancelBtn}
            </button>
            <button
              onClick={handleLyricsSubmit}
              disabled={!isPledgeChecked || isSubmittingLyrics || !editLyricsContent.trim()}
              className={`${primaryButton} flex-[1.5]`}
            >
              {isSubmittingLyrics ? t.submitting : t.submitBtn}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6 pb-2">
          <div role="group" className="flex border-b border-navy/10">
            {(["plain", "fanchant"] as const).map((type) => (
              <button
                key={type}
                aria-pressed={editLyricsType === type}
                onClick={() => setEditLyricsType(type)}
                className={`relative flex-1 py-2.5 type-body-strong cursor-pointer ${
                  editLyricsType === type ? "text-navy" : "text-navy/70"
                }`}
              >
                {type === "plain" ? t.lyricsTabPlain : t.lyricsTabFanchant}
                {editLyricsType === type && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-point" />}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="edit-lyrics-textarea" className="type-sub font-semibold text-navy">
                {editLyricsType === "plain" ? t.lyricsLabelPlain : t.lyricsLabelFanchant}
              </label>
              {editLyricsType === "fanchant" && (
                <button onClick={handleWrapSelection} className={textLink}>
                  {t.fanchantWrapBtn}
                </button>
              )}
            </div>
            <textarea
              id="edit-lyrics-textarea"
              value={editLyricsContent}
              onChange={(e) => setEditLyricsContent(e.target.value)}
              rows={8}
              className="w-full p-4 bg-white border border-navy/15 rounded-xl type-body text-navy outline-none focus:border-navy resize-none placeholder:text-navy/40"
              placeholder={editLyricsType === "plain" ? t.lyricsPlaceholderPlain : t.lyricsPlaceholderFanchant}
            />
          </div>

          <section>
            <h3 className="type-sub font-semibold text-navy">{t.editorGuideTitle}</h3>
            <p className="type-sub text-navy/70 whitespace-pre-line mt-1">
              {editLyricsType === "plain" ? t.editorGuidePlain : t.editorGuideFanchant}
            </p>
          </section>

          {editLyricsType === "fanchant" && editLyricsContent.trim() && (
            <section>
              <h3 className="type-sub font-semibold text-navy">{t.livePreviewTitle}</h3>
              <div className="mt-2 max-h-36 overflow-y-auto border-l-2 border-navy/10 pl-4 type-body text-navy whitespace-pre-wrap">
                {renderFanchantLyrics(editLyricsContent)}
              </div>
            </section>
          )}

          <section className="border-t border-navy/10 pt-5">
            <h3 className="type-sub font-semibold text-navy">{t.pledgeTitle}</h3>
            <p className="type-sub text-navy/70 mt-1">{t.pledgeText}</p>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none type-sub font-semibold text-navy">
              <input
                type="checkbox"
                checked={isPledgeChecked}
                onChange={(e) => setIsPledgeChecked(e.target.checked)}
                className="w-4 h-4 accent-navy"
              />
              {t.pledgeCheckbox}
            </label>
          </section>
        </div>
      </Sheet>

      {/* 미발매곡 등록 신청 */}
      <Sheet
        open={isAddTrackOpen}
        onClose={closeAddTrack}
        closeLabel={t.cancelBtn}
        header={
          <>
            <h2 className="type-title-1 text-navy">{t.addTrackTitle}</h2>
            <p className="type-sub text-navy/70 mt-1">{t.addTrackSub}</p>
          </>
        }
      >
        <form id="add-track-form" onSubmit={handleAddTrackSubmit} className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-track-title" className="type-sub font-semibold text-navy">
              {t.formTrackTitle} <span className="text-navy/70">({t.required})</span>
            </label>
            <input
              id="add-track-title"
              type="text"
              required
              placeholder={t.formPlaceholderTitle}
              value={addForm.title}
              onChange={(e) => setAddForm((prev) => ({ ...prev, title: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-track-artist" className="type-sub font-semibold text-navy">
              {t.formArtist} <span className="text-navy/70">({t.required})</span>
            </label>
            {!selectedArtist ? (
              <>
                <div className="relative">
                  <input
                    id="add-track-artist"
                    type="text"
                    placeholder={t.formArtistSearch}
                    value={artistSearchQuery}
                    onChange={(e) => setArtistSearchQuery(e.target.value)}
                    className={inputClass}
                  />
                  {isSearchingArtist && (
                    <Disc className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-point" size={18} />
                  )}
                </div>
                {/* 시트 안에서 잘리지 않도록 떠 있는 드롭다운 대신 아래에 목록으로 편다 */}
                {artistSearchResults.length > 0 && (
                  <ul className="divide-y divide-navy/10">
                    {artistSearchResults.map((artist) => (
                      <li key={artist.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArtist(artist);
                            setAddForm((prev) => ({ ...prev, artistId: artist.id, artistName: artist.name }));
                            setArtistSearchQuery("");
                            setArtistSearchResults([]);
                          }}
                          className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer"
                        >
                          <span className="relative w-8 h-8 shrink-0 overflow-hidden rounded-full bg-navy/5">
                            <SafeImage src={artist.image} alt={artist.name} fill sizes="32px" fallbackType="artist" className="object-cover" />
                          </span>
                          <span className="type-body-strong text-navy truncate">{artist.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 h-12">
                <span className="relative w-8 h-8 shrink-0 overflow-hidden rounded-full bg-navy/5">
                  <SafeImage src={selectedArtist.image} alt={selectedArtist.name} fill sizes="32px" fallbackType="artist" className="object-cover" />
                </span>
                <span className="flex-1 min-w-0 type-body-strong text-navy truncate">{selectedArtist.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtist(null);
                    setAddForm((prev) => ({ ...prev, artistId: "", artistName: "" }));
                    setArtistSearchQuery("");
                    setArtistSearchResults([]);
                  }}
                  className={textLink}
                >
                  {t.changeArtist}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-track-video" className="type-sub font-semibold text-navy">{t.formVideoUrl}</label>
            <input
              id="add-track-video"
              type="url"
              placeholder={t.formPlaceholderVideoUrl}
              value={addForm.videoUrl}
              onChange={(e) => setAddForm((prev) => ({ ...prev, videoUrl: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-track-date" className="type-sub font-semibold text-navy">{t.formReleaseDate}</label>
            <input
              id="add-track-date"
              type="date"
              value={addForm.releaseDate}
              onChange={(e) => setAddForm((prev) => ({ ...prev, releaseDate: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={closeAddTrack} className={`${secondaryButton} flex-1`}>
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={isSubmittingTrack || !addForm.title.trim() || !addForm.artistId}
              className={`${primaryButton} flex-[1.5]`}
            >
              {isSubmittingTrack ? t.submittingTrack : t.submitTrackBtn}
            </button>
          </div>
        </form>
      </Sheet>

      {/* 공식 발매 제보 확인 */}
      <ConfirmSheet
        open={!!reportConfirmTrack}
        title={reportConfirmTrack ? t.reportConfirmHeading.replace("{title}", reportConfirmTrack.title) : ""}
        desc={t.reportConfirmDesc}
        confirmLabel={t.reportConfirmBtn}
        cancelLabel={t.reportConfirmCancel}
        onClose={() => setReportConfirmTrack(null)}
        onConfirm={async () => {
          if (!reportConfirmTrack) return;
          const trackId = reportConfirmTrack.id;
          setReportConfirmTrack(null);
          await handleReportRelease(trackId);
        }}
      />

      {/* LOGIN TRIGGER MODAL */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        locale={locale}
        onSuccess={() => {
          setIsLoginModalOpen(false);
          showToast(t.loginSuccess);
          if (activeTab === "unreleased") {
            loadUnreleasedTracks();
          }
        }}
      />
    </main>
  );
}
