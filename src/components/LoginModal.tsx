"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, User, Phone, Globe, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/utils/supabase/client";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "login" | "signup" | "guest-warning";

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
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

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setLoginError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setLoginError(`구글 로그인 오류: ${error.message}`);
      }
    } catch (err) {
      setLoginError("구글 로그인 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
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
                    <button 
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      className="w-full py-3 bg-white border-2 border-navy/10 text-navy font-semibold rounded-xl hover:border-navy/30 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      <Globe size={18} className="text-[#EA4335]" />
                      구글 간편 로그인
                    </button>
                    <button 
                      type="button"
                      className="w-full py-3 bg-[#FEE500] border-2 border-[#FEE500] text-black/80 font-semibold rounded-xl hover:brightness-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <MessageCircle size={18} className="fill-black/80" />
                      카카오 간편 로그인
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
