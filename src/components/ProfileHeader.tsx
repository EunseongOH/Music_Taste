"use client";

import React, { useState, useEffect } from "react";
import ProfileModal from "./ProfileModal";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";

export default function ProfileHeader({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [customProfileImg, setCustomProfileImg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const savedImg = sessionStorage.getItem("userProfileImg");
    if (savedImg) setCustomProfileImg(savedImg);
  }, []);

  const isLoggedIn = !!user;
  const profileImg = customProfileImg || user?.user_metadata?.avatar_url || "https://picsum.photos/seed/user1/100/100";

  if (!isLoggedIn) return null;

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
