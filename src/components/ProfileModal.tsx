"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, User, Phone, Archive, ChevronRight, Calendar, Award, ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateImg: (img: string) => void;
}

export default function ProfileModal({ isOpen, onClose, onUpdateImg }: ProfileModalProps) {
  const [profileImg, setProfileImg] = useState("https://picsum.photos/seed/user1/100/100");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "archive">("profile");
  const [selectedArchive, setSelectedArchive] = useState<any | null>(null);
  
  const { signOut, user } = useAuth();
  const archives = user?.user_metadata?.archives || [];

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
      
      localStorage.removeItem("worldcup_tracks");
      localStorage.removeItem("worldcup_progress");
      
      onClose();
      window.location.href = "/";
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const savedImg = sessionStorage.getItem("userProfileImg");
      if (savedImg) setProfileImg(savedImg);
      
      const savedNickname = sessionStorage.getItem("userNickname");
      if (savedNickname) setNickname(savedNickname);

      const savedPhone = sessionStorage.getItem("userPhone");
      if (savedPhone) setPhone(savedPhone);
      
      // Reset tab and selection on reopen
      setActiveTab("profile");
      setSelectedArchive(null);
    }
  }, [isOpen]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem("userNickname", nickname);
    sessionStorage.setItem("userPhone", phone);
    sessionStorage.setItem("userProfileImg", profileImg);
    onUpdateImg(profileImg);
    onClose();
  };

  const handleImageChange = () => {
    // Mock image change by generating a new consistent random image
    const newSeed = Math.random().toString(36).substring(7);
    const newImg = `https://picsum.photos/seed/${newSeed}/100/100`;
    setProfileImg(newImg);
  };

  if (!isOpen) return null;

  return typeof document !== "undefined" ? createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-navy/20 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <div className="p-4 pointer-events-none z-[10000] w-full flex justify-center max-w-[430px] mx-auto">
          <motion.div
            className="bg-cream w-full max-w-sm rounded-[2rem] border-[3px] border-navy p-6 shadow-2xl relative pointer-events-auto flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <button 
              onClick={onClose}
              className="absolute top-5 right-5 text-navy hover:text-point transition-colors bg-navy/5 p-1.5 rounded-full"
              aria-label="Close modal"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
            
            <h2 className="font-serif text-2xl text-navy mb-4 tracking-tight">마이페이지</h2>
            
            {/* Tabs Header - Only visible if not looking at detailed archive */}
            {!selectedArchive && (
              <div className="flex border-b border-navy/10 w-full mb-6 mt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 font-sans transition-colors ${
                    activeTab === "profile" 
                      ? "border-navy text-navy" 
                      : "border-transparent text-navy/40 hover:text-navy/60"
                  }`}
                >
                  프로필 수정
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("archive")}
                  className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 font-sans transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === "archive" 
                      ? "border-navy text-navy" 
                      : "border-transparent text-navy/40 hover:text-navy/60"
                  }`}
                >
                  <Archive size={15} />
                  내 아카이브 ({archives.length})
                </button>
              </div>
            )}

            {/* TAB 1: Profile Edit */}
            {activeTab === "profile" && !selectedArchive && (
              <form onSubmit={handleSave} className="w-full flex flex-col gap-4">
                {/* Profile Image Edit */}
                <div className="flex flex-col items-center gap-3 mb-2 relative mx-auto">
                  <div className="relative w-24 h-24 rounded-full border-2 border-navy overflow-hidden bg-white shadow-sm">
                    <Image src={profileImg} alt="Profile" width={96} height={96} className="object-cover w-full h-full" />
                  </div>
                  <button 
                    type="button"
                    onClick={handleImageChange}
                    className="absolute bottom-0 right-0 bg-point text-white p-2 rounded-full border-2 border-cream shadow-md hover:scale-110 transition-transform"
                  >
                    <Camera size={16} />
                  </button>
                </div>

                {/* Edit Fields */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-sans text-xs font-bold text-navy ml-1">닉네임</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                        <User size={16} />
                      </div>
                      <input 
                        type="text" 
                        value={nickname}
                        onChange={e => setNickname(e.target.value)}
                        placeholder="내 닉네임"
                        className="w-full py-3.5 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point focus:bg-white font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-sans text-xs font-bold text-navy ml-1">전화번호</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                        <Phone size={16} />
                      </div>
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full py-3.5 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point focus:bg-white font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-4 w-full">
                  <button 
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-3.5 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50/50 hover:border-red-200 font-bold text-base rounded-xl transition-all active:scale-[0.98]"
                  >
                    로그아웃
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-3.5 bg-navy text-cream font-bold text-base rounded-xl hover:bg-navy/90 transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(26,42,108,0.2)]"
                  >
                    저장하기
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Archives List */}
            {activeTab === "archive" && !selectedArchive && (
              <div className="w-full flex flex-col items-center">
                {archives.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <Archive size={40} className="text-navy/20 mx-auto mb-3" />
                    <p className="font-sans text-sm text-navy/50 font-medium">아직 저장된 취향표가 없습니다.</p>
                    <p className="font-sans text-xs text-navy/40 mt-1">월드컵을 완료하고 아카이브에 저장해보세요!</p>
                  </div>
                ) : (
                  <div className="w-full max-h-[300px] overflow-y-auto flex flex-col gap-2.5 pr-1">
                    {archives.map((archive: any) => {
                      const tracks = getArchiveTracks(archive);
                      return (
                        <button
                          key={archive.id}
                          type="button"
                          onClick={() => setSelectedArchive(archive)}
                          className="w-full p-4 bg-white/50 border-2 border-navy/15 rounded-2xl hover:border-point hover:bg-white text-left transition-all active:scale-[0.98] flex items-center justify-between group shadow-sm"
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-navy/50" />
                              <span className="font-sans font-bold text-xs text-navy">
                                {new Date(archive.saved_at).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Award size={13} className="text-point shrink-0" />
                              <span className="font-sans font-bold text-sm text-navy truncate">
                                1위: {tracks[0]?.title || "곡 정보 없음"}
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-navy/30 group-hover:text-point transition-colors shrink-0 ml-2" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2 SUBVIEW: Selected Archive Detail */}
            {selectedArchive && (() => {
              const tracks = getArchiveTracks(selectedArchive);
              return (
                <div className="w-full flex flex-col items-center">
                  {/* Back Button and Title */}
                  <div className="flex items-center gap-2 w-full mb-4">
                    <button 
                      type="button"
                      onClick={() => setSelectedArchive(null)}
                      className="text-navy hover:text-point transition-colors bg-navy/5 p-1.5 rounded-full"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <span className="font-sans text-sm text-navy font-bold">
                      {new Date(selectedArchive.saved_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} 기록
                    </span>
                  </div>

                  {/* Track Rankings */}
                  <div className="w-full max-h-[250px] overflow-y-auto flex flex-col gap-2 pr-1 mb-4">
                    {tracks.map((track: any, idx: number) => (
                      <div key={track.id} className="flex items-center gap-3 p-2 bg-white/60 border border-navy/10 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-navy text-cream flex items-center justify-center font-sans font-bold text-[10px] shrink-0 shadow-sm">
                          {idx + 1}
                        </div>
                        {track.albumImage && (
                          <div className="w-9 h-9 rounded-md overflow-hidden relative shrink-0 border border-navy/10">
                            <Image src={track.albumImage} alt={track.title} width={36} height={36} className="object-cover w-full h-full" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 leading-tight">
                          <div className="font-sans font-bold text-xs text-navy truncate">{track.title}</div>
                          <div className="font-sans text-[10px] text-navy/60 truncate">{track.artistName}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 w-full mt-2">
                    <button 
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem("worldcup_ranking", JSON.stringify(tracks));
                        onClose();
                        window.location.href = "/taste";
                      }}
                      className="w-full py-3 bg-navy text-cream font-bold text-sm rounded-xl hover:bg-navy/90 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-1.5"
                    >
                      이 취향표 불러오기 & 공유
                    </button>
                  </div>
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
