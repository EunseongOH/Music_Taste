"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, Send } from "lucide-react";
import {
  submitFeedback,
  FeedbackCooldownError,
  MESSAGE_MIN,
  MESSAGE_MAX,
  type FeedbackKind,
} from "@/utils/feedbackDb";

/**
 * 의견 수집 모달. 계획은 docs/feedback-plan.md.
 *
 * 입력 필드는 셋이 상한이다 — 430px 모바일에서 필드가 늘수록 작성률이 떨어진다.
 * 제목·심각도·재현 절차는 받지 않는다. 대신 아티스트·경로 같은 컨텍스트는
 * 진입점이 `context` 로 넘겨 주고 사용자는 내용만 쓰면 된다.
 *
 * `kind` 를 주면 종류 선택 UI 를 숨긴다(오류 제보 전용 진입점용).
 */

const translations = {
  ko: {
    title: "의견 보내기",
    titleDataError: "곡 정보가 잘못됐나요?",
    kindLabel: "어떤 이야기인가요?",
    kindDataError: "곡·아티스트 정보 오류",
    kindIdea: "이런 기능 있으면 좋겠어요",
    kindService: "그 외 서비스 의견",
    messageLabel: "내용",
    messagePlaceholderDataError: "예: 같은 앨범이 중복해서 나타나요 / 아티스트 사진이 다른 사람이에요",
    messagePlaceholder: "편하게 적어주세요. 짧아도 괜찮아요.",
    emailLabel: "이메일",
    emailOptional: "선택",
    emailPlaceholder: "answer@example.com",
    emailNotice:
      "선택 입력이에요. 적어주시면 의견이 반영됐을 때 알려드리는 용도로만 쓰고, 처리 후 지워요. 안 적으셔도 의견은 그대로 접수돼요.",
    submit: "보내기",
    submitting: "보내는 중...",
    tooShort: `${MESSAGE_MIN}자 이상 적어주세요.`,
    success: "의견 고마워요! 잘 읽어보고 반영할게요.",
    error: "전송에 실패했어요. 잠시 후 다시 시도해 주세요.",
    cooldown: "조금 전에 보내주셨어요. {sec}초 뒤에 다시 보낼 수 있어요.",
    contextArtist: "이 의견에는 아래 정보가 함께 전달돼요",
  },
  en: {
    title: "Send Feedback",
    titleDataError: "Something wrong with this info?",
    kindLabel: "What's this about?",
    kindDataError: "Wrong track or artist info",
    kindIdea: "Feature idea",
    kindService: "Other feedback",
    messageLabel: "Message",
    messagePlaceholderDataError:
      "e.g. The same album shows up twice / The artist photo is someone else",
    messagePlaceholder: "Anything goes. Short is fine.",
    emailLabel: "Email",
    emailOptional: "optional",
    emailPlaceholder: "answer@example.com",
    emailNotice:
      "Optional. We'll use it only to let you know when your feedback is reflected, and delete it afterward. You can leave it blank.",
    submit: "Send",
    submitting: "Sending...",
    tooShort: `Please write at least ${MESSAGE_MIN} characters.`,
    success: "Thanks for the feedback! We'll read it carefully.",
    error: "Failed to send. Please try again in a moment.",
    cooldown: "You just sent one. You can send again in {sec}s.",
    contextArtist: "The following is sent along with your message",
  },
};

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale?: "ko" | "en";
  /** 주면 종류 선택을 숨기고 이 값으로 고정한다. */
  kind?: FeedbackKind;
  /** 진입점이 아는 것. 사용자 입력이 아니다. */
  context?: Record<string, unknown>;
  /** 사용자에게 보여줄 컨텍스트 요약 (예: 아티스트 이름). */
  contextLabel?: string;
  /** 성공 문구를 페이지의 기존 토스트로 띄우고 싶을 때. */
  onSubmitted?: (message: string) => void;
}

/**
 * 열려 있을 때만 마운트된다. 그래서 "닫았다 열면 빈 폼" 을 리셋 코드 없이 얻는다
 * (effect 로 state 를 되돌리면 열 때마다 렌더가 한 번 더 돈다).
 */
function FeedbackForm({
  onClose,
  locale = "ko",
  kind: fixedKind,
  context,
  contextLabel,
  onSubmitted,
}: Omit<FeedbackModalProps, "isOpen">) {
  const t = translations[locale];

  const [kind, setKind] = useState<FeedbackKind>(fixedKind ?? "service");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSubmit = trimmed.length >= MESSAGE_MIN && !isSending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed.length < MESSAGE_MIN) {
      setError(t.tooShort);
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await submitFeedback({ kind, message: trimmed, email, context });
      onSubmitted?.(t.success);
      onClose();
    } catch (err) {
      if (err instanceof FeedbackCooldownError) {
        setError(t.cooldown.replace("{sec}", String(err.secondsLeft)));
      } else {
        setError(t.error);
      }
      setIsSending(false);
    }
  };

  const kindOptions: { id: FeedbackKind; label: string }[] = [
    { id: "data_error", label: t.kindDataError },
    { id: "idea", label: t.kindIdea },
    { id: "service", label: t.kindService },
  ];

  return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            className="bg-[#F5F2ED] w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 overflow-hidden border border-navy/10 flex flex-col"
          >
            <div className="p-6 pb-4 border-b border-navy/5 flex items-center justify-between">
              <h3 className="type-title-1 text-navy">
                {fixedKind === "data_error" ? t.titleDataError : t.title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-2 text-navy/50 hover:text-navy hover:bg-navy/5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
              {!fixedKind && (
                <div className="flex flex-col gap-1.5">
                  <label className="type-sub text-navy/70 ml-1">
                    {t.kindLabel} <span className="text-point">*</span>
                  </label>
                  <div className="flex flex-col gap-2">
                    {kindOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setKind(opt.id)}
                        className={`w-full px-4 py-2.5 rounded-xl border type-body text-left transition-all active:scale-[0.99] ${
                          kind === opt.id
                            ? "bg-navy text-cream border-navy font-semibold shadow-sm"
                            : "bg-white/60 text-navy/70 border-navy/10 hover:border-navy/30"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {contextLabel && (
                <div className="flex flex-col gap-1 bg-navy/5 px-4 py-3 rounded-xl">
                  <p className="type-caption text-navy/70">{t.contextArtist}</p>
                  <p className="type-body-strong text-navy">{contextLabel}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between ml-1 mr-1">
                  <label className="type-sub text-navy/70">
                    {t.messageLabel} <span className="text-point">*</span>
                  </label>
                  <span
                    className={`type-caption tabular-nums ${
                      trimmed.length > MESSAGE_MAX ? "text-danger" : "text-navy/40"
                    }`}
                  >
                    {trimmed.length}/{MESSAGE_MAX}
                  </span>
                </div>
                <textarea
                  required
                  rows={5}
                  maxLength={MESSAGE_MAX}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    kind === "data_error" ? t.messagePlaceholderDataError : t.messagePlaceholder
                  }
                  className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none type-body text-navy placeholder:text-navy/40 resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="type-sub text-navy/70 ml-1">
                  {t.emailLabel}{" "}
                  <span className="text-navy/70">({t.emailOptional})</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none type-body text-navy placeholder:text-navy/40"
                />
                <p className="type-caption text-navy/70 ml-1 break-keep">
                  {t.emailNotice}
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-danger/10 p-3 rounded-xl">
                  <AlertCircle size={15} className="text-danger shrink-0 mt-0.5" />
                  <p className="type-caption text-danger break-keep">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-1 w-full py-3.5 bg-navy text-cream type-body-strong rounded-xl shadow-md hover:bg-navy/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {isSending ? (
                  t.submitting
                ) : (
                  <>
                    <Send size={15} />
                    {t.submit}
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
  );
}

export default function FeedbackModal({ isOpen, ...props }: FeedbackModalProps) {
  return (
    <AnimatePresence>
      {isOpen && <FeedbackForm key="feedback-form" {...props} />}
    </AnimatePresence>
  );
}
