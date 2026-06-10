"use client";

import React, { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export default function PopupLogin() {
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/popup-callback`,
      },
    }).catch((err: any) => {
      console.error("Popup OAuth error:", err);
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-[#FAF7F2] text-navy">
      <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-6 animate-spin">
        <div className="w-2 h-2 bg-point rounded-full" />
      </div>
      <h3 className="font-serif text-2xl font-bold mb-2">구글 간편 로그인</h3>
      <p className="font-sans text-sm text-charcoal/60">구글 로그인 화면으로 이동 중입니다...</p>
    </div>
  );
}
