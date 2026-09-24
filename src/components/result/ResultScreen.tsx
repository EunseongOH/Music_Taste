"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Download, Share2, Archive, Check, X, FileSpreadsheet, Loader2 } from "lucide-react";
import * as platform from "@/utils/platform";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/AuthProvider";
import LoginModal from "@/components/LoginModal";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { saveCompletedResult, fetchCompletedResultByArtist, overwriteCompletedResult } from "@/utils/worldcupDb";
import { ListCard, RecordCard, MosaicCard, PosterCard, ScaledCard, cardHeading, type CardMeta } from "@/components/TasteTemplates";
import { listPages, recordPages, SHAPES, type Shape } from "@/components/result/exportLayout";
import { Chip, ConfirmSheet, Sheet, UnderlineTabs, primaryButton, dangerButton } from "@/components/space/SpaceUI";
import { DockSpacer, useDockClearance } from "@/components/space/BottomDock";
import { trackEvent } from "@/utils/gtag";
import { NICKNAME_ERROR_TEXT, saveNickname } from "@/utils/nickname";
import { shareBody as buildShareBody, shareRanking, shareTitle } from "@/utils/shareText";
import PalettePicker from "@/components/result/PalettePicker";
import { type CardPalette } from "@/components/result/cardPalette";
import { shareToKakao } from "@/utils/kakaoShare";
import { useInlinedCovers } from "@/utils/useInlinedCovers";
import PyramidStage from "@/components/result/PyramidStage";
import { normalizeRanking } from "@/utils/ranking";

const translations = {
  ko: {
    title: "취향 기록표",
    savedLoading: "취향표를 불러오고 있어요",
    savedMissingTitle: "취향표를 열 수 없어요",
    savedMissingDesc: "삭제됐거나 볼 수 없는 취향표예요.",
    savedMissingAction: "내 취향 스페이스로 가기",
    skipIntro: "건너뛰기",
    templateList: "리스트형",
    templateRetro: "레코드형",
    templateMosaic: "모자이크형",
    templatePoster: "포스터형",
    shapeLabel: { heart: "하트", star: "별", circle: "원", triangle: "피라미드" },
    multiPageTitle: "이미지 {pages}장으로 저장할까요?",
    multiPageDesc: "{count}곡이 한 장에 다 들어가지 않아 나눠서 저장해요.",
    multiPageConfirm: "{pages}장 저장하기",
    saveImageError: "이미지를 저장하지 못했어요. 다시 시도해 주세요.",
    unsavedExitTitle: "저장하지 않고 나갈까요?",
    unsavedExitDesc: "나가면 이 취향표는 다시 볼 수 없어요.",
    unsavedExitConfirm: "나가기",
    saveBtn: "저장하기",
    paletteLabel: "카드 색 바꾸기",
    savedBtn: "저장됨",
    saveSheetTitle: "저장하기",
    saveToSpaceOption: "내 취향 스페이스에 저장",
    saveImageOption: "9:16 이미지 저장",
    saveExcelOption: "Excel 저장",
    autoSavedToast: "취향표가 자동 저장되었어요",
    savedLabel: "저장됨",
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
    togetherOption: "이 곡들로 같이 소트하기",
    shareXOption: "X (트위터)로 공유",
    shareKakaoOption: "카카오톡으로 공유",
    /** 카카오 카드 안의 버튼. 받는 사람이 누르는 말이다. */
    shareCtaButton: "취향표 보기",
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
    savedLoading: "Loading your taste card",
    savedMissingTitle: "Can't open this taste card",
    savedMissingDesc: "It was deleted or isn't available to you.",
    savedMissingAction: "Go to My Taste Space",
    skipIntro: "Skip",
    templateList: "List",
    templateRetro: "Vinyl",
    templateMosaic: "Mosaic",
    templatePoster: "Poster",
    shapeLabel: { heart: "Heart", star: "Star", circle: "Circle", triangle: "Pyramid" },
    multiPageTitle: "Save as {pages} images?",
    multiPageDesc: "{count} songs don't fit on one image, so they're split.",
    multiPageConfirm: "Save {pages} images",
    saveImageError: "Failed to save image. Please try again.",
    unsavedExitTitle: "Leave without saving?",
    unsavedExitDesc: "You won't be able to see this taste card again.",
    unsavedExitConfirm: "Leave",
    saveBtn: "Save",
    paletteLabel: "Change card colors",
    savedBtn: "Saved",
    saveSheetTitle: "Save",
    saveToSpaceOption: "Save to My Taste Space",
    saveImageOption: "Save 9:16 Image",
    saveExcelOption: "Save Excel",
    autoSavedToast: "Saved to My Taste Space",
    savedLabel: "Saved",
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
    togetherOption: "Sort these songs together",
    shareXOption: "Share on X (Twitter)",
    shareKakaoOption: "Share on KakaoTalk",
    shareCtaButton: "Open the taste card",
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

/* 공유 문구는 src/utils/shareText.ts 한 곳에서 만든다(모든 채널이 같은 말을 쓰게). */

/**
 * 미리보기 그림의 절대 주소를 만들 기준.
 *
 * 토스 빌드에서는 `process.env` 가 고정 객체로 치환되어 이 키가 없다 — 그때도
 * sortify.kr 로 떨어져야 한다(미니앱 출처에는 이 파일이 없다).
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sortify.kr";

/**
 * 결과 화면.
 *
 * - `fresh` (`/taste`): 월드컵을 막 끝낸 결과. 세션의 순위를 쓰고, 1위 공개 연출·
 *   자동 저장·저장 시트가 있으며, 나갈 때 진행 중이던 월드컵 기록을 정리한다.
 * - `saved` (`/my-taste?id=`): 저장해 둔 취향표를 다시 연 화면. DB 에서 읽고,
 *   **자동 저장하지 않는다**(예전에는 같은 화면을 재사용해 불러올 때마다 중복 저장됐다).
 *   연출·"내 취향 스페이스에 저장"이 없고, 나가기는 뒤로 가기만 한다.
 */
export default function ResultScreen({ mode = "fresh" }: { mode?: "fresh" | "saved" }) {
  const isSavedView = mode === "saved";
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [winners, setWinners] = useState<Track[]>([]);
  /**
   * 내보내기 카드에 쓸 순위. 커버만 미리 받아 둔 data URL 로 바꿔 둔다.
   * 화면에 보이는 템플릿은 그대로 원격 주소를 쓴다 — 저장되는 건 오프스크린 카드뿐이다.
   */
  const coverMap = useInlinedCovers(winners.map((w) => w.albumImage));
  const exportWinners = useMemo(
    () => winners.map((w) => (coverMap[w.albumImage] ? { ...w, albumImage: coverMap[w.albumImage] } : w)),
    [winners, coverMap]
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingArchive, setIsSavingArchive] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  /**
   * 진행 중인 자동 저장. 공유 직전에 이걸 기다린다.
   *
   * 공유 버튼은 화면이 뜨자마자 누를 수 있는데, 그 시점에
   * 자동 저장은 아직 끝나지 않았을 수 있다. 그러면 savedId 가 null 이라
   * 남에게 의미 없는 링크가 나간다 — 웹은 `/taste`, 토스는 미니앱 홈.
   * 상태가 아니라 ref 라서 리렌더를 유발하지 않는다.
   */
  const autoSaveRef = useRef<Promise<void> | null>(null);
  /**
   * 방금 저장된 결과의 id. **state 가 아니라 ref 다.**
   *
   * 공유 핸들러는 클릭 시점의 렌더를 닫아 두고 `await` 한다. state 였다면 그 사이에
   * 저장이 끝나도 클로저 안의 값은 여전히 null 이다(stale closure). 그러면 남에게
   * `/taste` — 받는 사람 자기 세션이 열리는 주소 — 가 나갔다.
   * 화면에 그리는 값이 아니라 리렌더도 필요 없다.
   */
  const savedIdRef = useRef<string | null>(null);
  /**
   * 저장이 한 번에 하나만 돌게 하는 빗장.
   *
   * 로그인하면 `user` 가 바뀌어 자동 저장 effect 가 다시 도는데, 그때 로그인 전에
   * 눌러 둔 [저장하기] 도 이어서 돈다. 빗장이 없으면 둘이 동시에 뛰어 취향표가 두 건
   * 생긴다. 16곡 미만이면 자동 저장이 아예 없으므로 빗장은 그때 아무 일도 하지 않는다.
   */
  const saveInFlight = useRef(false);
  /** 로그인 뒤 이어서 할 저장을 한 번만 처리한다. AuthProvider 는 user 를 여러 번 갱신한다. */
  const pendingConsumed = useRef(false);
  const rememberSavedId = (id: string | null) => {
    savedIdRef.current = id;
  };
  /**
   * 결과 템플릿. 기본은 레코드형. 월드컵 직후에는 그 전에 피라미드 인트로(PyramidStage)를 재생한다 —
   * 피라미드는 인트로 모션으로만 쓰고 취향표 템플릿으로는 두지 않는다.
   */
  const [template, setTemplate] = useState<"list" | "retro" | "mosaic" | "poster">("retro");
  /** 인트로가 끝났는지. 불러온 취향표(saved)는 인트로 없이 바로 보여준다. */
  const [introDone, setIntroDone] = useState(isSavedView);
  const reduceMotion = useReducedMotion();
  const [shape, setShape] = useState<Shape>("heart");
  /**
   * 카드 색 조합. **앱 테마가 아니라 카드 한 장의 무드다.**
   * 미리보기와 저장 이미지가 같은 컴포넌트를 쓰므로 이 state 하나가 둘을 함께 정한다.
   */
  const [palette, setPalette] = useState<CardPalette | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* 고정 바의 실제 높이만큼 본문 끝을 비운다 — 팔레트 트리거가 얹혀 바가 높아졌다. */
  const dockRef = useDockClearance();
  /** 여러 장 저장 확인 시트에 띄울 장 수(null 이면 닫힘) */
  const [pendingPages, setPendingPages] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSingleArtistMode, setIsSingleArtistMode] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [existingResult, setExistingResult] = useState<any | null>(null);
  const [testDate, setTestDate] = useState<string>("");
  const [archiveTitle, setArchiveTitle] = useState("");
  const [customSaveTitle, setCustomSaveTitle] = useState("");
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  /** saved 모드: 불러온 취향표의 제목(헤더에 쓴다)과 불러오기 상태. */
  const [savedTitle, setSavedTitle] = useState("");
  const [savedLoadState, setSavedLoadState] = useState<"loading" | "ready" | "missing">(isSavedView ? "loading" : "ready");

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

  /*
   * 로그인 뒤에 이어서 할 일.
   *
   * 화면 상태가 아니라 sessionStorage 에 둔다 — 구글·카카오는 팝업에서 돌아오고,
   * 그 사이 컴포넌트가 다시 그려질 수 있다. 저장이 끝나면 바로 지운다.
   */
  const armPendingSave = () => {
    try {
      sessionStorage.setItem("taste_pending_auth_action", "save-to-space");
    } catch {
      /* 못 적으면 이번 로그인에서는 못 이어간다. 화면은 그대로 남는다 */
    }
    pendingConsumed.current = false;
  };
  const clearPendingSave = () => {
    try {
      sessionStorage.removeItem("taste_pending_auth_action");
    } catch {
      /* 지우지 못해도 아래 once 빗장이 두 번 저장을 막는다 */
    }
  };

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

    if (isSavedView) {
      // 세션의 월드컵 순위·선택 아티스트는 읽지 않는다 — 진행 중인 월드컵과 섞이지 않게.
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) {
        setSavedLoadState("missing");
        return;
      }
      (async () => {
        const { data, error } = await supabase.from("tournament_results").select("*").eq("id", id).single();
        if (error || !data) {
          console.error("[my-taste] 취향표를 불러오지 못했어요:", error?.message);
          setSavedLoadState("missing");
          return;
        }
        // 압축 형식({i,t,a,m})으로 저장된 예전 순위도 같은 모양으로 맞춘다.
        const ranking: Track[] = normalizeRanking(data.ranking);
        const created = new Date(data.created_at);
        setTestDate(`${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, "0")}.${String(created.getDate()).padStart(2, "0")}`);
        setWinners(ranking);
        setSavedTitle(data.title || "");
        setIsSingleArtistMode(!!data.is_single_artist);
        rememberSavedId(data.id);
        setIsSaved(true);
        setSavedLoadState("ready");
      })();
      return;
    }

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

  /*
   * 로그인 전에 눌러 둔 [저장하기] 를 이어서 한다.
   *
   * LoginModal 의 콜백이 아니라 **계정이 실제로 확인됐을 때** 한다 — 이메일·가입·구글·
   * 카카오는 콜백 시점과 세션이 서는 시점이 다르다. 로그인 방식마다 저장 코드를
   * 복사하지 않고 이 한 자리를 지난다.
   *
   * AuthProvider 는 로그인 한 번에 user 객체를 여러 번 갱신한다(닉네임 자동 생성 등).
   * 그래서 한 번만 집어 간다.
   */
  useEffect(() => {
    if (!user || isSavedView || pendingConsumed.current) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("taste_pending_auth_action");
    } catch {
      /* 못 읽으면 이어갈 것이 없다 */
    }
    if (pending !== "save-to-space") return;
    pendingConsumed.current = true;
    clearPendingSave();
    void saveToSpace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSavedView]);

  // Auto-Save Effect: Triggered for logged-in users completing 16+ tracks
  useEffect(() => {
    // 16곡 기준은 월드컵을 시작한 곡 수다. "모르는 곡"으로 뺀 곡은 순위에 없으므로
    // 더해서 센다 — 16곡 중 1곡을 뺐다고 자동 저장이 조용히 꺼지면 안 된다.
    // 저장해 둔 취향표를 다시 연 화면에서는 절대 저장하지 않는다(중복 저장 방지).
    if (isSavedView) return;
    // 개발용 점검 페이지(/dev/result-lab)에서 연 결과 화면은 운영 DB 에 자동 저장하지 않는다.
    if (new URLSearchParams(window.location.search).get("preview") === "1") return;
    const skippedCount = Number(sessionStorage.getItem("worldcup_skipped_count")) || 0;
    if (user && winners.length + skippedCount >= 16 && !isSaved && !isAutoSaving) {
      setIsAutoSaving(true);
      autoSaveRef.current = (async () => {
        try {
          await saveToSpace(true);
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
    /*
     * **공유하는 순간 링크에는 반드시 이 결과를 가리키는 id 가 있어야 한다.**
     *
     * 같은 아티스트 취향표가 이미 있으면 자동 저장이 덮어쓰기 확인창으로 빠지며
     * 저장 없이 끝난다(id 가 아예 안 생긴다). 그 상태로 공유하면 남에게
     * `/taste` — 받는 사람 자기 세션이 열리는 주소 — 가 나갔다.
     *
     * 여기서는 **덮어쓰지 않고 새로 저장한다.** 둘 중 되돌릴 수 없는 쪽을 말없이
     * 고르지 않는다는 뜻이다. 기존 기록은 그대로 남고, 사용자는 확인창에서
     * 언제든 덮어쓰기를 다시 고를 수 있다.
     */
    if (!savedIdRef.current && user && !isSavedView) {
      try {
        await executeSaveArchive(false, true);
      } catch (e) {
        console.error("[share] 공유 전 저장 실패", e);
      }
    }
    return platform.shareUrl(savedIdRef.current, previewImage());
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

  /**
   * 공유 미리보기에 쓸 그림 — **1위 곡 재킷 → 아티스트 사진 → Sortify 로고**.
   *
   * `/taste/[id]` 의 OG 와 같은 사다리다(layout.tsx). 링크를 받는 쪽은 그 그림으로
   * "무엇에 대한 취향표"인지 알아본다.
   *
   * 로고는 항상 절대 주소다. 토스 미니앱은 출처가 tossmini.com 이라 상대 경로로는
   * 아무것도 못 받는다.
   */
  const previewImage = (): string => {
    const cover = winners[0]?.albumImage;
    if (cover?.startsWith("https://")) return cover;
    try {
      const raw = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
      const first = raw ? (JSON.parse(raw) as { image?: string }[])[0] : null;
      if (first?.image?.startsWith("https://")) return first.image;
    } catch {
      /* 저장소를 못 읽으면 로고로 간다 */
    }
    return `${SITE_URL}/og-sortify-v2.png`;
  };

  /** 공유 본문(유도 문구까지). 링크는 호출부가 붙이거나 어댑터가 붙인다. */
  const shareBody = (nickname: string | null) => buildShareBody(winners, nickname, locale);

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

  /**
   * "이 곡들로 같이 소트하기".
   *
   * 그냥 `/together/new` 로 보내면 아티스트 검색 화면이 먼저 뜬다 — 방금 소트한
   * 곡을 두고 아티스트를 다시 고르라는 말이 된다. 지금 이 취향표를 **고른 상태로**
   * 연다(곡 고르기 화면부터 시작).
   *
   * 저장된 취향표가 있으면 그것을, 없으면(비로그인·저장 전) 저장소에 남은
   * "지금 고른 곡" 을 가리킨다. 여기서 저장을 강제하지는 않는다 — 넘어가는 길일
   * 뿐이고, 묻지 않고 기록을 남길 자리가 아니다.
   */
  const goTogether = async () => {
    setShowShareModal(false);
    try {
      await autoSaveRef.current;
    } catch {
      /* 저장 실패는 자동 저장 쪽에서 이미 알린다 */
    }
    const id = savedIdRef.current;
    router.push(`/together/new?source=${id ?? "picked"}`);
  };

  const handleShareInstagram = async () => {
    setShowShareModal(false);
    await saveCards(1); // 스토리에는 첫 장 한 장이면 된다
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

  /**
   * 카카오톡 공유.
   *
   * 예전에는 `navigator.share()` 를 불렀다 — 그건 OS 공유 시트라 카카오톡이
   * 지정되지 않았고, 본문도 `"{아티스트} 취향표"` 한 줄뿐이라 다른 채널과 달랐다.
   * 이제 Kakao SDK 로 카드를 보내고, 본문은 다른 채널과 같은 곳에서 만든다.
   *
   * 키(NEXT_PUBLIC_KAKAO_JS_KEY)가 없거나 SDK 가 안 뜨면 예전 경로로 떨어진다.
   */
  const handleShareKakao = async () => {
    const nickname = await ensureShareName();
    if (nickname === false) return;
    const url = await resolveShareUrl();
    const sent = await shareToKakao({
      title: shareTitle(winners, nickname, locale),
      description: shareRanking(winners),
      imageUrl: previewImage(),
      url,
      buttonLabel: t.shareCtaButton,
    });
    if (!sent) {
      // SDK 가 없을 때. 여기서도 본문은 같은 것을 쓴다.
      const shared = await platform.share({ title: t.title, text: shareBody(nickname), url });
      if (!shared) handleCopyLink();
    }
    trackEvent("funnel_share_kakao", { sdk: sent });
  };

  /** 지금 템플릿이 몇 장의 카드로 저장되는지. 오프스크린 카드 id 는 export-card-0.. */
  const exportCardCount =
    template === "list" ? listPages(winners.length).length : template === "retro" ? recordPages(winners.length).length : 1; // 모자이크·포스터는 1장

  const saveCards = async (count: number) => {
    setIsExporting(true);
    try {
      const base = `${winners[0]?.artistName || "Artist"}_Music_Taste_${template}`;
      for (let i = 0; i < count; i++) {
        const el = document.getElementById(`export-card-${i}`);
        if (!el) continue;
        // 연속 다운로드를 브라우저가 막지 않게 조금씩 띄운다.
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 450));
        await platform.saveImage(el, count > 1 ? `${base}_Part${i + 1}.png` : `${base}.png`);
      }
      setShowSaveSheet(false);
    } catch (err) {
      console.error("Failed to export image", err);
      showToastMessage(t.saveImageError, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadImage = async () => {
    if (exportCardCount > 1) {
      setPendingPages(exportCardCount);
      return;
    }
    await saveCards(1);
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

      // 매치별 선택 기록(곡 ID). 월드컵 페이지가 끝날 때 남긴다. 없으면 빈 배열.
      let picks: any[] = [];
      try { picks = JSON.parse(sessionStorage.getItem("worldcup_picks") || "[]"); } catch {}

      let saveRes;
      if (overwrite && existingResult) {
        saveRes = await overwriteCompletedResult(existingResult.id, winners, winners.slice(1), title, { isPublic, isSingleArtist: isSingleArtistMode, picks });
      } else {
        saveRes = await saveCompletedResult(winners, winners.slice(1), title, {
          isPublic,
          isSingleArtist: isSingleArtistMode,
          artistId,
          artistName,
          picks
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
        rememberSavedId(saveRes.id);
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

  /**
   * 내 취향 스페이스에 저장하는 **하나뿐인 길**.
   *
   * 전에는 자동 저장과 [저장하기] 가 같은 일을 각자 적어 두고 있었다. 로그인 직후에는
   * 둘이 동시에 뛸 수 있어서(로그인하면 user 가 바뀌어 자동 저장 effect 가 다시 돈다)
   * 취향표가 두 건 생기거나 덮어쓰기 창과 경쟁했다. 이제 한 함수를 지나고,
   * `saveInFlight` 로 한 번에 하나만 돈다.
   *
   * 기존 기록이 있으면 **묻는다.** 로그인했다는 이유로 말없이 덮어쓰거나 새로 만들지 않는다.
   */
  const saveToSpace = async (isAuto = false): Promise<void> => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    try {
      let artistId: string | null = null;
      try {
        const storedArtists = sessionStorage.getItem("selectedArtists") || localStorage.getItem("selectedArtists");
        if (storedArtists) {
          const parsed = JSON.parse(storedArtists);
          if (parsed && parsed.length > 0) artistId = parsed[0].id;
        }
      } catch {
        /* 저장소를 못 읽으면 아티스트 없이 새로 저장한다 */
      }

      if (isSingleArtistMode && artistId) {
        const existing = await fetchCompletedResultByArtist(artistId);
        if (existing) {
          setExistingResult(existing);
          setShowOverwriteModal(true);
          return;
        }
      }
      await executeSaveArchive(false, isAuto);
    } finally {
      saveInFlight.current = false;
    }
  };

  const handleSaveToSpace = async () => {
    setShowSaveSheet(false);
    if (!user) {
      /*
       * 로그인하러 가기 전에 **하려던 일을 적어 둔다.** 전에는 로그인 창만 띄우고
       * 끝이라, 로그인에 성공해도 이어갈 것이 없었다(게다가 LoginModal 의 기본 동작이
       * /explore 로 보내 화면 자체를 잃었다).
       */
      armPendingSave();
      setShowLoginModal(true);
      return;
    }
    await saveToSpace();
  };

  const executeExit = async () => {
    sessionStorage.removeItem("worldcup_ranking");
    sessionStorage.removeItem("worldcup_picks");
    sessionStorage.removeItem("worldcup_skipped_count");
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
    if (isSavedView) {
      // 불러온 취향표를 닫을 뿐이다. 진행 중인 월드컵 기록은 건드리지 않는다.
      if (window.history.length > 1) router.back();
      else router.push("/explore-taste");
      return;
    }
    if (isSaved) {
      await executeExit();
      return;
    }

    if (user) {
      setShowExitConfirm(true);
    } else {
      setShowExitSaveModal(true);
    }
  };


  const cardMeta: CardMeta = (() => {
    const h = cardHeading(winners, locale);
    const single = isSingleArtistMode || h.single;
    return {
      heading: single ? winners[0]?.artistName ?? h.heading : h.heading,
      single,
      date: testDate,
      total: winners.length,
      locale,
      palette,
    };
  })();

  /** 인트로 재생 중: 화면 전체를 피라미드 연출이 덮고, 탭·하단 버튼은 숨긴다. */
  const showIntro = !introDone && !reduceMotion && winners.length > 1;

  /** 지금 템플릿의 카드들. 화면용(winners)과 저장용(exportWinners)이 같은 함수를 쓴다. */
  const renderCards = (tracks: Track[]): React.ReactNode[] => {
    if (template === "list") {
      const pages = listPages(tracks.length);
      return pages.map((pg, i) => <ListCard key={i} tracks={tracks} meta={cardMeta} page={pg} index={i} count={pages.length} />);
    }
    if (template === "retro") {
      const pages = recordPages(tracks.length);
      return pages.map((pg, i) => <RecordCard key={i} tracks={tracks} meta={cardMeta} page={pg} index={i} count={pages.length} />);
    }
    if (template === "mosaic") return [<MosaicCard key="mosaic" tracks={tracks} meta={cardMeta} shape={shape} />];
    return [<PosterCard key={`poster-${tracks.length}`} tracks={tracks} meta={cardMeta} />];
  };

  // saved 모드: 불러오는 중이거나 찾을 수 없을 때(삭제됐거나, 남의 비공개 취향표)
  if (isSavedView && savedLoadState !== "ready") {
    return (
      <main className="flex flex-col min-h-screen w-full bg-[var(--app-bg)]">
        <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="type-title-1 text-navy">{t.title}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
          {savedLoadState === "loading" ? (
            <p className="type-sub text-navy/70">{t.savedLoading}</p>
          ) : (
            <>
              <p className="type-title-2 text-navy">{t.savedMissingTitle}</p>
              <p className="type-sub text-navy/70 mt-1.5">{t.savedMissingDesc}</p>
              <button
                onClick={() => router.push("/explore-taste")}
                className="mt-6 h-12 px-6 rounded-full bg-brand text-cream type-body-strong"
              >
                {t.savedMissingAction}
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Top Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0" />
          <h1 className="type-title-1 text-navy truncate">{isSavedView ? savedTitle || t.title : t.title}</h1>
        </div>
        <button
          onClick={handleExit}
          className="w-10 h-10 rounded-full border-2 border-navy flex items-center justify-center bg-white hover:bg-navy/5 transition-colors cursor-pointer newtone:border newtone:border-navy/15"
          title="종료하기"
        >
          <X size={18} className="text-navy font-bold" />
        </button>
      </div>

      {/* 결과 카드 — 화면에 보이는 카드가 그대로 저장된다 */}
      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-2">
        {!showIntro && (
        <UnderlineTabs
          tabs={[
            { id: "retro", label: t.templateRetro },
            { id: "list", label: t.templateList },
            { id: "mosaic", label: t.templateMosaic },
            { id: "poster", label: t.templatePoster },
          ]}
          active={template}
          onChange={(id) => {
            setTemplate(id);
            trackEvent("change_template", { template_type: id });
          }}
        />
        )}

        {template === "mosaic" && (
          <div role="radiogroup" aria-label={t.templateMosaic} className="flex gap-2 mt-4">
            {SHAPES.map((sh) => (
              <Chip
                key={sh}
                selected={shape === sh}
                onClick={() => {
                  setShape(sh);
                  trackEvent("change_shape", { shape: sh });
                }}
              >
                {t.shapeLabel[sh]}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-5">
          {winners.length > 0 &&
            (showIntro ? (
              // 월드컵 직후 인트로: 예전 피라미드 모션 그대로. 끝나면 기본 템플릿(레코드형) 카드로.
              <PyramidStage tracks={winners} playing onDone={() => setIntroDone(true)} skipLabel={t.skipIntro} />
            ) : (
              renderCards(winners).map((card, i) => (
                <ScaledCard key={`${template}-${i}`} halo={palette?.previewHalo}>
                  {card}
                </ScaledCard>
              ))
            ))}
        </div>
        <DockSpacer />
      </div>

      {/* Streamlined Bottom Floating Actions (2 Buttons: Save & Share) */}
      <AnimatePresence>
        {winners.length > 0 && !showIntro && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            ref={dockRef}
            className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 flex justify-center items-center z-50 pointer-events-none"
          >
            <div className="w-full max-w-[380px] flex flex-col gap-2 pointer-events-auto">
              {/* 색 고르기는 저장 버튼 위, 왼쪽 끝. 카드 밖이라 저장 이미지에는 안 들어간다. */}
              <div className="self-start">
                <PalettePicker value={palette} onChange={setPalette} open={paletteOpen} onOpenChange={setPaletteOpen} label={t.paletteLabel} />
              </div>

              <div className="flex gap-3">
              <button
                onClick={() => setShowSaveSheet(true)}
                /*
                 * 불투명한 크림 면 + 옅은 테두리. 전에는 흰 바탕이라 크림색 화면에서
                 * 테두리만 떠 보였고, 카드가 뒤에 비쳤다. 공유하기가 주 버튼이라
                 * 저장하기는 보조 위계를 지키되 또렷하게 보이게 한다.
                 */
                className="flex-1 h-[48px] bg-cream border border-navy/15 text-navy hover:bg-navy/5 active:bg-navy/10 rounded-2xl font-sans font-bold text-sm transition-all active:scale-[0.98] shadow-md flex items-center justify-center cursor-pointer"
              >
                <span>{t.saveBtn}</span>
              </button>

              <button
                onClick={() => {
                  setShareName(user?.user_metadata?.nickname ?? "");
                  setShareNameError("");
                  setShowShareModal(true);
                }}
                className="flex-1 h-[48px] bg-brand text-cream font-sans font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-md hover:bg-[#111A3E] newtone:hover:bg-brand/90"
              >
                <Share2 size={18} />
                <span>{t.shareMainBtn}</span>
              </button>
              </div>
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

              <h2 className="text-xl font-bold text-navy mb-5 tracking-tight text-center">
                {t.saveSheetTitle}
              </h2>

              <div className="flex flex-col gap-3 w-full mb-4">
                {/* 1. Save to Space — 이미 저장된 취향표를 연 화면에서는 두지 않는다 */}
                {!isSavedView && (
                <button
                  onClick={handleSaveToSpace}
                  disabled={isSavingArchive}
                  className="w-full h-[52px] px-5 bg-white border border-navy/20 hover:bg-navy/5 text-navy font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <div className="flex items-center gap-3">
                    <Archive size={20} className="text-point newtone:text-brand" />
                    <span>{t.saveToSpaceOption}</span>
                  </div>
                  {isSavingArchive ? (
                    <Loader2 size={18} className="text-navy/60 animate-spin" />
                  ) : (
                    isSaved && <Check size={18} className="text-emerald-600 newtone:text-brand" />
                  )}
                </button>
                )}

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
                  <FileSpreadsheet size={20} className="text-[#0F766E] newtone:text-navy/70" />
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

      {/* 로그인 전 나가기 — 하단 시트 (docs/design-system/dialogs.md 3장) */}
      <Sheet
        open={showExitSaveModal}
        onClose={() => setShowExitSaveModal(false)}
        closeLabel={t.cancel}
        header={
          <>
            <h2 className="type-title-1 text-navy">{locale === "en" ? "Save your taste card?" : "취향표를 저장할까요?"}</h2>
            <p className="type-sub text-navy/70 mt-1 break-keep">{t.exitSaveDesc}</p>
          </>
        }
        footer={
          <div className="flex flex-col gap-2">
            <button onClick={() => { setShowExitSaveModal(false); armPendingSave(); setShowLoginModal(true); }} className={`${primaryButton} w-full`}>{t.exitSaveLoginBtn}</button>
            <button onClick={async () => { setShowExitSaveModal(false); await executeExit(); }} className={`${dangerButton} w-full`}>{t.exitSaveLeaveBtn}</button>
          </div>
        }
      />

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
                className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto newtone:bg-white newtone:border newtone:border-navy/10 newtone:rounded-[2rem] newtone:shadow-[0_20px_50px_-20px_rgba(24,33,59,0.35)] flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                <h2 className="text-xl font-bold text-navy mb-2 tracking-tight">
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
                    className="w-full h-[48px] bg-brand text-cream font-bold text-sm rounded-2xl hover:bg-brand/90 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
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
                    className="w-full h-[44px] bg-navy/5 text-navy font-bold text-xs rounded-xl hover:bg-navy/10 transition-all cursor-pointer"
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

              <h2 className="text-xl font-bold text-navy mb-5 tracking-tight text-center">
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
                  <p className={`mt-1.5 font-sans text-xs ${shareNameError ? "text-red-500 newtone:text-danger" : "text-navy/50"}`}>
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
                  className="w-full h-[52px] px-5 bg-brand hover:bg-brand/90 active:bg-brand/80 text-cream font-sans font-bold text-sm rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
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

                {/*
                  같이 소트하기는 **공유 수단이 아니라 다음에 할 일**이다. SNS 브랜드
                  버튼 사이에 끼워 두면 "어디로 보낼까" 를 고르는 줄에 엉뚱한 것이 섞인다.
                  선 하나로 끊고 아래에 따로 둔다. 색도 포인트색(주황)을 쓰지 않는다 —
                  같은 무게로 보이면 안 된다.
                */}
                <div className="pt-3 mt-1 border-t border-navy/10">
                  <button
                    onClick={goTogether}
                    className="w-full h-[52px] px-5 bg-navy/5 text-navy font-sans font-bold text-sm rounded-xl hover:bg-navy/10 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center"
                  >
                    {t.togetherOption}
                  </button>
                </div>
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
                className="bg-cream w-full max-w-sm rounded-[2.5rem] border-[3px] border-navy p-7 shadow-2xl relative pointer-events-auto newtone:bg-white newtone:border newtone:border-navy/10 newtone:rounded-[2rem] newtone:shadow-[0_20px_50px_-20px_rgba(24,33,59,0.35)] flex flex-col items-center text-center"
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

                <h2 className="text-xl font-bold text-navy mb-2 tracking-tight">{t.instagramGuideTitle}</h2>
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
      {/*
        `onSuccess` 를 주지 않으면 LoginModal 이 기본으로 /explore 로 보낸다(LoginModal.tsx
        의 handleSuccess). 이 화면에서 로그인은 **하던 일을 계속하려는 것**이지 화면을
        떠나려는 것이 아니다. 다른 사용처 7곳은 이미 콜백을 주고 있어, 여기만 주면 된다.

        `onClose` 는 성공할 때도 불린다(handleSuccess 가 onClose 뒤에 onSuccess 를 부른다).
        그래서 닫을 때 지우고 성공하면 다시 세운다 — 취소하고 나중에 다른 이유로 로그인해도
        취향표가 저절로 저장되지 않는다.
      */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          clearPendingSave();
        }}
        onSuccess={() => {
          setShowLoginModal(false);
          armPendingSave();
        }}
      />

      {/* Offscreen High-Fidelity 9:16 Instagram Story Export Cards */}
      {winners.length > 0 && (
        <div
          className="absolute top-[-9999px] left-[-9999px] pointer-events-none select-none"
          style={{ width: "450px" }}
        >
          {renderCards(exportWinners).map((card, i) => (
            <div key={`${template}-${i}`} id={`export-card-${i}`} className="w-[450px] h-[800px]">
              {card}
            </div>
          ))}
        </div>
      )}

      <ConfirmSheet
        open={pendingPages !== null}
        title={t.multiPageTitle.replace("{pages}", String(pendingPages ?? 0))}
        desc={t.multiPageDesc.replace("{count}", String(winners.length))}
        confirmLabel={t.multiPageConfirm.replace("{pages}", String(pendingPages ?? 0))}
        cancelLabel={t.cancel}
        busy={isExporting}
        onClose={() => setPendingPages(null)}
        onConfirm={async () => {
          const pages = pendingPages ?? 1;
          setPendingPages(null);
          await saveCards(pages);
        }}
      />

      <ConfirmSheet
        open={showExitConfirm}
        title={t.unsavedExitTitle}
        desc={t.unsavedExitDesc}
        confirmLabel={t.unsavedExitConfirm}
        cancelLabel={t.cancel}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={async () => {
          setShowExitConfirm(false);
          await executeExit();
        }}
      />

      {/* Sortify Cream & Navy Toast Feedback */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-3rem)] max-w-xs px-4.5 py-3 rounded-2xl bg-[#FAF7F2]/95 newtone:bg-white/95 text-navy border-2 border-navy shadow-xl backdrop-blur-md flex items-center justify-center gap-2.5 pointer-events-none text-center"
          >
            {toast.type === "success" ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500 newtone:bg-brand text-white flex items-center justify-center shrink-0 shadow-sm">
                <Check size={12} strokeWidth={3} />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-red-500 newtone:bg-danger text-white flex items-center justify-center shrink-0 shadow-sm">
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
