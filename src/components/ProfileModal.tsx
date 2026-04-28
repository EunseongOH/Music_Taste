"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, User, Phone, Mail } from "lucide-react";
import { createPortal } from "react-dom";
import Image from "next/image";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateImg: (img: string) => void;
}

export default function ProfileModal({ isOpen, onClose, onUpdateImg }: ProfileModalProps) {
  const [profileImg, setProfileImg] = useState("https://picsum.photos/seed/user1/100/100");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (isOpen) {
      const savedImg = sessionStorage.getItem("userProfileImg");
      if (savedImg) setProfileImg(savedImg);
      
      const savedNickname = sessionStorage.getItem("userNickname");
      if (savedNickname) setNickname(savedNickname);

      const savedPhone = sessionStorage.getItem("userPhone");
      if (savedPhone) setPhone(savedPhone);
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
            
            <h2 className="font-serif text-2xl text-navy mb-6 tracking-tight">프로필 수정</h2>
            
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

              <button 
                type="submit"
                className="w-full py-3.5 mt-4 bg-navy text-cream font-bold text-lg rounded-xl hover:bg-navy/90 transition-colors shadow-[0_4px_15px_rgba(26,42,108,0.2)]"
              >
                저장하기
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body
  ) : null;
}
