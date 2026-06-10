"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from "@/utils/storage";
import { motion, AnimatePresence } from "framer-motion";
import LoginModal from "./LoginModal";

interface BackButtonProps {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function BackButton({ className = "", onClick }: BackButtonProps) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  React.useEffect(() => {
    setMounted(true);
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

      {mounted && createPortal(
        <AnimatePresence>
          {showWarning && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              {/* Backdrop */}
              <motion.div
                className="absolute inset-0 bg-navy/20 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowWarning(false)}
              />
              {/* Modal Content */}
              <div className="p-4 pointer-events-none z-[10000] w-full flex justify-center max-w-[430px] mx-auto">
                <motion.div
                  className="bg-cream w-full max-w-sm rounded-2xl border-2 border-navy p-6 shadow-xl relative pointer-events-auto flex flex-col items-center text-center"
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <button 
                    onClick={() => setShowWarning(false)}
                    className="absolute top-4 right-4 text-navy hover:text-point transition-colors"
                    aria-label="Close modal"
                  >
                    <X size={20} strokeWidth={2} />
                  </button>
                  
                  <h2 className="font-serif text-2xl text-point mb-2 mt-2">안내</h2>
                  <p className="font-sans text-charcoal/80 mb-8 mt-2 leading-relaxed text-sm">
                    로그인을 하지 않은 경우<br/>진행 상황이 저장되지 않을 수 있습니다.<br/><br/>그래도 뒤로 가시겠습니까?
                  </p>
                  
                  <div className="w-full flex flex-col gap-3">
                    <div className="w-full flex gap-3">
                      <button 
                        onClick={() => setShowWarning(false)}
                        className="flex-1 py-3 bg-transparent border-2 border-navy text-navy font-bold rounded-full hover:bg-navy/5 transition-colors text-sm"
                      >
                        취소
                      </button>
                      <button 
                        onClick={confirmBack}
                        className="flex-1 py-3 bg-navy text-cream font-bold rounded-full hover:bg-navy/90 transition-colors text-sm"
                      >
                        뒤로 가기
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => { setShowWarning(false); setIsLoginModalOpen(true); }}
                      className="w-full py-3 bg-point text-white font-bold rounded-full hover:bg-point/90 transition-colors shadow-sm text-sm"
                    >
                      로그인하러 가기
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Embedded Login Modal */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        onSuccess={() => setIsLoginModalOpen(false)} 
      />
    </>
  );
}
