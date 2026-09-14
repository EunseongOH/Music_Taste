"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share2, Music, Archive, Check, X, FileSpreadsheet, Loader2 } from "lucide-react";
import Image from "next/image";
import * as platform from "@/utils/platform";
import SnakePathTimeline, { getRowSizes } from "@/components/SnakePathTimeline";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/AuthProvider";
import LoginModal from "@/components/LoginModal";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { saveCompletedResult, fetchCompletedResultByArtist, overwriteCompletedResult } from "@/utils/worldcupDb";
import { EmotionalListTemplate, VintageVinylTemplate } from "@/components/TasteTemplates";
import { trackEvent } from "@/utils/gtag";
import { NICKNAME_ERROR_TEXT, saveNickname } from "@/utils/nickname";

const translations = {
  ko: {
    title: "취향 기록표",
    templatePyramid: "피라미드형",
    templateList: "리스트형",
    templateRetro: "레코드형",
    skipBtn: "스킵",
    confirmDownloadAll: "전체 랭킹({count}곡)을 인스타그램 스토리용 이미지 {pages}장으로 나누어 다운로드할까요?\n\n(취소를 누르면 TOP {pageSize}이 있는 1페이지만 다운로드돼요.)",
    saveImageError: "이미지를 저장하지 못했어요. 다시 시도해 주세요.",
    unsavedExitConfirm: "아직 취향표를 저장하지 않았어요. 저장하지 않고 홈으로 돌아갈까요?",
    saveBtn: "저장하기",
    savedBtn: "저장됨",
    saveSheetTitle: "저장하기",
    saveToSpaceOption: "내 취향 스페이스에 저장",
    saveImageOption: "9:16 이미지 저장",
    saveExcelOption: "Excel 저장",
    autoSavedToast: "취향표가 자동 저장되었어요",
    savedLabel: "저장됨",
    exitSaveTitle: "Sort 기록을 보관할 수 있어요",
    exitSaveDesc: "로그인하면 취향표를 저장하고 다시 확인할 수 있어요.",
    exitSaveLoginBtn: "로그인하고 저장하기",
    exitSaveLeaveBtn: "저장하지 않고 나가기",
    overwriteTitle: "이전 Sort 기록이 있어요",
    overwriteDesc: "이 아티스트의 기존 취향표를 덮어쓰거나 새로운 저장명으로 기록할 수 있어요.",
    overwriteBtn: "기존 기록 덮어쓰기",
    saveNewBtn: "새로운 기록으로 저장",
    cancel: "취소",
    shareMainBtn: "공유하기",
    shareMenuTitle: "결과 공유하기",
    shareXOption: "X (트위터)로 공유",
    shareKakaoOption: "카카오톡으로 공유",
    shareInstagramOption: "인스타그램 스토리에 공유",
    instagramGuideTitle: "인스타그램 스토리 공유 가이드",
    instagramGuideDesc: "취향표 이미지가 다운로드되었어요!\n인스타그램 스토리에서 내려받은 이미지를 선택해 공유해 보세요.",
    openInstagramBtn: "인스타그램 열기",
    shareNativeOption: "다른 앱으로 공유하기",
    copyLinkOption: "취향표 링크 복사하기",
    linkCopiedToast: "취향표가 복사되었어요",
    linkCopyError: "링크를 복사하지 못했어요. 다시 시도해 주세요.",
    shareFailed: "공유하지 못했어요. 다시 시도해 주세요.",
    copyFallbackToast: "공유 창에서 '복사'를 눌러 주세요",
    shareNameLabel: "공유할 때 보일 이름",
    shareNameHint: "처음 한 번만 확인해요. 프로필 닉네임도 이 이름으로 바뀌어요.",
  },
  en: {
    title: "My Taste Card",
    templatePyramid: "Pyramid",
    templateList: "List",
    templateRetro: "Vinyl",
    skipBtn: "Skip",
    confirmDownloadAll: "Do you want to download the entire ranking of {count} tracks across {pages} images for Instagram Stories?\n\n(If canceled, only the first page with TOP {pageSize} will be downloaded.)",
    saveImageError: "Failed to save image. Please try again.",
    unsavedExitConfirm: "Your taste card hasn't been saved yet. Go back to Home without saving?",
    saveBtn: "Save",
    savedBtn: "Saved",
    saveSheetTitle: "Save",
    saveToSpaceOption: "Save to My Taste Space",
    saveImageOption: "Save 9:16 Image",
    saveExcelOption: "Save Excel",
    autoSavedToast: "Saved to My Taste Space",
    savedLabel: "Saved",
    exitSaveTitle: "Save Your Sort Record",
    exitSaveDesc: "Log in to save your taste card and access it anytime.",
    exitSaveLoginBtn: "Log in and Save",
    exitSaveLeaveBtn: "Leave without Saving",
    overwriteTitle: "Previous Record Found",
    overwriteDesc: "You have a saved record for this artist. Update existing or save with a new name?",
    overwriteBtn: "Update Existing",
    saveNewBtn: "Save as New Record",
    cancel: "Cancel",
    shareMainBtn: "Share Results",
    shareMenuTitle: "Share Results",
    shareXOption: "Share on X (Twitter)",
    shareKakaoOption: "Share on KakaoTalk",
    shareInstagramOption: "Share on Instagram Story",
    instagramGuideTitle: "Instagram Story Share Guide",
    instagramGuideDesc: "The card image has been downloaded! Select it from your gallery on Instagram Story to share.",
    openInstagramBtn: "Open Instagram",
    shareNativeOption: "Share to another app",
    copyLinkOption: "Copy Link",
    linkCopiedToast: "Taste card copied to clipboard",
    linkCopyError: "Couldn't copy the link. Please try again.",
    shareFailed: "Couldn't share. Please try again.",
    copyFallbackToast: "Tap 'Copy' in the share sheet",
    shareNameLabel: "Name shown when sharing",
    shareNameHint: "Asked only once. Your profile nickname will change too.",
  }
};

interface Track {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
}

/**
 * 공유에 쓰는 TOP 10 텍스트.
 *
 * X 공유·링크 복사·공유 시트가 모두 이 함수를 쓴다. 같은 문구를 여러 곳에서
 * 따로 만들면 한쪽만 고쳐져 서서히 갈라진다.
 *
 * ⚠️ 여기에 sortify.kr 주소를 넣지 말 것. 앱인토스는 "공유하기 링크가 자사
 * 웹사이트로 랜딩되는 경우"를 제한한다 — 링크는 어댑터(`platform.shareUrl`)가
 * 플랫폼에 맞게 따로 만든다.
 */
function buildShareText(winners: Track[], nickname?: string | null): string {
  // 결과 화면의 isSingleArtistMode 는 선택 아티스트 유무로만 정해져 믹스 모드도
  // true 가 되므로 쓰지 않는다. 실제 곡의 아티스트 수로 판단한다.
  const mixed = new Set(winners.map((tr) => tr.artistName)).size > 1;
  const topTracks = winners
    .slice(0, 10)
    .map((tr, i) => `${i + 1}. ${tr.title}${mixed ? ` - ${tr.artistName}` : ""}`)
    .join("\n");
  const subject = mixed ? "믹스 매치" : winners[0]?.artistName || "";
  const owner = nickname ? `${nickname}님의 ` : "";
  return `${owner}${subject} 취향표 TOP 10\n\n${topTracks}`;
}

/**
 * 링크 바로 위에 붙는 참여 유도 문구. 주소는 넣지 않는다(위 경고와 같은 이유).
 * 공유 본문은 항상 `본문 \n\n 유도 문구 \n 링크` 순서다.
 */
const SHARE_CTA = "내 진짜 최애곡을 알고 싶다면? Sortify에서 직접 뽑아보기 👇";

export default function ResultPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [winners, setWinners] = useState<Track[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [isSavingArchive, setIsSavingArchive] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);
  /**
   * 진행 중인 자동 저장. 공유 직전에 이걸 기다린다.
   *
   * 공유 버튼은 애니메이션이 끝나면 바로 활성화되는데(showButton), 그 시점에
   * 자동 저장은 아직 끝나지 않았을 수 있다. 그러면 savedId 가 null 이라
   * 남에게 의미 없는 링크가 나간다 — 웹은 `/taste`, 토스는 미니앱 홈.
   * 상태가 아니라 ref 라서 리렌더를 유발하지 않는다.
   */
  const autoSaveRef = useRef<Promise<void> | null>(null);
  const [cameraRig, setCameraRig] = useState<{ xKeyframes: string[], yKeyframes: string[], scaleKeyframes: number[], times: number[] } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [rawKeyframes, setRawKeyframes] = useState<{ x: number, y: number }[]>([]);
  const [timelineViewBoxHeight, setTimelineViewBoxHeight] = useState(600);
  const [template, setTemplate] = useState<"pyramid" | "list" | "retro">("pyramid");
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [existingResult, setExistingResult] = useState<any | null>(null);
  const [testDate, setTestDate] = useState<string>("");
  const [archiveTitle, setArchiveTitle] = useState("");
  const [customSaveTitle, setCustomSaveTitle] = useState("");
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  
  // Modals & Bottom Sheet States
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [showExitSaveModal, setShowExitSaveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  // 첫 공유 때 확인하는 이름. 모달이 열릴 때 현재 닉네임으로 채운다.
  const [shareName, setShareName] = useState("");
  const [shareNameError, setShareNameError] = useState("");
  const needsNameConfirm = !!user && user.user_metadata?.nickname_confirmed !== true;
  const [showInstagramGuideModal, setShowInstagramGuideModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const t = locale === "en" ? translations.en : translations.ko;

  const showToastMessage = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getFormattedDateTag = () => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  const getAutoTitle = (isSingle: boolean, artistName: string | null, winnersList: Track[], forceDateTag: boolean = false) => {
    const dateTag = getFormattedDateTag();
    if (isSingle && artistName) {
      return forceDateTag ? `${artistName} sort_${dateTag}` : `${artistName} sort`;
    }
    
    let storedArtists: any[] = [];
    try {
      const raw = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
      if (raw) storedArtists = JSON.parse(raw);
    } catch (e) {}

    if (storedArtists && storedArtists.length > 1) {
      return `${storedArtists[0].name} 외 ${storedArtists.length - 1}명 sort_${dateTag}`;
    } else if (winnersList.length > 0 && winnersList[0]?.artistName) {
      return `${winnersList[0].artistName} 취향 믹스_${dateTag}`;
    }
    return `음악 취향표_${dateTag}`;
  };

  useEffect(() => {
    const l = getSafeLocale();
    setLocale(l);

    const now = new Date();
    const formattedDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    setTestDate(formattedDate);

    try {
      const storedRanking = sessionStorage.getItem("worldcup_ranking") || localStorage.getItem("worldcup_ranking");
      if (storedRanking) {
        const parsed = JSON.parse(storedRanking);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWinners(parsed);
        }
      }

      const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        if (parsed && parsed.length > 0) {
          setIsSingleArtistMode(true);
        }
      }
    } catch (e) {
      console.error("Failed to load ranking data:", e);
    }
  }, []);

  // Auto-Save Effect: Triggered for logged-in users completing 16+ tracks
  useEffect(() => {
    if (user && winners.length >= 16 && !isSaved && !isAutoSaving) {
      setIsAutoSaving(true);
      autoSaveRef.current = (async () => {
        try {
          let artistId: string | null = null;
          let artistName: string | null = null;
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
              setIsAutoSaving(false);
              return;
            }
          }

          await executeSaveArchive(false, true);
        } catch (e) {
          console.error("Auto save failed:", e);
        } finally {
          setIsAutoSaving(false);
        }
      })();
    }
  }, [user, winners.length, isSaved, isSingleArtistMode]);

  const handleDownloadExcel = async () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      csvContent += "Rank,Title,Artist,Album\n";
      winners.forEach((track, index) => {
        const row = [
          index + 1,
          `"${(track.title || "").replace(/"/g, '""')}"`,
          `"${(track.artistName || "").replace(/"/g, '""')}"`,
          `"${(track.albumImage || "").replace(/"/g, '""')}"`
        ].join(",");
        csvContent += row + "\n";
      });

      await platform.saveCsv(csvContent, `${winners[0]?.artistName || "Artist"}_Music_Ranking.csv`);
      setShowSaveSheet(false);
      trackEvent("funnel_excel_download", {});
    } catch (err) {
      console.error("Failed to export Excel/CSV", err);
      showToastMessage(t.saveImageError, "error");
    }
  };

  /**
   * 공유에 쓸 링크를 만든다. 모든 공유 경로가 이 하나를 지난다.
   *
   * 자동 저장이 진행 중이면 끝날 때까지 기다린다 — 그래야 savedId 가 생겨
   * "그 사람의 취향표"로 가는 링크가 나간다. 덮어쓰기 모달로 빠진 경우에는
   * 저장 없이 resolve 되므로 무한 대기는 생기지 않는다.
   */
  const resolveShareUrl = async () => {
    try {
      await autoSaveRef.current;
    } catch {
      // 저장 실패는 자동 저장 쪽에서 이미 로그를 남긴다. 공유는 계속 진행한다.
    }
    // 공유 링크의 미리보기 이미지로 1위 곡 앨범아트를 쓴다(토스 전용).
    // 웹은 taste/[id]/layout.tsx 의 generateMetadata 가 같은 일을 한다.
    const cover = winners[0]?.albumImage;
    const ogImageUrl = cover?.startsWith("https://") ? cover : undefined;
    return platform.shareUrl(savedId, ogImageUrl);
  };

  /**
   * 공유 헤더에 쓸 이름을 정한다. 공유 버튼마다 먼저 부른다.
   *
   * 로그인했지만 아직 이름을 확인하지 않은 사용자(자동 생성 닉네임)는 모달 위쪽
   * 입력칸의 값을 저장·확정한 뒤 쓴다. 입력칸은 자동 닉네임으로 미리 채워져
   * 있어서 그대로 누르면 추가 조작이 없다. 한 번 확정하면 다시 묻지 않는다.
   *
   * 반환: 이름 / null(게스트 — 이름 없이 공유) / false(저장 실패 — 공유 중단)
   */
  const ensureShareName = async (): Promise<string | null | false> => {
    if (!user) return null;
    const current = user.user_metadata?.nickname;
    if (!needsNameConfirm) {
      return typeof current === "string" && !current.includes("@") ? current : null;
    }
    const result = await saveNickname(shareName);
    if (result !== "ok") {
      setShareNameError(NICKNAME_ERROR_TEXT[locale][result]);
      return false;
    }
    trackEvent("nickname_confirmed_on_share", { changed: shareName.trim() !== current });
    return shareName.trim();
  };

  /** 공유 본문(유도 문구까지). 링크는 호출부가 붙이거나 어댑터가 붙인다. */
  const shareBody = (nickname: string | null) => `${buildShareText(winners, nickname)}\n\n${SHARE_CTA}`;

  const handleCopyLink = async () => {
    const nickname = await ensureShareName();
    if (nickname === false) return;
    // 웹에서는 실패하지 않는 경로지만, WebView 어댑터는 권한 거부나 구버전
    // 앱에서 실제로 실패할 수 있다. 잡지 않으면 버튼이 먹통처럼 보인다.
    try {
      const url = await resolveShareUrl();
      // 링크만이 아니라 TOP 10 까지 함께 복사한다.
      const result = await platform.copyText(`${shareBody(nickname)}\n${url}`);
      // 토스에서 클립보드 쓰기가 막히면 어댑터가 공유 시트(복사 가능)를 대신 연다.
      showToastMessage(result === "sheet" ? t.copyFallbackToast : t.linkCopiedToast);
      trackEvent("funnel_copy_link", { result });
    } catch (err) {
      console.error("Failed to copy link", err);
      // 어댑터가 사용자용 문구를 준 경우에는 그대로 보여준다.
      // 그래야 "권한을 켜 주세요" 처럼 할 수 있는 일이 전달된다.
      const msg = err instanceof platform.PlatformError ? err.message : t.linkCopyError;
      showToastMessage(msg, "error");
    }
  };

  const handleShareInstagram = async () => {
    setShowShareModal(false);
    await handleDownloadImage();
    setShowInstagramGuideModal(true);
    trackEvent("funnel_share_instagram", {});
  };

  const handleShareX = async () => {
    const nickname = await ensureShareName();
    if (nickname === false) return;
    const text = shareBody(nickname);
    const url = await resolveShareUrl();
    await platform.openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
    trackEvent("funnel_share_x", {});
  };

  /**
   * OS 공유 시트를 열어 TOP 10 과 링크를 함께 내보낸다. (토스 빌드 전용)
   *
   * 사용자가 카카오톡·인스타 등 설치된 앱을 직접 고르므로, 개별 SNS 버튼을
   * 두지 않아도 외부 공유가 열린다. 나가는 링크는 어댑터가 만든 토스 공유
   * 링크 하나뿐이라 "자사 웹사이트 랜딩" 제한에도 걸리지 않는다.
   */
  const handleShareNative = async () => {
    const nickname = await ensureShareName();
    if (nickname === false) return;
    try {
      const text = shareBody(nickname);
      const url = await resolveShareUrl();
      const shared = await platform.share({ title: t.title, text, url });
      // ponytail: 어댑터의 share() 가 boolean 이라 "사용자 취소"와 "실패"를
      // 구분하지 못한다. 그래서 폴백(자동 복사)을 돌리지 않는다 — 취소할 때마다
      // 클립보드 권한 팝업이 뜨는 편이 더 나쁘다. 실기기에서 취소 동작을 확인한
      // 뒤, 구분이 필요하면 share() 가 사유를 돌려주도록 넓힌다.
      if (!shared) showToastMessage(t.shareFailed, "error");
      trackEvent("funnel_share_native", {});
    } catch (err) {
      console.error("Failed to share", err);
      const msg = err instanceof platform.PlatformError ? err.message : t.shareFailed;
      showToastMessage(msg, "error");
    }
  };

  const handleShareKakao = async () => {
    const url = await resolveShareUrl();
    const shared = await platform.share({
      title: t.title,
      text: `${winners[0]?.artistName || ""} 취향표`,
      url: url,
    });
    if (!shared) {
      handleCopyLink();
    }
    trackEvent("funnel_share_kakao", {});
  };

  const handleDownloadImage = async () => {
    setIsExporting(true);
    try {
      if (template === "pyramid") {
        const el = document.getElementById("export-card-pyramid");
        if (!el) return;
        await platform.saveImage(el, `${winners[0]?.artistName || "Artist"}_Music_Taste_Pyramid.png`);
      } else {
        const pageSize = template === "list" ? 15 : 10;
        const totalPages = Math.ceil(winners.length / pageSize);

        let exportPages = [0];

        if (totalPages > 1) {
          const msg = t.confirmDownloadAll
            .replace("{count}", String(winners.length))
            .replace("{pages}", String(totalPages))
            .replace("{pageSize}", String(pageSize));
          const confirmAll = window.confirm(msg);
          if (confirmAll) {
            exportPages = Array.from({ length: totalPages }, (_, i) => i);
          }
        }

        for (let i = 0; i < exportPages.length; i++) {
          const pIdx = exportPages[i];
          const el = document.getElementById(`export-card-page-${pIdx}`);
          if (!el) continue;

          await new Promise((resolve) => setTimeout(resolve, i * 450));

          await platform.saveImage(
            el,
            `${winners[0]?.artistName || "Artist"}_Music_Taste_${template}_Part${pIdx + 1}.png`
          );
        }
      }
      setShowSaveSheet(false);
    } catch (err) {
      console.error('Failed to export image', err);
      showToastMessage(t.saveImageError, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const executeSaveArchive = async (overwrite: boolean, isAuto: boolean = false) => {
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
      } catch (e) { }

      let title = customSaveTitle.trim();
      if (!title) {
        if (archiveTitle.trim()) {
          title = archiveTitle.trim();
        } else if (overwrite && existingResult) {
          title = existingResult.title || getAutoTitle(isSingleArtistMode, artistName, winners, false);
        } else {
          const shouldAppendDate = existingResult !== null || isAuto;
          title = getAutoTitle(isSingleArtistMode, artistName, winners, shouldAppendDate);
        }
      }

      let saveRes;
      if (overwrite && existingResult) {
        saveRes = await overwriteCompletedResult(existingResult.id, winners, winners.slice(1), title, { isPublic });
      } else {
        saveRes = await saveCompletedResult(winners, winners.slice(1), title, {
          isPublic,
          isSingleArtist: isSingleArtistMode,
          artistId,
          artistName
        });
      }

      if (!saveRes || !saveRes.success) {
        throw new Error(saveRes && saveRes.error ? saveRes.error.message : "Database save failed");
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          archives: null,
          worldcup_progress: null,
          worldcup_tracks: null
        }
      });

      if (error) throw error;

      setIsSaved(true);
      if (saveRes && saveRes.id) {
        setSavedId(saveRes.id);
      }
      trackEvent("funnel_archive_save", { is_public: isPublic });

      if (isAuto) {
        showToastMessage(t.autoSavedToast);
      } else {
        showToastMessage(locale === "en" ? (overwrite ? "Updated record!" : "Saved to My Taste Space!") : (overwrite ? "기존 기록을 바꿨어요!" : "내 취향 스페이스에 저장했어요!"));
      }
      setShowOverwriteModal(false);
      setShowSaveSheet(false);
    } catch (err: any) {
      console.error("Failed to save to archive:", err);
      showToastMessage(locale === "en" ? `Failed to save: ${err.message || err}` : `저장하지 못했어요: ${err.message || err}`, "error");
    } finally {
      setIsSavingArchive(false);
    }
  };

  const handleSaveToSpace = async () => {
    setShowSaveSheet(false);
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    let artistId = null;
    try {
      const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        if (parsed && parsed.length > 0) {
          artistId = parsed[0].id;
        }
      }
    } catch (e) {}

    if (isSingleArtistMode && artistId) {
      const existing = await fetchCompletedResultByArtist(artistId);
      if (existing) {
        setExistingResult(existing);
        setShowOverwriteModal(true);
        return;
      }
    }

    await executeSaveArchive(false);
  };

  const executeExit = async () => {
    sessionStorage.removeItem("worldcup_ranking");
    sessionStorage.removeItem("worldcup_tracks");
    sessionStorage.removeItem("worldcup_progress");
    sessionStorage.removeItem("selected_genres");
    localStorage.removeItem("worldcup_tracks");
    localStorage.removeItem("worldcup_progress");
    localStorage.removeItem("selected_genres");
    sessionStorage.removeItem("selectedArtists");
    localStorage.removeItem("selectedArtists");

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

    // 하드 내비게이션(window.location.href) 대신 라우터로 이동한다.
    // 문서 전체를 다시 로드하지 않으므로 앱인토스 WebView 에서 번들 재로드를 피할 수 있다.
    router.push("/");
  };

  const handleExit = async () => {
    if (isSaved) {
      await executeExit();
      return;
    }

    if (user) {
      const confirmExit = window.confirm(t.unsavedExitConfirm);
      if (confirmExit) {
        await executeExit();
      }
    } else {
      setShowExitSaveModal(true);
    }
  };

  const S = 3.8;
  const panDuration = Math.max(12.0, winners.length * 1.2);
  const startDelay = 1.0;
  const holdDuration = 1.5;
  const zoomOutDuration = 1.2;
  const totalDuration = startDelay + panDuration + holdDuration + zoomOutDuration;

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

  const handleLayoutComplete = useCallback((keyframes: { x: number, y: number }[], viewBoxHeight: number) => {
    setRawKeyframes(keyframes);
    setTimelineViewBoxHeight(viewBoxHeight);
  }, []);

  useEffect(() => {
    const K = rawKeyframes.length;
    if (K === 0) return;

    const W = dimensions.width || (timelineWrapperRef.current ? timelineWrapperRef.current.clientWidth : 360) || 360;
    const H = dimensions.height || (timelineWrapperRef.current ? timelineWrapperRef.current.clientHeight : 500) || 500;

    const xKeyframes = rawKeyframes.map(k => `${S * W * (50 - k.x) / 100}px`);
    const yKeyframes = rawKeyframes.map(k => `${S * (H / 2 - k.y)}px`);

    let totalDist = 0;
    const dists = [0];
    for (let i = 1; i < K; i++) {
      const dx = rawKeyframes[i].x - rawKeyframes[i - 1].x;
      const dy_scaled = (rawKeyframes[i].y - rawKeyframes[i - 1].y) * (100 * 16 / 9) / timelineViewBoxHeight;
      totalDist += Math.sqrt(dx * dx + dy_scaled * dy_scaled);
      dists.push(totalDist);
    }
    if (totalDist === 0) totalDist = 1;

    const startFraction = startDelay / totalDuration;
    const panFraction = panDuration / totalDuration;
    const holdFraction = holdDuration / totalDuration;

    const holdStartFraction = startFraction + panFraction;
    const holdEndFraction = holdStartFraction + holdFraction;

    const times = [
      0.0,
      ...dists.map(d => startFraction + (d / totalDist) * panFraction),
      holdEndFraction,
      1.0
    ];

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
      {/* Top Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="font-serif text-2xl text-navy tracking-tight">{t.title}</h1>
        </div>
        <button
          onClick={handleExit}
          className="w-10 h-10 rounded-full border-2 border-navy flex items-center justify-center bg-white hover:bg-navy/5 transition-colors cursor-pointer"
          title="종료하기"
        >
          <X size={18} className="text-navy font-bold" />
        </button>
      </div>

      {/* Main Results Canvas */}
      <motion.div
        layout
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        ref={containerRef}
        className={showButton
          ? "flex-1 w-full max-w-2xl relative bg-[#F5F2ED] flex flex-col min-h-screen py-4 px-2 sm:px-6 mx-auto pb-32 overflow-y-auto scrollbar-none"
          : "fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 bg-[#F5F2ED] overflow-hidden flex flex-col"
        }
      >
        <div className="absolute inset-0 z-0 bg-[#F5F2ED]" />

        {/* Segmented Design Customization Selector */}
        {showButton && (
          <div className="relative z-30 w-full max-w-md mx-auto px-4 mt-2 mb-4 select-none">
            <div className="flex bg-[#1A2A6C]/5 p-1.5 rounded-2xl border border-[#1A2A6C]/10 backdrop-blur-sm gap-0.5">
              <button
                onClick={() => { setTemplate("pyramid"); trackEvent("change_template", { template_type: "pyramid" }); }}
                className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${template === "pyramid"
                  ? "bg-white text-navy shadow-sm"
                  : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                  }`}
              >
                {t.templatePyramid}
              </button>
              <button
                onClick={() => { setTemplate("list"); trackEvent("change_template", { template_type: "list" }); }}
                className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${template === "list"
                  ? "bg-white text-navy shadow-sm"
                  : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                  }`}
              >
                {t.templateList}
              </button>
              <button
                onClick={() => { setTemplate("retro"); trackEvent("change_template", { template_type: "retro" }); }}
                className={`flex-1 py-2.5 rounded-xl font-sans font-bold text-xs transition-all duration-200 cursor-pointer ${template === "retro"
                  ? "bg-white text-navy shadow-sm"
                  : "text-navy/60 hover:text-navy/90 hover:bg-navy/5"
                  }`}
              >
                {t.templateRetro}
              </button>
            </div>
          </div>
        )}

        {/* Floating Skip Button */}
        {!showButton && (
          <button
            onClick={() => setShowButton(true)}
            className="absolute top-4 right-4 z-50 px-3.5 py-1.5 bg-white/90 hover:bg-white text-navy hover:text-point font-bold text-xs rounded-full border border-navy/15 hover:border-point/40 shadow-md backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          >
            {t.skipBtn}
          </button>
        )}

        <motion.div
          layout
          ref={timelineWrapperRef}
          className={`relative z-10 w-full mt-4 ${showButton ? "h-auto overflow-visible pb-20" : "flex-1 overflow-hidden"
            }`}
        >
          {winners.length > 0 && (
            <>
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

              {showButton && template === "list" && (
                <div className="w-full max-w-md mx-auto">
                  <EmotionalListTemplate tracks={winners} testDate={testDate} />
                </div>
              )}

              {showButton && template === "retro" && (
                <div className="w-full max-w-md mx-auto">
                  <VintageVinylTemplate tracks={winners} />
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Streamlined Bottom Floating Actions (2 Buttons: Save & Share) */}
      <AnimatePresence>
        {showButton && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 flex justify-center items-center z-50 pointer-events-none"
          >
            <div className="w-full max-w-[380px] flex gap-3 pointer-events-auto">
              <button
                onClick={() => setShowSaveSheet(true)}
                className="flex-1 h-[48px] bg-white border-2 border-navy text-navy hover:bg-navy/5 rounded-2xl font-sans font-bold text-sm transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Archive size={18} />
                <span>{t.saveBtn}</span>
              </button>

              <button
                onClick={() => {
                  setShareName(user?.user_metadata?.nickname ?? "");
                  setShareNameError("");
                  setShowShareModal(true);
                }}
                className="flex-1 h-[48px] bg-navy text-cream font-sans font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-md hover:bg-[#111A3E]"
              >
                <Share2 size={18} />
                <span>{t.shareMainBtn}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet: Save Options */}
      <AnimatePresence>
        {showSaveSheet && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveSheet(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-cream rounded-t-[2.5rem] border-t-[3px] border-x-[3px] border-navy p-6 sm:p-8 z-[1000] max-w-lg mx-auto shadow-2xl flex flex-col items-center"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            >
              <div className="w-12 h-1.5 bg-navy/20 rounded-full mb-6" />

              <h2 className="font-serif text-xl font-bold text-navy mb-5 tracking-tight text-center">
                {t.saveSheetTitle}
              </h2>

              <div className="flex flex-col gap-3 w-full mb-4">
                {/* 1. Save to Space */}
                <button
                  onClick={handleSaveToSpace}
                  disabled={isSavingArchive}
                  className="w-full h-[52px] px-5 bg-white border border-navy/20 hover:bg-navy/5 text-navy font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <div className="flex items-center gap-3">
                    <Archive size={20} className="text-point" />
                    <span>{t.saveToSpaceOption}</span>
                  </div>
                  {isSavingArchive ? (
                    <Loader2 size={18} className="text-navy/60 animate-spin" />
                  ) : (
                    isSaved && <Check size={18} className="text-emerald-600" />
                  )}
                </button>

                {/* 2. Download 9:16 Image */}
                <button
                  onClick={handleDownloadImage}
                  disabled={isExporting}
                  className="w-full h-[52px] px-5 bg-white border border-navy/20 hover:bg-navy/5 text-navy font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-3 shadow-sm"
                >
                  <Download size={20} className="text-navy" />
                  <span>{t.saveImageOption}</span>
                </button>

                {/* 3. Excel Download */}
                <button
                  onClick={handleDownloadExcel}
                  className="w-full h-[52px] px-5 bg-white border border-navy/20 hover:bg-navy/5 text-navy font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-3 shadow-sm"
                >
                  <FileSpreadsheet size={20} className="text-[#0F766E]" />
                  <span>{t.saveExcelOption}</span>
                </button>
              </div>

              <button
                onClick={() => setShowSaveSheet(false)}
                className="w-full h-[44px] bg-navy/5 text-navy font-bold text-sm rounded-xl hover:bg-navy/10 transition-all cursor-pointer"
              >
                {t.cancel}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Exit Prompt Modal for Unauthenticated Users */}
      <AnimatePresence>
        {showExitSaveModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExitSaveModal(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-4 mt-2 bg-point/10 shadow-sm">
                  <Archive className="text-point" size={24} />
                </div>

                <h2 className="font-serif text-xl font-bold text-navy mb-2 tracking-tight">
                  {t.exitSaveTitle}
                </h2>
                <p className="font-sans text-charcoal/80 text-xs leading-relaxed mb-6 whitespace-pre-wrap px-1">
                  {t.exitSaveDesc}
                </p>

                <div className="flex flex-col gap-2.5 w-full">
                  <button
                    onClick={() => {
                      setShowExitSaveModal(false);
                      setShowLoginModal(true);
                    }}
                    className="w-full h-[48px] bg-navy text-cream font-bold text-sm rounded-2xl hover:bg-navy/90 transition-all active:scale-[0.98] cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <span>{t.exitSaveLoginBtn}</span>
                  </button>

                  <button
                    onClick={async () => {
                      setShowExitSaveModal(false);
                      await executeExit();
                    }}
                    className="w-full h-[44px] bg-white border border-navy/20 text-navy font-bold text-xs rounded-xl hover:bg-navy/5 transition-all cursor-pointer"
                  >
                    {t.exitSaveLeaveBtn}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Overwrite Choice Modal */}
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
                className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <h2 className="font-serif text-xl font-bold text-navy mb-2 tracking-tight">
                  {t.overwriteTitle}
                </h2>
                <p className="font-sans text-charcoal/80 text-xs leading-relaxed mb-4 whitespace-pre-wrap px-1">
                  {t.overwriteDesc}
                </p>

                {/* Custom Title Input for New Save */}
                <div className="w-full flex flex-col gap-1 text-left mb-5">
                  <label htmlFor="custom-save-title-input" className="font-sans font-bold text-xs text-navy">
                    저장명 입력
                  </label>
                  <input
                    id="custom-save-title-input"
                    type="text"
                    maxLength={20}
                    value={customSaveTitle}
                    onChange={(e) => setCustomSaveTitle(e.target.value)}
                    placeholder={existingResult?.artist_name ? `${existingResult.artist_name} sort_${getFormattedDateTag()}` : "저장할 제목 입력"}
                    className="w-full px-3.5 py-2.5 bg-white border border-navy/20 focus:border-point focus:ring-1 focus:ring-point rounded-xl font-sans text-xs text-navy placeholder-charcoal/40 transition-all focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-2.5 w-full">
                  <button
                    onClick={() => executeSaveArchive(true)}
                    className="w-full h-[48px] bg-navy text-cream font-bold text-sm rounded-2xl hover:bg-navy/90 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
                  >
                    {t.overwriteBtn}
                  </button>
                  <button
                    onClick={() => executeSaveArchive(false)}
                    className="w-full h-[44px] bg-white border-2 border-navy/20 text-navy font-bold text-xs rounded-xl hover:bg-navy/5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {t.saveNewBtn}
                  </button>
                  <button
                    onClick={() => setShowOverwriteModal(false)}
                    className="w-full h-[44px] bg-white border border-red-200 text-red-500 font-medium text-xs rounded-xl hover:bg-red-50/50 transition-all cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Sheet: Share Options */}
      <AnimatePresence>
        {showShareModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareModal(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-cream rounded-t-[2.5rem] border-t-[3px] border-x-[3px] border-navy p-6 sm:p-8 z-[1000] max-w-lg mx-auto shadow-2xl flex flex-col items-center"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            >
              <div className="w-12 h-1.5 bg-navy/20 rounded-full mb-6" />

              <h2 className="font-serif text-xl font-bold text-navy mb-5 tracking-tight text-center">
                {t.shareMenuTitle}
              </h2>

              {needsNameConfirm && (
                <div className="w-full mb-4">
                  <label htmlFor="share-name" className="block font-sans text-xs font-bold text-navy/70 mb-1.5">
                    {t.shareNameLabel}
                  </label>
                  <input
                    id="share-name"
                    value={shareName}
                    onChange={(e) => {
                      setShareName(e.target.value);
                      setShareNameError("");
                    }}
                    maxLength={12}
                    autoComplete="off"
                    className="w-full h-[48px] px-4 bg-white border border-navy/20 rounded-xl text-navy font-sans font-bold text-sm focus:outline-none focus:border-navy"
                  />
                  <p className={`mt-1.5 font-sans text-xs ${shareNameError ? "text-red-500" : "text-navy/50"}`}>
                    {shareNameError || t.shareNameHint}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 w-full mb-4">
                {/* 1. X (Twitter) */}
                {platform.shareTargets.includes("x") && (
                <button
                  onClick={handleShareX}
                  className="w-full h-[52px] px-5 bg-[#0F1419] hover:bg-[#20262E] active:bg-[#2C353D] text-white font-sans font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>{t.shareXOption}</span>
                </button>
                )}

                {/* 2. KakaoTalk */}
                {platform.shareTargets.includes("kakao") && (
                <button
                  onClick={handleShareKakao}
                  className="w-full h-[52px] px-5 bg-[#FEE500] hover:bg-[#F5DC00] active:bg-[#EDD100] text-black font-sans font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="#000000">
                    <path d="M12 3C6.477 3 2 6.701 2 11.25c0 2.905 1.738 5.454 4.362 7.013-.192.692-.697 2.513-.798 2.904-.125.488.179.482.377.351.155-.104 2.462-1.675 3.46-2.358.512.074 1.04.112 1.599.112 5.523 0 10-3.701 10-8.25C22 6.701 17.523 3 12 3z" />
                  </svg>
                  <span className="opacity-90">{t.shareKakaoOption}</span>
                </button>
                )}

                {/* 3. Instagram Story */}
                {platform.shareTargets.includes("instagram") && (
                <button
                  onClick={handleShareInstagram}
                  className="w-full h-[52px] px-5 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] hover:opacity-95 text-white font-sans font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <span>{t.shareInstagramOption}</span>
                </button>
                )}

                {/* 4. 다른 앱으로 공유 (OS 공유 시트) — 토스 빌드에서만 렌더된다.
                     웹은 위의 X·카카오·인스타 버튼이 같은 일을 나눠 맡는다. */}
                {platform.shareTargets.includes("native") && (
                <button
                  onClick={handleShareNative}
                  className="w-full h-[52px] px-5 bg-navy hover:bg-navy/90 active:bg-navy/80 text-cream font-sans font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <Share2 size={18} />
                  <span>{t.shareNativeOption}</span>
                </button>
                )}

                {/* 5. Copy Link */}
                <button
                  onClick={handleCopyLink}
                  className="w-full h-[52px] px-5 bg-white border border-navy/20 text-navy font-bold text-sm rounded-xl hover:bg-navy/5 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <span>{t.copyLinkOption}</span>
                </button>
              </div>

              <button
                onClick={() => setShowShareModal(false)}
                className="w-full h-[44px] bg-navy/5 text-navy font-bold text-sm rounded-xl hover:bg-navy/10 transition-all cursor-pointer"
              >
                {t.cancel}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Instagram Story Share Guide Modal */}
      <AnimatePresence>
        {showInstagramGuideModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-navy/50 backdrop-blur-sm z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstagramGuideModal(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 pointer-events-none">
              <motion.div
                className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-7 shadow-2xl relative pointer-events-auto flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.93, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 24 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <button
                  onClick={() => setShowInstagramGuideModal(false)}
                  className="absolute top-5 right-5 text-navy/40 hover:text-navy/70 active:scale-95 transition-all cursor-pointer"
                  aria-label="닫기"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>

                <h2 className="font-serif text-xl font-bold text-navy mb-2 tracking-tight">{t.instagramGuideTitle}</h2>
                <p className="font-sans text-xs text-charcoal/80 leading-relaxed mb-6 whitespace-pre-wrap px-1">
                  {t.instagramGuideDesc}
                </p>

                <div className="flex flex-col gap-2.5 w-full">
                  <motion.button
                    type="button"
                    onClick={() => {
                      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                      if (isMobile) {
                        const deepLink = "instagram://camera";
                        const webFallback = "https://www.instagram.com";
                        const start = Date.now();
                        window.location.href = deepLink;
                        setTimeout(() => {
                          if (Date.now() - start < 1500) {
                            window.open(webFallback, "_blank", "noopener,noreferrer");
                          }
                        }, 800);
                      } else {
                        window.open("https://www.instagram.com", "_blank", "noopener,noreferrer");
                      }
                      setShowInstagramGuideModal(false);
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full h-[48px] rounded-2xl bg-gradient-to-r from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white font-sans font-bold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {t.openInstagramBtn}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Login Modal Integration */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

      {/* Offscreen High-Fidelity 9:16 Instagram Story Export Cards */}
      {winners.length > 0 && (
        <div
          className="absolute top-[-9999px] left-[-9999px] pointer-events-none select-none"
          style={{ width: "450px" }}
        >
          {/* 1. Pyramid Export Card */}
          {(() => {
            const sizes = getRowSizes(winners.length);
            const maxS = sizes[sizes.length - 1] || 5;
            const expansionFactor = Math.max(1, maxS / 4);
            const requiredWidthRatio = 1.3 * expansionFactor;
            const exportScaleFactor = Math.min(1.0, 1 / requiredWidthRatio, 600 / timelineViewBoxHeight);

            const dateObj = testDate ? new Date(testDate) : new Date();
            const formattedDate = `${dateObj.getFullYear()}. ${(dateObj.getMonth() + 1).toString().padStart(2, '0')}. ${dateObj.getDate().toString().padStart(2, '0')}`;

            return (
              <div
                id="export-card-pyramid"
                className="w-[450px] h-[800px] bg-[#F5F2ED] relative flex flex-col justify-between p-7 overflow-hidden"
              >
                {/* Header */}
                <div className="text-center flex flex-col items-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy/5 text-navy mb-1.5">
                    <Music size={16} />
                  </div>
                  <h3 className="font-serif text-2xl text-navy leading-none tracking-tight">My Taste</h3>
                  <p className="font-sans font-bold text-[8px] uppercase tracking-[0.2em] text-[#E67E22] mt-1.5">
                    {formattedDate}
                  </p>
                </div>

                {/* Vector Scaled Timeline Container */}
                <div className="relative flex-1 w-full my-3 overflow-hidden flex justify-center" style={{ height: "600px" }}>
                  <div
                    style={{
                      width: "394px",
                      height: `${timelineViewBoxHeight}px`,
                      transform: `scale(${exportScaleFactor})`,
                      transformOrigin: "top center",
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
                <div className="border-t border-navy/15 pt-2 flex items-center justify-between text-navy/40 text-[10px] font-bold">
                  <span className="font-serif text-navy/70">Sortify</span>
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
                    testDate={testDate}
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

      {/* Sortify Cream & Navy Toast Feedback */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-3rem)] max-w-xs px-4.5 py-3 rounded-2xl bg-[#FAF7F2]/95 text-navy border-2 border-navy shadow-xl backdrop-blur-md flex items-center justify-center gap-2.5 pointer-events-none text-center"
          >
            {toast.type === "success" ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Check size={12} strokeWidth={3} />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <X size={12} strokeWidth={3} />
              </div>
            )}
            <span className="font-sans font-bold text-xs sm:text-sm text-navy leading-snug break-keep">
              {toast.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
