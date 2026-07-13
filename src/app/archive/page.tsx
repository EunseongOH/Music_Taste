"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, 
  Music, 
  Award, 
  ArrowLeft, 
  Disc, 
  ChevronRight, 
  Search, 
  Plus, 
  Play, 
  Video, 
  FileText, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Square, 
  CheckSquare, 
  Globe, 
  Sparkles,
  Info,
  X
} from "lucide-react";
import Image from "next/image";
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
import { curatedArtists } from "@/utils/curatedArtists";
import { searchSpotifyArtists } from "@/utils/spotify";

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
    title: "취향 아카이브",
    subtitle: "리스너들의 음악 취향표",
    desc: "공개된 아카이브 목록을 구경하고, 나와 취향이 꼭 닮은 리스너들의 취향표를 탐색해 보세요.",
    artistLabel: "아티스트",
    winnerLabel: "1위 곡 정보",
    createdLabel: "생성일",
    emptyTitle: "아직 공개된 취향표가 없어요",
    emptyDesc: "첫 번째로 취향표를 완성하여 웹에 공개해 보세요!",
    viewDetail: "전체 취향 순위 보기",
    allArtists: "모든 아티스트",
    nicknameDefault: "음악팬",
    singleDiscography: "최애 곡 줄 세우기",
    loading: "정보를 불러오는 중...",
    
    // Tabs & Unreleased Song features
    tabTaste: "취향표 아카이브",
    tabUnreleased: "승인된 미발매곡 목록",
    searchPlaceholder: "곡명 또는 아티스트 검색...",
    addUnreleasedBtn: "미발매곡 등록 신청",
    unreleasedSubtitle: "미발매곡 아카이브",
    unreleasedDesc: "공식 음원 사이트에는 없지만, 공연이나 유튜브를 통해 사랑받는 리스너들의 미발매곡 아카이브입니다.",
    emptyUnreleasedTitle: "아직 등록된 미발매곡이 없어요",
    emptyUnreleasedDesc: "첫 번째로 미발매곡을 등록해 다른 리스너들과 음악 취향을 공유해 보세요!",
    playBtn: "들어보기",
    stopBtn: "플레이어 닫기",
    reportReleaseBtn: "공식 발매 제보",
    reportReleaseDone: "제보 완료",
    reportReleaseSuccess: "곡 발매를 제보해 주셔서 고마워요! 공식 발매 여부를 확인한 뒤 며칠 내로 반영할게요.",
    reportReleaseError: "제보 처리에 실패했습니다. 다시 시도해 주세요.",
    reportConfirmTitle: "공식 발매 제보",
    reportConfirmHeading: "'{title}' 곡이 공식 발매되었나요?",
    reportConfirmDesc: "리스너들이 제보해 주시면, 공식 발매 여부를 확인한 뒤 며칠 내로 반영할게요.",
    reportConfirmBtn: "제보하기",
    reportConfirmCancel: "돌아가기",
    tabReleasedHistory: "발매 전환된 곡 목록",
    lyricsTabPlain: "일반 가사",
    lyricsTabFanchant: "떼창 / 응원법",
    noLyricsPlain: "등록된 일반 가사가 없습니다. 가사를 등록해 주세요!",
    noLyricsFanchant: "등록된 떼창/응원법 가사가 없습니다. 응원법 가사를 추가해 주세요!",
    lyricsContributeBtn: "가사 등록 / 수정",
    lyricsContributeTitle: "가사 기여 및 수정 제안",
    lyricsLabelPlain: "일반 가사 내용",
    lyricsLabelFanchant: "떼창/응원법 가사 내용",
    editorGuideTitle: "가사 기여 가이드",
    editorGuidePlain: "팬들 사이에 공유되는 정확한 미발매곡 가사를 입력해 주세요. 작성 완료 시 어드민의 승인 절차를 거치게 됩니다.",
    editorGuideFanchant: "원 가사 내용 중 떼창이나 응원 파트에 해당하는 텍스트를 대괄호 `[ ]`로 감싸 주세요.\n감싸진 텍스트는 뷰어에서 포인트 색상으로 다르게 해석되어 강조 표시됩니다.\n예시: `[떼창할 부분]`",
    fanchantWrapBtn: "선택 부분을 떼창으로 지정 [ ]",
    pledgeTitle: "악성 정보 기여 방지를 위한 서약",
    pledgeText: "제출하는 가사에 악의 비방, 거짓 정보, 장난 섞인 내용을 포함하지 않겠으며, 고의로 어긴 사실이 드러날 경우 서비스 이용 금지 처분이 내려질 수 있음을 인지하고 이에 동의합니다.",
    pledgeCheckbox: "네, 안내된 내용을 명확히 확인했으며 동의합니다. (필수)",
    cancelBtn: "취소",
    submitBtn: "수정 제안 제출",
    submitTrackBtn: "등록 신청하기",
    lyricsSubmittedSuccess: "가사 수정 제안이 전송되었습니다. 어드민의 검수 및 승인 후 서비스에 즉시 반영됩니다! 💌",
    lyricsSubmittedError: "가사 수정 요청에 실패했습니다. 다시 시도해 주세요.",
    
    // Add Track Form
    addTrackTitle: "미발매곡 등록 신청",
    addTrackSub: "발매되지 않은 소중한 곡을 아카이브에 추가합니다. 등록 후 어드민의 승인을 거쳐 아카이브 목록에 나타납니다.",
    formTrackTitle: "곡 제목",
    formArtist: "아티스트",
    formVideoUrl: "공연/라이브 영상 링크 (유튜브)",
    formReleaseDate: "공연/공개일 (선택)",
    performDate: "공연일",
    formPlaceholderTitle: "예: 임시동맹",
    formPlaceholderVideoUrl: "https://www.youtube.com/watch?v=... 또는 https://youtu.be/...",
    formSelectArtistDefault: "아티스트를 선택하세요",
    trackSubmittedSuccess: "신청이 성공적으로 전송되었습니다! 어드민 검토 후 목록에 반영됩니다. 🥳",
    trackSubmittedError: "미발매곡 등록 신청에 실패했습니다. 다시 시도해 주세요.",
    submitting: "제출 중...",
    submittingTrack: "신청 중...",
    checkAuthText: "가사 등록 및 수정을 하려면 로그인이 필요합니다.",
    checkAuthAddTrack: "미발매곡을 등록 신청하려면 로그인이 필요합니다.",
    livePreviewTitle: "가사 실시간 뷰어 미리보기",
  },
  en: {
    title: "Public Archive",
    subtitle: "Music Taste Cards",
    desc: "Explore public taste cards and discover what other music fans with similar tastes love listening to.",
    artistLabel: "Artist",
    winnerLabel: "1st Choice Track",
    createdLabel: "Created",
    emptyTitle: "No public taste cards yet",
    emptyDesc: "Be the first to complete a world cup and publish your taste card!",
    viewDetail: "View Complete Tastes",
    allArtists: "All Artists",
    nicknameDefault: "Music Fan",
    singleDiscography: "Favorite Songs Lineup",
    loading: "Loading archive info...",
    
    // Tabs & Unreleased Song features
    tabTaste: "Taste Archives",
    tabUnreleased: "Approved Unreleased",
    searchPlaceholder: "Search song or artist...",
    addUnreleasedBtn: "Request to Register",
    unreleasedSubtitle: "Unreleased Archives",
    unreleasedDesc: "Archived tracks that aren't officially released but are performed live or found on YouTube.",
    emptyUnreleasedTitle: "No unreleased songs yet",
    emptyUnreleasedDesc: "Be the first to register an unreleased track and share it with other listeners!",
    playBtn: "Listen",
    stopBtn: "Close Player",
    lyricsTabPlain: "Lyrics",
    lyricsTabFanchant: "Fanchants",
    noLyricsPlain: "No lyrics registered yet. Please contribute lyrics!",
    noLyricsFanchant: "No fanchant lyrics registered. Please contribute fanchants!",
    lyricsContributeBtn: "Contribute Lyrics",
    lyricsContributeTitle: "Contribute / Edit Lyrics",
    lyricsLabelPlain: "Standard Lyrics Content",
    lyricsLabelFanchant: "Fanchant Lyrics Content",
    editorGuideTitle: "Contribution Guidelines",
    editorGuidePlain: "Please provide accurate lyrics. Submissions will be reviewed and approved by an admin before publication.",
    editorGuideFanchant: "Enclose fanchant or singalong parts in square brackets `[ ]`.\nEnclosed text will render in a distinct highlight color in the viewer.\nExample: `[singalong part]`",
    fanchantWrapBtn: "Mark Selection as Fanchant [ ]",
    pledgeTitle: "Pledge against Malicious Contributions",
    pledgeText: "I pledge that the contributed lyrics do not contain malicious slander, profanity, or false information. I understand that intentional violations may result in service restrictions or account suspension.",
    pledgeCheckbox: "Yes, I understand and agree to the terms. (Required)",
    cancelBtn: "Cancel",
    submitBtn: "Submit Suggestion",
    submitTrackBtn: "Submit Request",
    lyricsSubmittedSuccess: "Lyrics update suggestion submitted! It will be updated upon admin approval. 💌",
    lyricsSubmittedError: "Failed to submit lyrics suggestion. Please try again.",
    reportReleaseBtn: "Report Official Release",
    reportReleaseDone: "Reported",
    reportReleaseSuccess: "Thank you for reporting the official release! We will verify and update it in a few days.",
    reportReleaseError: "Failed to report release. Please try again.",
    reportConfirmTitle: "Report Official Release",
    reportConfirmHeading: "Has '{title}' been officially released?",
    reportConfirmDesc: "Once reported, we will verify the release and update the archives in a few days.",
    reportConfirmBtn: "Report Release",
    reportConfirmCancel: "Go Back",
    tabReleasedHistory: "Officially Released Tracks",
    
    // Add Track Form
    addTrackTitle: "Suggest Unreleased Track",
    addTrackSub: "Suggest a precious unreleased track to the archive. It will appear in the public list after admin approval.",
    formTrackTitle: "Track Title",
    formArtist: "Artist",
    formVideoUrl: "Live/Performance Video Link (YouTube)",
    formReleaseDate: "Performance/First Reveal Date (Optional)",
    performDate: "Performed",
    formPlaceholderTitle: "e.g. Temporary Alliance",
    formPlaceholderVideoUrl: "https://www.youtube.com/watch?v=... or https://youtu.be/...",
    formSelectArtistDefault: "Select Artist",
    trackSubmittedSuccess: "Submission requested successfully! Added to the queue for admin approval. 🥳",
    trackSubmittedError: "Failed to suggest track. Please try again.",
    submitting: "Submitting...",
    submittingTrack: "Submitting Request...",
    checkAuthText: "Login is required to contribute lyrics.",
    checkAuthAddTrack: "Login is required to request unreleased tracks.",
    livePreviewTitle: "Lyrics Live Preview",
  }
};

const formatNickname = (name: string, defaultName: string): string => {
  if (!name) return defaultName;
  if (name.includes("@")) {
    const [localPart] = name.split("@");
    if (localPart.length <= 3) {
      return `${localPart}***`;
    }
    return `${localPart.substring(0, 3)}***`;
  }
  return name;
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
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Set locale
  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  // Fetch Public Taste Cards
  useEffect(() => {
    const fetchPublicData = async () => {
      if (activeTab !== "taste") return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("tournament_results")
          .select("*")
          .eq("is_public", true)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setResults(data || []);
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
      showToast(t.reportReleaseSuccess, "success");
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

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

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
        <div key={lineIdx} className="min-h-[1.5rem] leading-relaxed">
          {parts.length === 0 ? (
            <span className="opacity-0"> </span>
          ) : (
            parts.map((part, partIdx) => (
              <span
                key={partIdx}
                className={
                  part.isFanchant
                    ? "text-point font-bold bg-point/10 px-1 py-0.5 rounded border border-point/20 mx-0.5 shadow-sm inline-block"
                    : "text-charcoal/90"
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
      showToast(t.lyricsSubmittedSuccess, "success");
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
      showToast(t.trackSubmittedSuccess, "success");
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

  // Curated artists list for track suggest dropdown
  const uniqueArtists = Array.from(
    new Map(Object.values(curatedArtists).flat().map((a: any) => [a.id, a])).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const t = translations[locale];

  // Filtering unreleased tracks
  const filteredUnreleased = unreleasedTracks.filter(
    (track) =>
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artist_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <div className="fixed top-6 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              className={`px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 max-w-md w-full pointer-events-auto border ${
                toast.type === "success" 
                  ? "bg-navy text-cream border-white/10" 
                  : "bg-red-950 text-red-200 border-red-850"
              }`}
            >
              {toast.type === "success" ? (
                <Check size={18} className="text-point shrink-0" strokeWidth={3} />
              ) : (
                <Info size={18} className="text-red-400 shrink-0" strokeWidth={3} />
              )}
              <p className="font-sans text-sm leading-snug">{toast.text}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton
            className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0"
            onClick={() => router.push("/")}
          />
          <h1 className="font-serif text-2xl text-navy tracking-tight">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileHeader locale={locale} />
        </div>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
        {/* Banner Section */}
        <div className="p-6 text-center bg-gradient-to-b from-[#F5F2ED] via-[#F5F2ED]/70 to-transparent">
          <span className="inline-block px-3 py-1 bg-navy/5 text-navy font-bold font-sans text-[10px] uppercase tracking-wider rounded-full mb-2">
            Public Music Archive Space
          </span>
          <h2 className="font-serif text-3xl text-navy tracking-tight leading-tight">
            {activeTab === "taste" ? t.subtitle : t.unreleasedSubtitle}
          </h2>
          <p className="font-sans text-xs text-charcoal/70 mt-1.5 px-4 leading-relaxed break-keep">
            {activeTab === "taste" ? t.desc : t.unreleasedDesc}
          </p>
        </div>

        {/* Dynamic Tab Switcher */}
        <div className="flex border-b border-navy/10 mb-6 justify-center w-full max-w-md mx-auto px-4 relative z-10">
          <button
            onClick={() => setActiveTab("taste")}
            className={`py-3 px-6 font-sans text-xs sm:text-sm font-bold relative transition-all ${
              activeTab === "taste" ? "text-navy" : "text-navy/40 hover:text-navy/70"
            }`}
          >
            {t.tabTaste}
            {activeTab === "taste" && (
              <motion.div
                layoutId="archiveActiveLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-navy"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("unreleased");
              setIsPlayingVideoId(null);
              setExpandedLyricsTrackId(null);
            }}
            className={`py-3 px-6 font-sans text-xs sm:text-sm font-bold relative transition-all ${
              activeTab === "unreleased" ? "text-navy" : "text-navy/40 hover:text-navy/70"
            }`}
          >
            {t.tabUnreleased}
            {activeTab === "unreleased" && (
              <motion.div
                layoutId="archiveActiveLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-navy"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
            <Disc className="animate-spin text-point/85" size={32} />
            <p className="font-sans text-xs text-navy/60 font-medium">{t.loading}</p>
          </div>
        )}

        {/* TASTE TAB CONTENT */}
        {!isLoading && activeTab === "taste" && (
          <>
            {results.length === 0 ? (
              <div className="mx-6 py-16 text-center border-2 border-dashed border-navy/20 rounded-[2rem] px-6 bg-white/30">
                <Music size={48} className="text-navy/20 mx-auto mb-4" />
                <h3 className="font-serif text-lg text-navy font-bold mb-1">{t.emptyTitle}</h3>
                <p className="font-sans text-xs text-navy/50 leading-relaxed px-4 break-keep">
                  {t.emptyDesc}
                </p>
              </div>
            ) : (
              <div className="px-6 flex flex-col gap-6">
                {results.map((result) => {
                  const formattedDate = new Date(result.created_at).toLocaleDateString(
                    locale === "en" ? "en-US" : "ko-KR",
                    { year: "numeric", month: "2-digit", day: "2-digit" }
                  );

                  return (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-6 shadow-sm hover:border-point hover:shadow-md transition-all flex flex-col gap-4 relative overflow-hidden group"
                    >
                      {/* Card Header metadata */}
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-sans text-[10px] text-charcoal/50 flex items-center gap-1 shrink-0">
                              <Calendar size={11} />
                              {formattedDate}
                            </span>
                            {result.is_single_artist && (
                              <span className="px-1.5 py-0.5 rounded-md bg-point/10 text-point font-sans font-bold text-[8px] tracking-tight shrink-0">
                                {t.singleDiscography}
                              </span>
                            )}
                          </div>
                          <h3 className="font-serif text-lg text-navy font-bold mt-0.5 leading-tight truncate pr-2">
                            {result.title}
                          </h3>
                          <span className="font-sans text-[10.5px] text-charcoal/60 font-semibold">
                            By {formatNickname(result.user_nickname, t.nicknameDefault)}
                          </span>
                        </div>

                        {/* User profile image */}
                        <div className="relative w-9 h-9 rounded-full overflow-hidden border border-navy/20 shadow-sm shrink-0 bg-white">
                          <SafeImage
                            src={result.user_profile_image || "/default-profile.png"}
                            alt={formatNickname(result.user_nickname, t.nicknameDefault)}
                            width={36}
                            height={36}
                            fallbackType="artist"
                            className="object-cover w-full h-full"
                          />
                        </div>
                      </div>

                      {/* Winner track image PEAK */}
                      <div className="flex flex-col items-center bg-white/70 rounded-3xl border border-navy/5 p-4 relative overflow-hidden mt-1 shadow-inner">
                        <div className="relative w-36 h-28 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 select-none">
                          <div className="absolute right-2 w-24 h-24 rounded-full border-2 border-navy bg-[#1a1a1a] flex items-center justify-center shadow-md z-10">
                            <div className="absolute w-[85%] h-[85%] rounded-full border border-white/10 pointer-events-none" />
                            <div className="absolute w-[70%] h-[70%] rounded-full border border-white/10 pointer-events-none" />
                            <div className="absolute w-[55%] h-[55%] rounded-full border border-white/10 pointer-events-none" />
                            <div className="w-[45%] h-[45%] rounded-full border border-navy/20 relative overflow-hidden bg-point z-20 flex items-center justify-center shadow-inner">
                              <SafeImage
                                src={result.winner_track_image}
                                alt=""
                                fill
                                sizes="40px"
                                fallbackType="track"
                                className="object-cover opacity-80"
                              />
                              <div className="w-[20%] h-[20%] rounded-full bg-cream border border-navy shadow-sm z-30 absolute" />
                            </div>
                          </div>

                          <div className="absolute left-2 w-24 h-24 rounded-xl border border-navy/20 bg-cream shadow-md overflow-hidden z-20">
                            {result.winner_track_image ? (
                              <SafeImage
                                src={result.winner_track_image}
                                alt={result.winner_track_title}
                                fill
                                sizes="96px"
                                fallbackType="track"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-navy/30">
                                <Music size={24} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-3.5 bg-point text-white text-[9.5px] font-sans font-bold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 uppercase tracking-wider">
                          <Award size={11} /> 1st Choice
                        </div>

                        <div className="text-center mt-2.5 w-full px-2">
                          <h4 className="font-sans font-bold text-sm text-navy truncate leading-tight">
                            {result.winner_track_title}
                          </h4>
                          <p className="font-sans text-[11px] text-navy/60 truncate mt-0.5 font-medium">
                            {result.winner_track_artist}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => router.push(`/taste/${result.id}`)}
                        className="w-full py-3.5 mt-1 bg-navy text-cream rounded-2xl hover:bg-navy/95 transition-all font-sans font-bold text-xs shadow-md active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 group-hover:border-point"
                      >
                        <span>{t.viewDetail}</span>
                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* UNRELEASED TRACKS TAB CONTENT */}
        {!isLoading && activeTab === "unreleased" && (
          <div className="px-3 sm:px-4 flex flex-col gap-5">
            {/* Filter pills: Unreleased List vs Released History */}
            <div className="flex justify-center gap-2 max-w-md mx-auto w-full mb-1.5">
              <button
                onClick={() => setShowReleasedHistory(false)}
                className={`px-4 py-2 rounded-full font-sans text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm ${
                  !showReleasedHistory
                    ? "bg-navy/5 text-navy border-navy/15 font-bold"
                    : "bg-white text-navy/40 border-navy/10 hover:text-navy/60 hover:bg-navy/[0.02]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!showReleasedHistory ? "bg-point" : "bg-navy/20"}`} />
                {locale === "ko" ? "미발매곡 목록" : "Unreleased List"}
              </button>
              <button
                onClick={() => setShowReleasedHistory(true)}
                className={`px-4 py-2 rounded-full font-sans text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm ${
                  showReleasedHistory
                    ? "bg-navy/5 text-navy border-navy/15 font-bold"
                    : "bg-white text-navy/40 border-navy/10 hover:text-navy/60 hover:bg-navy/[0.02]"
                }`}
              >
                <span className={showReleasedHistory ? "text-point" : "text-navy/30"}>✨</span>
                {t.tabReleasedHistory}
              </button>
            </div>

            {/* Search and Add controls */}
            <div className="flex gap-2 items-center w-full max-w-md mx-auto">
              <div className="relative flex-1 bg-cream/50 border border-navy/8 rounded-2xl flex items-center px-3.5 py-2.5 shadow-inner focus-within:border-navy/20 transition-all">
                <Search size={14} className="text-navy/40 mr-2" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none font-sans text-xs w-full text-navy placeholder:text-navy/30"
                />
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
                className="bg-navy hover:bg-navy/90 text-cream p-2.5 sm:px-4 sm:py-2.5 rounded-2xl shadow transition-all active:scale-[0.98] flex items-center justify-center gap-1 shrink-0"
              >
                <Plus size={14} />
                <span className="font-sans text-xs font-bold hidden sm:inline">{t.addUnreleasedBtn}</span>
              </button>
            </div>

            {/* List */}
            {filteredUnreleased.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-navy/20 rounded-[2.5rem] px-6 bg-white/30 mt-3 max-w-lg mx-auto w-full">
                <Music size={40} className="text-navy/20 mx-auto mb-4" />
                <h3 className="font-serif text-lg text-navy font-bold mb-1">{t.emptyUnreleasedTitle}</h3>
                <p className="font-sans text-xs text-navy/50 leading-relaxed px-4 break-keep">
                  {t.emptyUnreleasedDesc}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full mt-2">
                {filteredUnreleased.map((track) => {
                  const youtubeId = track.video_url ? getYouTubeVideoId(track.video_url) : null;
                  const isPlaying = isPlayingVideoId === track.id;
                  const isLyricsExpanded = expandedLyricsTrackId === track.id;

                  return (
                    <motion.div
                      key={track.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/80 border border-navy/10 rounded-[2.2rem] p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
                    >
                      {/* Top: Thumbnail + Track Info */}
                      <div className="flex items-start gap-3.5">
                        {youtubeId ? (
                          <div
                            onClick={() => setIsPlayingVideoId(isPlaying ? null : track.id)}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-navy/10 overflow-hidden shrink-0 shadow bg-black relative cursor-pointer group/thumb hover:border-point transition-all active:scale-95"
                            title={isPlaying ? t.stopBtn : t.playBtn}
                          >
                            <SafeImage
                              src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                              alt={track.title}
                              fill
                              sizes="64px"
                              fallbackType="track"
                              className="object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                              <Play size={14} className="text-white fill-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-navy/10 bg-cream flex items-center justify-center shrink-0">
                            <Music size={20} className="text-navy/30" />
                          </div>
                        )}

                        {/* Track info — full width, no truncation */}
                        <div className="flex-1 min-w-0 text-left flex flex-col gap-0.5">
                          <h3 className="font-serif text-base sm:text-lg text-navy font-bold leading-snug break-words">
                            {track.title}
                          </h3>
                          <p className="font-sans text-xs sm:text-sm text-charcoal/70 font-semibold break-words">
                            {track.artist_name}
                          </p>
                          {track.release_date && (
                            <p className="font-sans text-[10px] text-charcoal/40 flex items-center gap-1 mt-0.5">
                              <Calendar size={10} />
                              {t.performDate}: {track.release_date}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bottom: Action buttons row */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {track.video_url && (
                          <button
                            onClick={() => setIsPlayingVideoId(isPlaying ? null : track.id)}
                            className={`flex-1 py-2 rounded-full border font-sans text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              isPlaying
                                ? "bg-navy text-cream border-navy hover:bg-navy/90"
                                : "bg-white text-navy border-navy/15 hover:bg-navy/5 shadow-sm"
                            }`}
                          >
                            <Video size={13} className={isPlaying ? "animate-pulse text-point" : ""} />
                            <span>{isPlaying ? t.stopBtn : t.playBtn}</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setExpandedLyricsTrackId(isLyricsExpanded ? null : track.id);
                            setLyricsVersion("plain");
                          }}
                          className={`flex-1 py-2 rounded-full border font-sans text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            isLyricsExpanded
                              ? "bg-cream text-navy border-navy/20"
                              : "bg-white text-navy/60 border-navy/10 hover:bg-navy/5 shadow-sm"
                          }`}
                        >
                          {isLyricsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          <span className="font-sans text-xs">
                            {isLyricsExpanded
                              ? (locale === "ko" ? "가사 닫기" : "Close Lyrics")
                              : (locale === "ko" ? "가사 보기" : "View Lyrics")}
                          </span>
                        </button>
                      </div>

                      {/* YouTube Player Section */}
                      <AnimatePresence>
                        {isPlaying && youtubeId && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden w-full"
                          >
                            <div className="w-full aspect-video rounded-3xl overflow-hidden border border-navy/10 shadow-inner bg-black">
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

                      {/* Lyrics Panel Section */}
                      <AnimatePresence>
                        {isLyricsExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-navy/5 pt-4 flex flex-col gap-4 text-left"
                          >
                            {/* Plain / Fanchant Selector */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setLyricsVersion("plain")}
                                className={`px-3.5 py-1.5 rounded-full font-sans text-[10px] font-bold transition-all border ${
                                  lyricsVersion === "plain"
                                    ? "bg-navy/5 text-navy border-navy/20 font-bold"
                                    : "bg-transparent text-charcoal/50 border-transparent hover:text-charcoal/80"
                                }`}
                              >
                                {t.lyricsTabPlain}
                              </button>
                              <button
                                onClick={() => setLyricsVersion("fanchant")}
                                className={`px-3.5 py-1.5 rounded-full font-sans text-[10px] font-bold transition-all border flex items-center gap-1 ${
                                  lyricsVersion === "fanchant"
                                    ? "bg-navy/5 text-navy border-navy/20 font-bold"
                                    : "bg-transparent text-charcoal/50 border-transparent hover:text-charcoal/80"
                                }`}
                              >
                                <Sparkles size={10} className="text-point" />
                                {t.lyricsTabFanchant}
                              </button>
                            </div>

                            {/* Lyrics Text Box */}
                            <div className="w-full bg-[#FAF8F5] border border-navy/5 rounded-3xl p-5 max-h-72 overflow-y-auto font-sans text-xs text-charcoal/80 whitespace-pre-wrap leading-relaxed shadow-inner">
                              {lyricsVersion === "plain" ? (
                                track.lyrics ? (
                                  track.lyrics
                                ) : (
                                  <p className="text-charcoal/40 text-center py-6 italic">{t.noLyricsPlain}</p>
                                )
                              ) : track.lyrics_fanchant ? (
                                renderFanchantLyrics(track.lyrics_fanchant)
                              ) : (
                                <p className="text-charcoal/40 text-center py-6 italic">{t.noLyricsFanchant}</p>
                              )}
                            </div>

                            {/* Contribute Action */}
                            <div className="flex gap-2 w-full">
                              <button
                                onClick={() => openEditLyrics(track)}
                                className="flex-1 py-3 bg-white hover:bg-navy/5 border border-navy/15 text-navy rounded-2xl transition-all font-sans font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-sm"
                              >
                                <FileText size={14} className="text-point" />
                                <span>{t.lyricsContributeBtn}</span>
                              </button>
                              
                              {!showReleasedHistory && (
                                <button
                                  onClick={() => setReportConfirmTrack(track)}
                                  disabled={reportedTracks.includes(track.id)}
                                  className={`px-4 py-3 border rounded-2xl transition-all font-sans font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-sm ${
                                    reportedTracks.includes(track.id)
                                      ? "bg-green-50 border-green-200 text-green-700 pointer-events-none"
                                      : "bg-white hover:bg-navy/5 border-navy/15 text-navy"
                                  }`}
                                >
                                  {reportedTracks.includes(track.id) ? (
                                    <>
                                      <Check size={14} className="text-green-600" />
                                      <span>{t.reportReleaseDone}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Info size={14} className="text-point" />
                                      <span>{t.reportReleaseBtn}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1. LYRICS SUGGESTION MODAL */}
      <AnimatePresence>
        {editModalTrack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#F5F2ED] border border-navy/20 rounded-[2.5rem] p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-4 shadow-xl text-left"
            >
              {/* Header */}
              <div>
                <span className="font-sans text-[10px] font-bold text-point uppercase tracking-wider bg-point/10 px-2 py-0.5 rounded-full w-fit">
                  {t.lyricsContributeTitle}
                </span>
                <h2 className="font-serif text-2xl text-navy font-bold mt-1.5 leading-snug">
                  {editModalTrack.title}
                </h2>
                <p className="font-sans text-xs text-charcoal/60 font-semibold">{editModalTrack.artist_name}</p>
              </div>

              {/* Version Selector */}
              <div className="grid grid-cols-2 p-1 bg-cream/70 border border-navy/15 rounded-2xl">
                <button
                  onClick={() => setEditLyricsType("plain")}
                  className={`py-2 rounded-xl font-sans text-xs font-bold transition-all ${
                    editLyricsType === "plain" ? "bg-navy text-cream shadow" : "text-navy/50 hover:text-navy"
                  }`}
                >
                  {t.lyricsTabPlain}
                </button>
                <button
                  onClick={() => setEditLyricsType("fanchant")}
                  className={`py-2 rounded-xl font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    editLyricsType === "fanchant" ? "bg-navy text-cream shadow" : "text-navy/50 hover:text-navy"
                  }`}
                >
                  <Sparkles size={11} className={editLyricsType === "fanchant" ? "text-point" : "text-navy/40"} />
                  {t.lyricsTabFanchant}
                </button>
              </div>

              {/* Editing Area */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="font-sans text-xs font-bold text-navy">
                    {editLyricsType === "plain" ? t.lyricsLabelPlain : t.lyricsLabelFanchant}
                  </label>
                  {editLyricsType === "fanchant" && (
                    <button
                      onClick={handleWrapSelection}
                      className="px-2.5 py-1 bg-white hover:bg-navy/5 border border-navy/15 text-navy rounded-lg font-sans text-[10px] font-bold shadow-sm"
                    >
                      {t.fanchantWrapBtn}
                    </button>
                  )}
                </div>

                <textarea
                  id="edit-lyrics-textarea"
                  value={editLyricsContent}
                  onChange={(e) => setEditLyricsContent(e.target.value)}
                  rows={8}
                  className="w-full bg-white border border-navy/10 rounded-2xl p-4 font-sans text-xs text-charcoal outline-none focus:border-navy/35 leading-relaxed resize-none shadow-inner"
                  placeholder={editLyricsType === "plain" ? "가사를 적어주세요..." : "응원법을 [대괄호]로 지정해 가사를 적어주세요..."}
                />
              </div>

              {/* Formatting Guide Note */}
              <div className="p-3.5 bg-cream/70 border border-navy/5 rounded-2xl flex items-start gap-2.5">
                <Info size={14} className="text-point shrink-0 mt-0.5" />
                <div className="font-sans text-[10.5px] leading-normal text-charcoal/70 whitespace-pre-line">
                  <span className="font-bold text-navy block mb-0.5">{t.editorGuideTitle}</span>
                  {editLyricsType === "plain" ? t.editorGuidePlain : t.editorGuideFanchant}
                </div>
              </div>

              {/* Fanchant Live Preview */}
              {editLyricsType === "fanchant" && editLyricsContent.trim() && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-sans text-xs font-bold text-navy">{t.livePreviewTitle}</span>
                  <div className="w-full bg-[#FAF8F5] border border-navy/5 rounded-2xl p-4 max-h-36 overflow-y-auto font-sans text-[11px] text-charcoal/80 whitespace-pre-wrap leading-relaxed shadow-inner">
                    {renderFanchantLyrics(editLyricsContent)}
                  </div>
                </div>
              )}

              {/* Pledge Section */}
              <div className="p-4 bg-red-950/5 border border-red-900/10 rounded-2xl flex flex-col gap-2">
                <span className="font-sans text-xs font-bold text-red-900 flex items-center gap-1">
                  <Check size={14} className="text-red-600 animate-pulse" />
                  {t.pledgeTitle}
                </span>
                <p className="font-sans text-[10.5px] leading-relaxed text-red-950/70 break-keep">
                  {t.pledgeText}
                </p>
                <label className="flex items-center gap-2 mt-1 cursor-pointer select-none font-sans text-xs font-bold text-red-900">
                  <input
                    type="checkbox"
                    checked={isPledgeChecked}
                    onChange={(e) => setIsPledgeChecked(e.target.checked)}
                    className="accent-point"
                  />
                  <span>{t.pledgeCheckbox}</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2.5 mt-2">
                <button
                  onClick={() => setEditModalTrack(null)}
                  className="flex-1 py-3 bg-white hover:bg-navy/5 border border-navy/15 text-navy rounded-2xl font-sans font-bold text-xs transition-all active:scale-[0.98]"
                >
                  {t.cancelBtn}
                </button>
                <button
                  onClick={handleLyricsSubmit}
                  disabled={!isPledgeChecked || isSubmittingLyrics || !editLyricsContent.trim()}
                  className="flex-[1.5] py-3 bg-navy hover:bg-navy/90 text-cream rounded-2xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-navy/10"
                >
                  {isSubmittingLyrics ? t.submitting : t.submitBtn}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. DIRECT TRACK REGISTRATION MODAL */}
      <AnimatePresence>
        {isAddTrackOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#F5F2ED] border border-navy/20 rounded-[2.5rem] p-6 max-w-md w-full shadow-xl text-left"
            >
              {/* Header */}
              <div>
                <h2 className="font-serif text-2xl text-navy font-bold leading-snug">
                  {t.addTrackTitle}
                </h2>
                <p className="font-sans text-xs text-charcoal/60 mt-1 leading-relaxed break-keep">
                  {t.addTrackSub}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleAddTrackSubmit} className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy">{t.formTrackTitle} *</label>
                  <input
                    type="text"
                    required
                    placeholder={t.formPlaceholderTitle}
                    value={addForm.title}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-white border border-navy/10 rounded-2xl px-4 py-3 font-sans text-xs text-charcoal outline-none focus:border-navy/35 shadow-inner"
                  />
                </div>

                <div className="flex flex-col gap-1.5 relative">
                  <label className="font-sans text-xs font-bold text-navy">{t.formArtist} *</label>
                  {!selectedArtist ? (
                    <>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          placeholder={locale === "ko" ? "아티스트 이름을 검색해 주세요 (예: IU, 아이유)..." : "Search artist name (e.g. IU)..."}
                          value={artistSearchQuery}
                          onChange={(e) => setArtistSearchQuery(e.target.value)}
                          className="w-full bg-white border border-navy/10 rounded-2xl px-4 py-3 font-sans text-xs text-charcoal outline-none focus:border-navy/35 shadow-inner"
                        />
                        {isSearchingArtist && (
                          <div className="absolute right-3.5 top-3.5">
                            <Disc className="animate-spin text-point/70" size={16} />
                          </div>
                        )}
                      </div>

                      {artistSearchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-navy/10 rounded-2xl max-h-48 overflow-y-auto shadow-lg z-[60] py-1">
                          {artistSearchResults.map((artist) => (
                            <div
                              key={artist.id}
                              onClick={() => {
                                setSelectedArtist(artist);
                                setAddForm((prev) => ({
                                  ...prev,
                                  artistId: artist.id,
                                  artistName: artist.name,
                                }));
                                setArtistSearchQuery("");
                                setArtistSearchResults([]);
                              }}
                              className="flex items-center gap-2.5 px-4 py-2 hover:bg-navy/5 cursor-pointer font-sans text-xs text-charcoal transition-colors border-b border-navy/5 last:border-none"
                            >
                              <div className="relative w-6 h-6 rounded-full overflow-hidden border border-navy/10 shrink-0 bg-white">
                                <SafeImage
                                  src={artist.image}
                                  alt={artist.name}
                                  fill
                                  sizes="24px"
                                  fallbackType="artist"
                                  className="object-cover"
                                />
                              </div>
                              <span className="font-bold text-navy">{artist.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between p-3.5 bg-navy/5 border border-navy/10 rounded-2xl">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-navy/10 shrink-0 bg-white">
                          <SafeImage
                            src={selectedArtist.image}
                            alt={selectedArtist.name}
                            fill
                            sizes="32px"
                            fallbackType="artist"
                            className="object-cover"
                          />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <span className="font-sans font-bold text-xs text-navy truncate">{selectedArtist.name}</span>
                          <span className="font-sans text-[9px] text-charcoal/50">Spotify Artist</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArtist(null);
                          setAddForm((prev) => ({ ...prev, artistId: "", artistName: "" }));
                          setArtistSearchQuery("");
                          setArtistSearchResults([]);
                        }}
                        className="p-1 hover:bg-red-50 text-charcoal/55 hover:text-red-550 rounded-full transition-all shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Hidden input to enforce validation */}
                  <input
                    type="hidden"
                    required
                    value={addForm.artistId}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy">{t.formVideoUrl}</label>
                  <input
                    type="url"
                    placeholder={t.formPlaceholderVideoUrl}
                    value={addForm.videoUrl}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, videoUrl: e.target.value }))}
                    className="w-full bg-white border border-navy/10 rounded-2xl px-4 py-3 font-sans text-xs text-charcoal outline-none focus:border-navy/35 shadow-inner"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-xs font-bold text-navy">{t.formReleaseDate}</label>
                  <input
                    type="date"
                    value={addForm.releaseDate}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, releaseDate: e.target.value }))}
                    className="w-full bg-white border border-navy/10 rounded-2xl px-4 py-3 font-sans text-xs text-charcoal outline-none focus:border-navy/35 shadow-sm"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddTrackOpen(false);
                      setArtistSearchQuery("");
                      setArtistSearchResults([]);
                      setSelectedArtist(null);
                    }}
                    className="flex-1 py-3 bg-white hover:bg-navy/5 border border-navy/15 text-navy rounded-2xl font-sans font-bold text-xs transition-all active:scale-[0.98]"
                  >
                    {t.cancelBtn}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTrack || !addForm.title.trim() || !addForm.artistId}
                    className="flex-[1.5] py-3 bg-navy hover:bg-navy/90 text-cream rounded-2xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-navy/10"
                  >
                    {isSubmittingTrack ? t.submittingTrack : t.submitTrackBtn}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. OFFICIAL RELEASE REPORT CONFIRMATION MODAL */}
      <AnimatePresence>
        {reportConfirmTrack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#F5F2ED] border border-navy/20 rounded-[2.5rem] p-6 max-w-sm w-full shadow-xl text-left"
            >
              {/* Header */}
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[10px] font-bold text-point uppercase tracking-wider bg-point/10 px-2 py-0.5 rounded-full w-fit">
                  {t.reportConfirmTitle}
                </span>
                <h2 className="font-serif text-xl text-navy font-bold mt-2 leading-snug break-words">
                  {t.reportConfirmHeading.replace("{title}", reportConfirmTrack.title)}
                </h2>
                <p className="font-sans text-xs text-charcoal/60 mt-1 leading-relaxed break-keep">
                  {t.reportConfirmDesc}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setReportConfirmTrack(null)}
                  className="flex-1 py-3 bg-white hover:bg-navy/5 border border-navy/15 text-navy rounded-2xl font-sans font-bold text-xs transition-all active:scale-[0.98]"
                >
                  {t.reportConfirmCancel}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const trackId = reportConfirmTrack.id;
                    setReportConfirmTrack(null);
                    await handleReportRelease(trackId);
                  }}
                  className="flex-[1.5] py-3 bg-navy hover:bg-navy/90 text-cream rounded-2xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1 active:scale-[0.98] shadow-md shadow-navy/10"
                >
                  {t.reportConfirmBtn}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOGIN TRIGGER MODAL */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        locale={locale}
        onSuccess={() => {
          setIsLoginModalOpen(false);
          showToast(locale === "ko" ? "로그인에 성공했습니다!" : "Logged in successfully!", "success");
          if (activeTab === "unreleased") {
            loadUnreleasedTracks();
          }
        }}
      />
    </main>
  );
}
