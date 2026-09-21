"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, ChevronRight, ArrowLeft, Disc } from "lucide-react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import { NICKNAME_ERROR_TEXT, saveNickname, validateNickname } from "@/utils/nickname";
import { draftExpiresAt, formatDraftExpiry, isDraftExpired } from "@/utils/worldcupDb";
import { EmptyState, RankList, SectionTitle, UnderlineTabs, formatDate, primaryButton, secondaryButton } from "@/components/space/SpaceUI";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateImg: (img: string) => void;
}

export default function ProfileModal({ isOpen, onClose, onUpdateImg }: ProfileModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImg, setProfileImg] = useState("/default-profile.png");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "archive">("profile");
  const [selectedArchive, setSelectedArchive] = useState<any | null>(null);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  
  const { signOut, user } = useAuth();
  const [completedResults, setCompletedResults] = useState<any[]>([]);
  const [activeDrafts, setActiveDrafts] = useState<any[]>([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);

  const getArchiveTracks = (archive: any) => {
    if (!archive) return [];
    if (archive.r) {
      return archive.r.map((t: any) => ({
        id: t.i,
        title: t.t,
        artistName: t.a,
        albumImage: t.m ? (t.m.startsWith("http") ? t.m : `https://i.scdn.co/image/${t.m}`) : ""
      }));
    }
    return archive.ranking || [];
  };

  const handleResumeDraft = (draft: any) => {
    // 1. Set selectedArtists in session and localStorage
    if (draft.selected_artists && draft.selected_artists.length > 0) {
      sessionStorage.setItem("selectedArtists", JSON.stringify(draft.selected_artists));
      localStorage.setItem("selectedArtists", JSON.stringify(draft.selected_artists));
    }
    
    // 2. Set worldcup_tracks (selected_tracks)
    if (draft.selected_tracks && draft.selected_tracks.length > 0) {
      sessionStorage.setItem("worldcup_tracks", JSON.stringify(draft.selected_tracks));
      localStorage.setItem("worldcup_tracks", JSON.stringify(draft.selected_tracks));
    }

    // 3. 진행 상태는 월드컵 페이지가 DB 초안(progress 컬럼)에서 직접 복원한다.
    //    로컬의 오래된 진행이 DB 를 가리지 않게 지운다.
    sessionStorage.removeItem("worldcup_progress");
    localStorage.removeItem("worldcup_progress");
    const isSingle = !!draft.is_single_artist;
    sessionStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");
    localStorage.setItem("worldcup_is_single_artist", isSingle ? "true" : "false");

    // 4. Redirect user based on status (모드를 붙여야 같은 모드의 초안을 읽는다)
    const qs = isSingle ? "?mode=single" : "";
    onClose();
    if (draft.status === 'artist_selection') {
      router.push(`/explore${qs}`);
    } else if (draft.status === 'track_selection') {
      router.push(`/tracks${qs}`);
    } else {
      router.push(`/worldcup${qs}`);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "archive" && user) {
      const fetchArchives = async () => {
        setIsLoadingArchives(true);
        const supabase = createClient();
        
        try {
          // 1. Fetch completed results
          const { data: resultsData, error: resultsError } = await supabase
            .from('tournament_results')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
            
          // 2. Fetch active drafts
          const { data: draftsData, error: draftsError } = await supabase
            .from('tournament_drafts')
            .select('*')
            .eq('user_id', user.id);
            
          if (!resultsError && resultsData) {
            setCompletedResults(resultsData);
          }
          if (!draftsError && draftsData) {
            setActiveDrafts(draftsData.filter((d: any) => !isDraftExpired(d)));
          }
        } catch (err) {
          console.error("Error fetching database archives:", err);
        } finally {
          setIsLoadingArchives(false);
        }
      };
      
      fetchArchives();
    }
  }, [isOpen, activeTab, user]);

  const handleLogout = async () => {
    try {
      await signOut();
      sessionStorage.removeItem("isGuest");
      sessionStorage.removeItem("userNickname");
      sessionStorage.removeItem("userPhone");
      sessionStorage.removeItem("userProfileImg");
      sessionStorage.removeItem("selectedArtists");
      sessionStorage.removeItem("worldcup_tracks");
      sessionStorage.removeItem("worldcup_progress");
      sessionStorage.removeItem("selected_genres");
      
      localStorage.removeItem("worldcup_tracks");
      localStorage.removeItem("worldcup_progress");
      localStorage.removeItem("selectedArtists");
      localStorage.removeItem("selected_genres");
      
      onClose();
      router.push("/");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const currentImg = user?.user_metadata?.avatar_url || sessionStorage.getItem("userProfileImg") || "/default-profile.png";
      setProfileImg(currentImg);
      
      // 서버 값(user_metadata)이 기준. 캐시는 로그인 직후 메타데이터가 비었을 때만.
      const savedNickname = user?.user_metadata?.nickname || sessionStorage.getItem("userNickname");
      if (savedNickname) setNickname(savedNickname);

      const savedPhone = sessionStorage.getItem("userPhone");
      if (savedPhone) setPhone(savedPhone);
      
      setLocale(getSafeLocale());

      // Reset tab and selection on reopen
      setActiveTab("profile");
      setSelectedArchive(null);
      setUpdateError("");
      setIsUpdating(false);
    }
  }, [isOpen, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNickname = nickname.trim();
    const localError = validateNickname(trimmedNickname);
    if (localError) {
      setUpdateError(NICKNAME_ERROR_TEXT[locale][localError]);
      return;
    }

    setIsUpdating(true);
    setUpdateError("");

    const supabase = createClient();

    try {
      if (user) {
        // 1. 닉네임은 서버 함수로만 바꾼다(규정·중복·결과 사본을 서버가 함께 처리).
        //    프로필에서 직접 저장한 이름이므로 확인된 이름으로 기록된다.
        if (trimmedNickname !== user.user_metadata?.nickname || !user.user_metadata?.nickname_confirmed) {
          const saved = await saveNickname(trimmedNickname);
          if (saved !== "ok") {
            setUpdateError(NICKNAME_ERROR_TEXT[locale][saved]);
            setIsUpdating(false);
            return;
          }
        }

        // 2. 나머지 프로필 정보. user_metadata 는 키 단위로 합쳐지므로 nickname 은 보내지 않는다.
        const { error: authError } = await supabase.auth.updateUser({
          data: {
            phone: phone.trim() || null,
            avatar_url: profileImg
          }
        });

        if (authError) {
          setUpdateError(
            locale === "ko" 
              ? `프로필 업데이트에 실패했어요. 다시 시도해 주세요.` 
              : `Failed to update profile. Please try again.`
          );
          setIsUpdating(false);
          return;
        }

        // 3. 지난 결과의 프로필 이미지. 닉네임 사본은 1 에서 서버가 이미 맞췄다.
        await supabase
          .from("tournament_results")
          .update({ user_profile_image: profileImg })
          .eq("user_id", user.id);
      }

      // Sync local storage and session storage
      sessionStorage.setItem("userNickname", trimmedNickname);
      localStorage.setItem("userNickname", trimmedNickname);
      sessionStorage.setItem("userPhone", phone.trim());
      sessionStorage.setItem("userProfileImg", profileImg);
      localStorage.setItem("userProfileImg", profileImg);

      onUpdateImg(profileImg);
      onClose();
    } catch (err) {
      console.error("Failed to update profile:", err);
      setUpdateError(locale === "ko" ? "업데이트 중 오류가 발생했어요. 다시 시도해 주세요." : "An error occurred during update. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleImageChangeClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
      const compressedImg = await resizeAndCompressImage(file);
      setProfileImg(compressedImg);
    } catch (err) {
      console.error("Failed to process image file:", err);
      setUpdateError(locale === "ko" ? "이미지 처리 중 오류가 발생했습니다." : "Failed to process image file.");
    }
  };

  const resizeAndCompressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 128;
          const MAX_HEIGHT = 128;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            resolve(dataUrl);
          } else {
            reject(new Error("Canvas context not available"));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  if (!isOpen) return null;

  const t = {
    ko: {
      title: "마이페이지",
      profileTab: "프로필 수정",
      archiveTab: "내 취향 스페이스",
      nicknameLabel: "닉네임",
      phoneLabel: "전화번호",
      placeholderNickname: "내 닉네임",
      placeholderPhone: "010-0000-0000",
      changePhoto: "프로필 사진 변경",
      logoutBtn: "로그아웃",
      saveBtn: "저장하기",
      savingBtn: "저장 중…",
      close: "닫기",
      back: "목록으로",
      loadingArchives: "불러오는 중이에요",
      noArchives: "아직 저장된 취향표나 진행 중인 월드컵이 없어요",
      noArchivesSub: "월드컵을 끝내면 여기에서 다시 볼 수 있어요.",
      sectionDrafts: "진행 중인 월드컵",
      sectionCompleted: "완료한 취향표",
      resume: "이어하기",
      stageArtist: "아티스트 선택 단계",
      stageTrack: "곡 선택 단계",
      stageWorldCup: "월드컵 진행 중",
      firstPlace: "1위",
      archiveRecord: "기록",
      loadAndShare: "불러와서 공유하기",
    },
    en: {
      title: "My Page",
      profileTab: "Edit Profile",
      archiveTab: "My Taste Space",
      nicknameLabel: "Nickname",
      phoneLabel: "Phone number",
      placeholderNickname: "My nickname",
      placeholderPhone: "Phone number",
      changePhoto: "Change profile photo",
      logoutBtn: "Log out",
      saveBtn: "Save",
      savingBtn: "Saving…",
      close: "Close",
      back: "Back to list",
      loadingArchives: "Loading",
      noArchives: "No saved taste cards or World Cups in progress yet",
      noArchivesSub: "Finish a World Cup to see it here.",
      sectionDrafts: "World Cups in progress",
      sectionCompleted: "Completed taste cards",
      resume: "Resume",
      stageArtist: "Choosing artists",
      stageTrack: "Choosing songs",
      stageWorldCup: "World Cup in progress",
      firstPlace: "#1",
      archiveRecord: "Record",
      loadAndShare: "Load & share",
    }
  }[locale];

  const inputClass =
    "w-full h-12 px-4 bg-white border border-navy/15 rounded-xl type-body text-navy outline-none focus:border-navy placeholder:text-navy/40";
  const archiveCount = completedResults.length + activeDrafts.length;

  return typeof document !== "undefined" ? createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-navy/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <div className="p-4 pointer-events-none z-[10000] w-full flex justify-center max-w-[430px] mx-auto">
          <motion.div
            role="dialog"
            aria-modal="true"
            className="bg-cream w-full max-w-sm rounded-[1.75rem] p-6 shadow-2xl relative pointer-events-auto flex flex-col"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="type-title-1 text-navy">{t.title}</h2>
              <button
                onClick={onClose}
                aria-label={t.close}
                className="-mr-2 w-9 h-9 flex items-center justify-center rounded-full text-navy hover:bg-navy/5"
              >
                <X size={20} strokeWidth={2.25} />
              </button>
            </div>

            {!selectedArchive && (
              <div className="mt-3 -mx-6 px-6">
                <UnderlineTabs
                  tabs={[
                    { id: "profile" as const, label: t.profileTab },
                    { id: "archive" as const, label: t.archiveTab, count: archiveCount > 0 ? archiveCount : null },
                  ]}
                  active={activeTab}
                  onChange={setActiveTab}
                />
              </div>
            )}

            {/* 프로필 수정 */}
            {activeTab === "profile" && !selectedArchive && (
              <form onSubmit={handleSave} className="w-full flex flex-col gap-5 pt-6">
                <div className="relative mx-auto">
                  <div className="relative rounded-full overflow-hidden bg-navy/5" style={{ width: 88, height: 88 }}>
                    <Image src={profileImg} alt="Profile" width={88} height={88} className="object-cover w-full h-full" />
                  </div>
                  <button
                    type="button"
                    onClick={handleImageChangeClick}
                    aria-label={t.changePhoto}
                    className="absolute -bottom-1 -right-1 w-9 h-9 flex items-center justify-center rounded-full bg-navy text-cream border-2 border-cream"
                  >
                    <Camera size={16} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    style={{ display: "none" }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-nickname" className="type-sub font-semibold text-navy">{t.nicknameLabel}</label>
                  <input
                    id="profile-nickname"
                    type="text"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder={t.placeholderNickname}
                    maxLength={12}
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-phone" className="type-sub font-semibold text-navy">{t.phoneLabel}</label>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder={t.placeholderPhone}
                    className={inputClass}
                  />
                </div>

                {updateError && <p role="alert" className="type-sub text-danger">{updateError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isUpdating}
                    className={`${secondaryButton} flex-1 !text-danger`}
                  >
                    {t.logoutBtn}
                  </button>
                  <button type="submit" disabled={isUpdating} className={`${primaryButton} flex-[2]`}>
                    {isUpdating ? t.savingBtn : t.saveBtn}
                  </button>
                </div>
              </form>
            )}

            {/* 내 취향 스페이스 목록 */}
            {activeTab === "archive" && !selectedArchive && (
              isLoadingArchives ? (
                <div className="py-12 flex flex-col items-center gap-3">
                  <Disc className="animate-spin text-point" size={24} />
                  <p className="type-sub text-navy/70">{t.loadingArchives}</p>
                </div>
              ) : archiveCount === 0 ? (
                <EmptyState title={t.noArchives} desc={t.noArchivesSub} />
              ) : (
                <div className="max-h-[360px] overflow-y-auto -mx-6 px-6 pt-5 flex flex-col gap-6">
                  {activeDrafts.length > 0 && (
                    <section>
                      <SectionTitle title={t.sectionDrafts} count={activeDrafts.length} />
                      <ul className="divide-y divide-navy/10 mt-1">
                        {activeDrafts.map((draft: any) => {
                          let stepText = t.stageArtist;
                          if (draft.status === "track_selection") stepText = t.stageTrack;
                          else if (draft.status === "pre_tournament" || draft.status === "playing") stepText = t.stageWorldCup;
                          return (
                            <li key={draft.id}>
                              <button
                                type="button"
                                onClick={() => handleResumeDraft(draft)}
                                className="w-full flex items-center gap-3 py-3 text-left"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="type-body-strong text-navy truncate">{draft.title}</p>
                                  <p className="type-caption text-navy/70 truncate">
                                    {stepText} · {formatDate(draft.updated_at, locale)}
                                    {draftExpiresAt(draft) !== null && ` · ${draft.current_round_name} · ${formatDraftExpiry(draft, locale)}`}
                                  </p>
                                </div>
                                <span className="type-sub font-semibold text-point-ink shrink-0">{t.resume}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {completedResults.length > 0 && (
                    <section>
                      <SectionTitle title={t.sectionCompleted} count={completedResults.length} />
                      <ul className="divide-y divide-navy/10 mt-1">
                        {completedResults.map((result: any) => (
                          <li key={result.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedArchive(result)}
                              className="w-full flex items-center gap-3 py-3 text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="type-body-strong text-navy truncate">
                                  {t.firstPlace} {result.winner_track_title} · {result.winner_track_artist}
                                </p>
                                <p className="type-caption text-navy/70">{formatDate(result.created_at, locale)}</p>
                              </div>
                              <ChevronRight size={18} className="text-navy/70 shrink-0" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )
            )}

            {/* 취향표 상세 */}
            {selectedArchive && (() => {
              const tracks = getArchiveTracks(selectedArchive);
              return (
                <div className="flex flex-col pt-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedArchive(null)}
                      aria-label={t.back}
                      className="-ml-2 w-9 h-9 flex items-center justify-center rounded-full text-navy hover:bg-navy/5"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <span className="type-sub text-navy/70">
                      {formatDate(selectedArchive.saved_at || selectedArchive.created_at, locale)} · {t.archiveRecord}
                    </span>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto -mx-6 px-6 mt-2">
                    <RankList tracks={tracks} />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      // 저장된 취향표 전용 화면(자동 저장 없음). 예전 세션의 선택 아티스트가
                      // 남아 있어도 영향받지 않는다.
                      onClose();
                      router.push(`/my-taste?id=${selectedArchive.id}`);
                    }}
                    className={`${primaryButton} w-full mt-4`}
                  >
                    {t.loadAndShare}
                  </button>
                </div>
              );
            })()}
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body
  ) : null;
}
