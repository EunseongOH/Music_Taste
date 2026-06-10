"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Provider = "google" | "kakao";

export default function PopupLogin() {
  const [provider, setProvider] = useState<Provider>("google");

  useEffect(() => {
    // Read ?provider= from URL
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("provider");
    const resolvedProvider: Provider =
      raw === "kakao" ? "kakao" : "google";
    setProvider(resolvedProvider);

    const supabase = createClient();
    supabase.auth
      .signInWithOAuth({
        provider: resolvedProvider,
        options: {
          redirectTo: `${window.location.origin}/auth/popup-callback`,
          // Request email scope for Kakao so Supabase gets a stable identifier
          ...(resolvedProvider === "kakao" && {
            scopes: "account_email profile_nickname",
          }),
        },
      })
      .catch((err: any) => {
        console.error("Popup OAuth error:", err);
      });
  }, []);

  const isKakao = provider === "kakao";

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-[#FAF7F2] text-navy">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-6 animate-spin"
        style={{
          border: isKakao ? "3px solid #FEE500" : "3px solid #1a2a6c",
        }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: isKakao ? "#000000" : "#e63946" }}
        />
      </div>
      <h3 className="font-serif text-2xl font-bold mb-2">
        {isKakao ? "카카오 로그인" : "구글 로그인"}
      </h3>
      <p className="font-sans text-sm text-charcoal/60">
        {isKakao
          ? "카카오 로그인 화면으로 이동 중입니다..."
          : "구글 로그인 화면으로 이동 중입니다..."}
      </p>
    </div>
  );
}
