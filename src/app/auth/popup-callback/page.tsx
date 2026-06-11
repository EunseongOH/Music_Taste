"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";

export default function PopupCallback() {
  const processedRef = useRef(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    // Read locale
    const resolvedLocale = getSafeLocale();
    setLocale(resolvedLocale);

    if (processedRef.current) return;
    processedRef.current = true;

    const exchangeCode = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      
      try {
        const supabase = createClient();
        let session = null;
        
        // 1. Check if Supabase client has already parsed the implicit session from hash fragment
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          session = sessionData.session;
        }
        
        // 2. If no session, check URL hash manually as fallback (standard in implicit OAuth redirects)
        if (!session && typeof window !== "undefined" && window.location.hash) {
          const hash = window.location.hash.substring(1);
          // URLSearchParams expects query format, which matches the OAuth redirect hash perfectly (access_token=...&refresh_token=...)
          const hashParams = new URLSearchParams(hash);
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          
          if (accessToken && refreshToken) {
            const { data: setSessionData, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (setSessionError) throw setSessionError;
            session = setSessionData.session;
          }
        }
        
        // 3. If still no session, try exchanging the PKCE code if present (fallback to code flow)
        if (!session && code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          session = exchangeData.session;
        }

        if (!session) {
          throw new Error(resolvedLocale === "en" ? "Failed to find authentication session. Please try again." : "인증 세션을 찾을 수 없어요. 다시 시도해 주세요.");
        }
        
        if (window.opener) {
          window.opener.postMessage({ type: "AUTH_SUCCESS", session }, window.location.origin);
        } else {
          throw new Error(resolvedLocale === "en" ? "Failed to find the parent window or the session has expired." : "상위 창을 찾을 수 없거나 세션이 만료되었어요.");
        }
      } catch (err: any) {
        console.error("Callback session exchange failed:", err);
        if (window.opener) {
          window.opener.postMessage({
            type: "AUTH_ERROR",
            error: err?.message || (resolvedLocale === "en" ? "An error occurred during authentication." : "로그인 중 오류가 발생했어요.")
          }, window.location.origin);
        }
      } finally {
        window.close();
      }
    };

    exchangeCode();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-[#FAF7F2] text-navy">
      <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-6 animate-pulse">
        <div className="w-4 h-4 bg-point rounded-full" />
      </div>
      <h3 className="font-serif text-2xl font-bold mb-2">
        {locale === "en" ? "Authenticating..." : "로그인을 완료하고 있어요"}
      </h3>
      <p className="font-sans text-sm text-charcoal/60">
        {locale === "en" ? "Finishing login safely..." : "안전하게 로그인을 완료하고 있어요..."}
      </p>
    </div>
  );
}
