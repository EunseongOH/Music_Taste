"use client";

import React, { useState, useEffect } from "react";
import ProfileModal from "./ProfileModal";
import Image from "next/image";

export default function ProfileHeader({ className = "" }: { className?: string }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profileImg, setProfileImg] = useState("https://picsum.photos/seed/user1/100/100");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setIsLoggedIn(sessionStorage.getItem("isGuest") === "false");
    const savedImg = sessionStorage.getItem("userProfileImg");
    if (savedImg) setProfileImg(savedImg);

    // Also listen to a custom event just in case login state changes
    const handleStorageChange = () => {
      setIsLoggedIn(sessionStorage.getItem("isGuest") === "false");
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

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
        onUpdateImg={setProfileImg} 
      />
    </>
  );
}
