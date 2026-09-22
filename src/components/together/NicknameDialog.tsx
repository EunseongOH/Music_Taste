"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { NICKNAME_ERROR_TEXT, saveNickname, validateNickname } from "@/utils/nickname";
import { rememberNickname, rememberedNickname } from "@/utils/togetherDb";
import { primaryButton } from "@/components/space/SpaceUI";

/**
 * 같이 소트하기에서 쓰는 이름을 묻는 창. 문서: docs/together-sort.md
 *
 * 방을 만들 때와 참여할 때 같은 창을 쓴다. 입력이 있는 창이라 하단 시트가 아니라
 * **중앙 팝업**이다 — 키보드가 올라오면 하단 시트는 가려진다(dialogs.md).
 *
 * 이름이 이미 있는 사람에게는 띄우지 않는다. 판정은 `needsNickname()` 이다.
 * 로그인 사용자가 여기서 이름을 넣으면 계정 닉네임도 함께 바뀐다(공유할 때 한 번
 * 묻는 흐름과 같은 규칙 — `saveNickname`).
 */

/** 이름을 물어야 하는가. 로그인+닉네임 확정이거나 기기에 기억된 이름이 있으면 묻지 않는다. */
export function needsNickname(user: { user_metadata?: { nickname_confirmed?: boolean } } | null): boolean {
  if (user) return user.user_metadata?.nickname_confirmed !== true;
  return !rememberedNickname().trim();
}

export default function NicknameDialog({
  open,
  onClose,
  onDone,
  /** 참여자는 이름이 필수다 — 건너뛰기를 주지 않는다. */
  skipLabel,
  confirmLabel,
  title,
  desc,
}: {
  open: boolean;
  onClose: () => void;
  /** 확인했을 때. 이름이 정해졌으면 그 이름, 건너뛰었으면 null. */
  onDone: (nickname: string | null) => void | Promise<void>;
  skipLabel?: string;
  confirmLabel: string;
  /*
   * 제목과 설명은 부르는 쪽이 준다. 방을 만드는 사람과 초대받은 사람은 이 이름이
   * 어디에 어떻게 쓰일지가 달라서, 같은 말로 물으면 둘 중 한쪽에는 거짓이 된다.
   */
  title?: string;
  desc?: string;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 창이 열릴 때 지금 쓰는 이름으로 채운다.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() =>
      setName((prev) => prev || (user?.user_metadata?.nickname as string | undefined) || rememberedNickname())
    );
    return () => cancelAnimationFrame(id);
  }, [open, user]);

  if (!open) return null;

  const confirm = async () => {
    const value = name.trim();
    const bad = validateNickname(value);
    if (bad) {
      setError(NICKNAME_ERROR_TEXT.ko[bad]);
      return;
    }
    setBusy(true);
    if (user) {
      const saved = await saveNickname(value);
      if (saved !== "ok") {
        setBusy(false);
        setError(NICKNAME_ERROR_TEXT.ko[saved]);
        return;
      }
    } else {
      rememberNickname(value);
    }
    await onDone(value);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="bg-cream w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 border border-navy/10 flex flex-col p-6 gap-3"
      >
        <h3 className="type-title-1 text-navy break-keep">{title ?? "어떤 이름으로 할까요?"}</h3>
        <p className="type-sub text-navy/70 break-keep">
          {desc ?? "일치율 화면에서 서로를 이 이름으로 봐요."}
          {user ? " 처음 한 번만 확인해요. 프로필 닉네임도 이 이름으로 바뀌어요." : ""}
        </p>
        <input
          id="together-nickname"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
          maxLength={12}
          placeholder="리스너"
          className="h-12 px-4 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none type-body text-navy placeholder:text-navy/40"
        />
        {error && <p className="type-caption text-danger">{error}</p>}
        <button onClick={confirm} disabled={busy} className={`${primaryButton} w-full mt-1`}>
          {busy ? "잠시만요" : confirmLabel}
        </button>
        {skipLabel && (
          <button
            onClick={async () => {
              setBusy(true);
              await onDone(null);
              setBusy(false);
            }}
            disabled={busy}
            className="type-caption text-navy/70 cursor-pointer"
          >
            {skipLabel}
          </button>
        )}
      </motion.div>
    </div>
  );
}
