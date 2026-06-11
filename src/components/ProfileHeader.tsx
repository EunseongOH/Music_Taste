"use client";

import React, { useState, useEffect } from "react";
import ProfileModal from "./ProfileModal";
import LoginModal from "./LoginModal";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";

export default function ProfileHeader({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [customProfileImg, setCustomProfileImg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setCustomProfileImg(user.user_metadata.avatar_url);
      sessionStorage.setItem("userProfileImg", user.user_metadata.avatar_url);
    } else {
      const savedImg = sessionStorage.getItem("userProfileImg");
      if (savedImg) setCustomProfileImg(savedImg);
      else setCustomProfileImg(null);
    }
  }, [user]);

  const isLoggedIn = !!user;
  const profileImg = customProfileImg || user?.user_metadata?.avatar_url || "/default-profile.png";

  if (!isLoggedIn) {
    return (
      <>
        <button
          onClick={() => setIsLoginOpen(true)}
          className={`px-4 py-1.5 border border-navy/20 text-navy hover:border-point hover:text-point bg-white/85 backdrop-blur-sm rounded-full text-xs font-sans font-bold transition-all duration-200 cursor-pointer shadow-sm hover:shadow active:scale-95 z-50 ${className}`}
        >
          {locale === "ko" ? "로그인" : "Log In"}
        </button>

        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          locale={locale}
        />
      </>
    );
  }

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className={`z-50 w-10 h-10 shrink-0 rounded-full border border-navy/20 overflow-hidden shadow-sm hover:border-point transition-colors bg-white ${className}`}
        aria-label="Edit Profile"
      >
        <Image src={profileImg} alt="Profile" width={40} height={40} className="object-cover w-full h-full" />
      </button>

      <ProfileModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onUpdateImg={setCustomProfileImg} 
      />
    </>
  );
}

