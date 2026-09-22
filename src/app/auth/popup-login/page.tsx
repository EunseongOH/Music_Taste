"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";

type Provider = "google" | "kakao";

export default function PopupLogin() {
  const [provider, setProvider] = useState<Provider>("google");
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    // Read ?provider= from URL
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("provider");
    const resolvedProvider: Provider =
      raw === "kakao" ? "kakao" : "google";
    setProvider(resolvedProvider);

    // Read locale
    setLocale(getSafeLocale());

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
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-[#FAF7F2] newtone:bg-cream text-navy">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-6 animate-spin"
        style={{
          // 카카오는 브랜드 색(예외). 구글 쪽은 서비스 잉크색 — 테마를 따른다
          border: isKakao ? "3px solid #FEE500" : "3px solid var(--t-navy)",
        }}
      >
        {/* 구글 쪽 점: legacy 는 전과 같은 빨강, 새 테마는 brand */}
        <div className={`w-2 h-2 rounded-full ${isKakao ? "bg-[#000000]" : "bg-[#e63946] newtone:bg-brand"}`} />
      </div>
      <h3 className="text-2xl font-bold mb-2">
        {isKakao 
          ? (locale === "en" ? "Kakao Login" : "카카오 로그인")
          : (locale === "en" ? "Google Login" : "구글 로그인")}
      </h3>
      <p className="font-sans text-sm text-charcoal/60">
        {isKakao
          ? (locale === "en" ? "Redirecting to Kakao login screen..." : "카카오 로그인 화면으로 이동하고 있어요...")
          : (locale === "en" ? "Redirecting to Google login screen..." : "구글 로그인 화면으로 이동하고 있어요...")}
      </p>
    </div>
  );
}
