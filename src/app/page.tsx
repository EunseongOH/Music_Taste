"use client";

import { useState } from "react";
import LPPlayer from "@/components/LPPlayer";
import LoginModal from "@/components/LoginModal";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <main className="w-full flex flex-1 flex-col items-center justify-between py-6 relative overflow-hidden">
      <div className="flex flex-col items-center justify-center flex-1 w-full text-center z-10 space-y-8 mt-12 md:mt-0">
        <div className="space-y-4">
          <h1 className="font-serif text-6xl md:text-8xl text-navy tracking-tight drop-shadow-sm font-bold">
            Sortify
          </h1>
          <p className="font-sans text-lg md:text-xl text-charcoal/80 max-w-md mx-auto leading-relaxed break-keep mt-2">
            가장 선명한 취향의 기록.<br/>
            당신의 음악 취향을 나열하고, 나만의 색깔로 증폭시켜 보세요.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-10 py-3 bg-navy text-cream rounded-full hover:bg-navy/90 transition-colors font-medium text-lg"
          >
            시작하기
          </button>
        </div>
      </div>

      <div className="w-full flex justify-center mt-auto pt-16 pb-8 z-10">
         <LPPlayer />
      </div>

      <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </main>
  );
}
