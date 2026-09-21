"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage, getSafeLocale } from "@/utils/storage";
import LoginModal from "./LoginModal";
import { Sheet, primaryButton, dangerButton, textLink } from "./space/SpaceUI";

interface BackButtonProps {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function BackButton({ className = "", onClick }: BackButtonProps) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  React.useEffect(() => {
    setMounted(true);
    setLocale(getSafeLocale());
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/explore");
    }
  };

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onClick) {
      onClick(e);
      return;
    }
    
    // Fallback if sessionStorage is somehow not available
    let isGuest = false;
    try {
      isGuest = sessionStorage.getItem("isGuest") === "true";
    } catch(err) {}

    if (isGuest) {
      setShowWarning(true);
    } else {
      goBack();
    }
  };

  const confirmBack = () => {
    setShowWarning(false);
    goBack();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBackClick}
        className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-full border border-navy/20 text-navy hover:bg-navy/5 transition-colors z-[100] bg-cream/80 backdrop-blur-sm relative pointer-events-auto ${className}`}
        aria-label="Go back"
      >
        <ArrowLeft size={20} />
      </button>

      {/* 헤더의 backdrop-blur 가 fixed 기준을 바꾸므로 body 로 보낸다. */}
      {mounted && createPortal(
        <Sheet
          open={showWarning}
          onClose={() => setShowWarning(false)}
          closeLabel={locale === "en" ? "Stay" : "머무르기"}
          header={
            <>
              <h2 className="type-title-1 text-navy">{locale === "en" ? "Go back?" : "돌아갈까요?"}</h2>
              <p className="type-sub text-navy/70 mt-1 break-keep">
                {locale === "en" ? "Without logging in, the artists and songs you picked aren't saved." : "로그인하지 않으면 고른 아티스트와 곡이 저장되지 않아요."}
              </p>
            </>
          }
          footer={
            <div className="flex flex-col gap-2">
              <button onClick={() => { setShowWarning(false); setIsLoginModalOpen(true); }} className={`${primaryButton} w-full`}>{locale === "en" ? "Log in to save" : "로그인하고 저장하기"}</button>
              <button onClick={confirmBack} className={`${dangerButton} w-full`}>{locale === "en" ? "Go back" : "돌아가기"}</button>
              <button onClick={() => setShowWarning(false)} className={`${textLink} self-center mt-2`}>{locale === "en" ? "Stay" : "머무르기"}</button>
            </div>
          }
        />,
        document.body
      )}

      {/* Embedded Login Modal */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        locale={locale}
        onSuccess={() => setIsLoginModalOpen(false)} 
      />
    </>
  );
}
