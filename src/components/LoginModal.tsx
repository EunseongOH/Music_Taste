"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, User, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from "@/utils/storage";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locale?: "ko" | "en";
}

type Mode = "login" | "signup" | "guest-warning";

export default function LoginModal({ isOpen, onClose, onSuccess, locale = "ko" }: LoginModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  // Form State
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");

  const [signupId, setSignupId] = useState("");
  const [signupPw, setSignupPw] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupNickname, setSignupNickname] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [pwError, setPwError] = useState("");

  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize Supabase client inside the component or outside
  const { user } = useAuth(); // If we want to detect if already logged in, but not strictly needed here since modal usually shows when not logged in.
  const supabase = createClient();

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setMode("login");
        setLoginId(""); setLoginPw("");
        setSignupId(""); setSignupPw(""); setSignupName(""); setSignupNickname(""); setSignupPhone(""); setPwError("");
        setLoginError(""); setSignupError("");
      }, 300);
    }
  }, [isOpen]);

  // Centered Popup Google Auth Message Listener
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      const { type, session, error } = event.data || {};
      
      if (type === "AUTH_SUCCESS" && session) {
        setIsLoading(true);
        try {
          // 1. Set the session in the client's in-memory Supabase client
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          });

          if (sessionError) throw sessionError;

          // 2. Save necessary info to storage
          sessionStorage.setItem("isGuest", "false");
          sessionStorage.setItem("userNickname", session.user?.user_metadata?.nickname || "User");
          
          handleSuccess();
        } catch (err: any) {
          console.error("Failed to apply popup session:", err);
          setLoginError(`로그인 처리 중 오류: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      } else if (type === "AUTH_ERROR") {
        setLoginError(error || "구글 로그인 중 오류가 발생했습니다.");
        setIsLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isOpen, supabase]);

  const validatePassword = (pw: string) => {
    if (pw.length > 14) return "비밀번호는 14자리 이내여야 합니다.";
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "영어와 숫자를 포함해야 합니다.";
    return "";
  };

  const handleSignupPwChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSignupPw(val);
    if (val.length > 0) {
      setPwError(validatePassword(val));
    } else {
      setPwError("");
    }
  };

  const handleSuccess = () => {
    window.dispatchEvent(new Event("storage"));
    onClose();
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/explore");
    }
  };

  const onLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId || !loginPw) return;
    setIsLoading(true);
    setLoginError("");
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginId,
      password: loginPw,
    });

    setIsLoading(false);

    if (error) {
      setLoginError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    sessionStorage.setItem("isGuest", "false");
    sessionStorage.setItem("userNickname", data.user?.user_metadata?.nickname || "User");
    handleSuccess();
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setLoginError("");
    
    // Open the popup login page in a centered window
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      "/auth/popup-login?provider=google",
      "Google Login",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      setLoginError("팝업 차단이 감지되었습니다. 팝업 허용 후 다시 시도해주세요.");
      setIsLoading(false);
    }
  };

  const handleKakaoLogin = () => {
    setIsLoading(true);
    setLoginError("");

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "/auth/popup-login?provider=kakao",
      "Kakao Login",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      setLoginError("팝업 차단이 감지되었습니다. 팝업 허용 후 다시 시도해주세요.");
      setIsLoading(false);
    }
  };

  const onSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errorMsg = validatePassword(signupPw);
    if (errorMsg) {
      setPwError(errorMsg);
      return;
    }
    if (!signupId || !signupPw || !signupName || !signupNickname) return;
    
    setIsLoading(true);
    setSignupError("");

    // Check if nickname already exists in database results
    const { data: dupData, error: dupError } = await supabase
      .from("tournament_results")
      .select("id")
      .eq("user_nickname", signupNickname.trim());

    if (!dupError && dupData && dupData.length > 0) {
      setSignupError("이미 사용 중인 닉네임입니다.");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: signupId,
      password: signupPw,
      options: {
        data: {
          name: signupName,
          nickname: signupNickname.trim(),
          phone: signupPhone || null,
        }
      }
    });

    setIsLoading(false);

    if (error) {
      if (error.status === 422 || error.message.includes("already registered")) {
        setSignupError("이미 가입된 이메일입니다.");
      } else {
        setSignupError("회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
      return;
    }

    // Success
    sessionStorage.setItem("isGuest", "false");
    sessionStorage.setItem("userNickname", signupNickname);
    handleSuccess();
  };

  const confirmGuest = () => {
    sessionStorage.setItem("isGuest", "true");
    sessionStorage.removeItem("userNickname");
    handleSuccess();
  };

  const handleGuest = () => {
    setMode("guest-warning");
  };

  return (
    <AnimatePresence>
// ... omitted unchanged part, wait, I MUST provide ALL lines between StartLine and EndLine. I will just provide the full replacement for the form.
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4 sm:p-6">
            <motion.div
              className="bg-cream w-full max-w-sm max-h-[90vh] overflow-y-auto scrollbar-none rounded-[2rem] border-[3px] border-navy p-6 sm:p-8 shadow-2xl relative pointer-events-auto flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <button 
                onClick={onClose}
                className="absolute top-5 right-5 text-navy hover:text-point transition-colors bg-navy/5 p-1.5 rounded-full"
                aria-label="Close modal"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
              
              <div className="w-12 h-12 rounded-full border-[3px] border-navy flex items-center justify-center mb-4 mt-2 shadow-[4px_4px_0_rgba(26,42,108,0.1)]">
                <div className="w-4 h-4 bg-point rounded-full border-2 border-navy" />
              </div>
              
              <h2 className="font-serif text-3xl font-bold text-navy mb-1 tracking-tight">Sortify</h2>
              <p className="font-sans text-charcoal/60 mb-6 text-sm font-medium">
                {mode === "login" ? "가장 선명한 취향의 기록" : 
                 mode === "signup" ? "새로운 레코드 샵에 오신 것을 환영해요" :
                 "게스트로 진행 안내"}
              </p>

              {/* Login Form */}
              {mode === "login" && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  className="w-full flex flex-col gap-4"
                >
                  <form onSubmit={onLoginSubmit} className="flex flex-col gap-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                        <Mail size={18} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="이메일 (아이디)" 
                        value={loginId}
                        onChange={e => setLoginId(e.target.value)}
                        required
                        className="w-full py-3.5 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point focus:bg-white font-sans text-navy placeholder:text-navy/40 transition-colors"
                      />
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                        <Lock size={18} />
                      </div>
                      <input 
                        type="password" 
                        placeholder="비밀번호" 
                        value={loginPw}
                        onChange={e => setLoginPw(e.target.value)}
                        required
                        className="w-full py-3.5 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point focus:bg-white font-sans text-navy placeholder:text-navy/40 transition-colors"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={!loginId || !loginPw || isLoading}
                      className="w-full py-3.5 mt-2 bg-navy text-cream font-bold text-lg rounded-xl hover:bg-navy/90 transition-colors shadow-[0_4px_15px_rgba(26,42,108,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? "로그인 중..." : "로그인"}
                    </button>
                    {loginError && <div className="text-center text-sm font-bold text-red-500 mt-1">{loginError}</div>}
                  </form>

                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-navy/10" />
                    <span className="font-sans text-xs text-navy/40 font-bold uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-navy/10" />
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {/* Google Login Button — Official Brand Guideline (Light Theme) */}
                    <button 
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      className="gsi-material-button w-full disabled:opacity-50"
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #747775",
                        borderRadius: "4px",
                        boxSizing: "border-box",
                        color: "#1F1F1F",
                        cursor: "pointer",
                        fontFamily: "'Roboto', Arial, sans-serif",
                        fontSize: "14px",
                        fontWeight: 500,
                        height: "40px",
                        letterSpacing: "0.25px",
                        outline: "none",
                        overflow: "hidden",
                        padding: "0 12px",
                        position: "relative",
                        textAlign: "center",
                        transition: "background-color .218s, border-color .218s, box-shadow .218s",
                        verticalAlign: "middle",
                        whiteSpace: "nowrap",
                        width: "100%",
                        userSelect: "none",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 2px 0 rgba(60,64,67,.30), 0 1px 3px 1px rgba(60,64,67,.15)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = "";
                      }}
                    >
                      <div style={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "row",
                        flexWrap: "nowrap",
                        height: "100%",
                        justifyContent: "center",
                        position: "relative",
                        width: "100%",
                        gap: "10px",
                      }}>
                        {/* Official Google G logo SVG */}
                        <div style={{ height: "20px", minWidth: "20px", width: "20px", flexShrink: 0 }}>
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            <path fill="none" d="M0 0h48v48H0z" />
                          </svg>
                        </div>
                        <span style={{
                          flexGrow: 1,
                          fontFamily: "'Roboto', Arial, sans-serif",
                          fontWeight: 500,
                          fontSize: "14px",
                          letterSpacing: "0.25px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textAlign: "center",
                        }}>
                          {locale === "ko" ? "Google 계정으로 로그인" : "Sign in with Google"}
                        </span>
                      </div>
                    </button>

                    {/* Kakao Login Button — Official Brand Guideline */}
                    <button 
                      type="button"
                      onClick={handleKakaoLogin}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center bg-[#FEE500] text-[#000000D9] font-bold hover:brightness-95 active:brightness-90 transition-all disabled:opacity-50 shadow-sm"
                      style={{
                        borderRadius: "12px",
                        height: "48px",
                        border: "none",
                        padding: "0 16px",
                        fontSize: "16px",
                        letterSpacing: "0",
                        cursor: "pointer",
                      }}
                    >
                      {/* Kakao official speech-bubble symbol SVG */}
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "24px",
                          height: "24px",
                          flexShrink: 0,
                          marginRight: "8px",
                        }}
                        aria-hidden="true"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="24"
                          height="24"
                          fill="#000000"
                          aria-hidden="true"
                        >
                          <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.747 1.655 5.158 4.125 6.593L5.1 21l4.492-2.196c.786.148 1.58.224 2.408.224 5.523 0 10-3.477 10-7.778C22 6.95 17.523 3 12 3z" />
                        </svg>
                      </span>
                      <span style={{ fontFamily: "inherit" }}>
                        {locale === "ko" ? "카카오 로그인" : "Login with Kakao"}
                      </span>
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 items-center text-sm font-sans">
                    <button type="button" onClick={() => setMode("signup")} className="text-navy hover:text-point font-bold underline-offset-4 hover:underline transition-all">
                      계정이 없으신가요? 회원가입
                    </button>
                    <button type="button" onClick={handleGuest} className="text-charcoal/50 hover:text-charcoal transition-colors">
                      가입 없이 게스트로 구경하기
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Signup Form */}
              {mode === "signup" && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  className="w-full flex flex-col gap-4 text-left"
                >
                  <form onSubmit={onSignupSubmit} className="flex flex-col gap-3">
                    {/* ID */}
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-xs font-bold text-navy ml-1">아이디 (이메일) <span className="text-point">*</span></label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                          <Mail size={16} />
                        </div>
                        <input 
                          type="email" 
                          placeholder="sortify@example.com" 
                          value={signupId}
                          onChange={e => setSignupId(e.target.value)}
                          required
                          className="w-full py-3 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                        />
                      </div>
                    </div>
                    
                    {/* PW */}
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-xs font-bold text-navy ml-1">비밀번호 <span className="text-point">*</span></label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                          <Lock size={16} />
                        </div>
                        <input 
                          type="password" 
                          placeholder="영어+숫자 포함 최대 14자" 
                          value={signupPw}
                          onChange={handleSignupPwChange}
                          required
                          maxLength={14}
                          className={`w-full py-3 pl-11 pr-4 bg-white/50 border-2 rounded-xl focus:outline-none font-sans text-sm text-navy placeholder:text-navy/30 transition-colors ${pwError ? 'border-red-400 focus:border-red-500' : 'border-navy/20 focus:border-point'}`}
                        />
                      </div>
                      {pwError && <span className="text-[10px] text-red-500 font-bold ml-1">{pwError}</span>}
                    </div>

                    {/* Name */}
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-xs font-bold text-navy ml-1">이름 <span className="text-point">*</span></label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                          <User size={16} />
                        </div>
                        <input 
                          type="text" 
                          placeholder="홍길동" 
                          value={signupName}
                          onChange={e => setSignupName(e.target.value)}
                          required
                          className="w-full py-3 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Nickname */}
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-xs font-bold text-navy ml-1">닉네임 <span className="text-point">*</span></label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                          <User size={16} />
                        </div>
                        <input 
                          type="text" 
                          placeholder="레코드 러버" 
                          value={signupNickname}
                          onChange={e => setSignupNickname(e.target.value)}
                          required
                          className="w-full py-3 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Phone (Optional) */}
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-xs font-bold text-navy ml-1">전화번호 (선택)</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-navy/40">
                          <Phone size={16} />
                        </div>
                        <input 
                          type="tel" 
                          placeholder="010-0000-0000" 
                          value={signupPhone}
                          onChange={e => setSignupPhone(e.target.value)}
                          className="w-full py-3 pl-11 pr-4 bg-white/50 border-2 border-navy/20 rounded-xl focus:outline-none focus:border-point font-sans text-sm text-navy placeholder:text-navy/30 transition-colors"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={!signupId || !signupPw || !signupName || !!pwError || isLoading}
                      className="w-full py-3.5 mt-4 bg-navy text-cream font-bold text-lg rounded-xl hover:bg-navy/90 transition-colors shadow-[0_4px_15px_rgba(26,42,108,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? "가입 중..." : "가입 완료하기"}
                    </button>
                    {signupError && <div className="text-center text-sm font-bold text-red-500 mt-1">{signupError}</div>}
                  </form>

                  <div className="mt-2 flex justify-center text-sm font-sans pt-2 border-t border-navy/10">
                    <span className="text-charcoal/60 mr-2">이미 계정이 있으신가요?</span>
                    <button type="button" onClick={() => setMode("login")} className="text-navy hover:text-point font-bold underline-offset-4 hover:underline transition-all">
                      로그인
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Guest Warning */}
              {mode === "guest-warning" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  className="w-full flex flex-col items-center gap-6 mt-4 text-center"
                >
                  <p className="font-sans text-charcoal/80 text-sm leading-relaxed whitespace-pre-wrap">
                    로그인하지 않아도 전체 트랙 디깅과<br/>월드컵 진행이 가능합니다.<br/><br/>원활한 진행을 위해 가급적 로그인을 권장드리며, 페이지를 벗어날 시 진행 상황이 사라질 수 있습니다.
                  </p>
                  
                  <div className="flex flex-col gap-3 w-full">
                    <button 
                      onClick={confirmGuest}
                      className="w-full py-3.5 bg-navy text-cream font-bold text-lg rounded-xl hover:bg-navy/90 transition-colors shadow-md"
                    >
                      게스트로 계속하기
                    </button>
                    <button 
                      onClick={() => setMode("login")}
                      className="w-full py-3 bg-white text-navy font-bold rounded-xl border-2 border-navy/20 hover:bg-navy/5 transition-colors"
                    >
                      로그인하러 가기
                    </button>
                  </div>
                </motion.div>
              )}

            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
