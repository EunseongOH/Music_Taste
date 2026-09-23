"use client";

import React, { useState } from "react";
import { Sheet, dangerButton, secondaryButton } from "@/components/space/SpaceUI";
import { createClient } from "@/utils/supabase/client";

/**
 * 회원 탈퇴. 세 단계로 나눈다.
 *
 * 단계를 늘려 붙잡으려는 것이 아니다. 되돌릴 수 없는 일이라 삭제 범위를 먼저
 * 보여주고, 마지막에 닉네임을 받아 오조작을 막는다.
 *
 * 문구는 짧게 쓴다. 설명이 길어지면 정작 읽어야 할 삭제 범위가 묻힌다.
 * 이유는 통계로만 쌓는다(account_deletion_reasons 에 계정 칸이 없다).
 *
 * 아래 삭제·보존 목록은 실제 FK 규칙과 맞춘 것이다(2026-09-23 확인).
 *   CASCADE  tournament_results · listen_later_tracks · tournament_drafts · profiles
 *   SET NULL unreleased_tracks · sort_challenges · feedback
 *   sort_challenge_entries 는 FK 가 없어 서버가 닉네임만 지운다.
 */

const REASONS = [
  "쓸 일이 없어요",
  "원하는 아티스트나 곡이 없어요",
  "쓰기 불편해요",
  "계정을 새로 만들고 싶어요",
  "개인정보가 걱정돼요",
  "그 밖의 이유",
] as const;

export default function DeleteAccountSheet({
  open,
  onClose,
  nickname,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  /** 3단계에서 그대로 적어야 하는 이름 */
  nickname: string;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (busy) return;
    setStep(1); setReason(""); setDetail(""); setTyped(""); setError("");
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      // 토스 빌드는 다른 출처로 부르느라 쿠키가 실리지 않는다. 토큰을 직접 얹는다.
      const { data: { session } } = await createClient().auth.getSession();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ reason, detail }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "탈퇴하지 못했어요.");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  const header = (
    <>
      <h2 className="type-title-2 text-navy">{step === 3 ? "마지막 확인" : "탈퇴하기"}</h2>
      <p className="type-caption text-navy/70 mt-0.5">{step} / 3</p>
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      closeLabel="닫기"
      header={header}
      footer={
        <div className="flex flex-col gap-2">
          {error && <p role="alert" className="type-caption text-danger">{error}</p>}
          {step === 1 && (
            <button type="button" onClick={() => setStep(2)} className={`${dangerButton} w-full`}>
              계속 탈퇴하기
            </button>
          )}
          {step === 2 && (
            <button type="button" onClick={() => setStep(3)} className={`${dangerButton} w-full`}>
              계속 탈퇴하기
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={submit}
              disabled={busy || typed.trim() !== nickname.trim() || !nickname.trim()}
              className={`${dangerButton} w-full disabled:opacity-40 disabled:pointer-events-none`}
            >
              {busy ? "탈퇴하는 중이에요" : "탈퇴하기"}
            </button>
          )}
          <button type="button" onClick={close} disabled={busy} className={`${secondaryButton} w-full`}>
            돌아가기
          </button>
        </div>
      }
    >
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="type-body-strong text-navy">삭제되는 정보</h3>
            <ul className="mt-2 flex flex-col gap-1 type-caption text-navy/70">
              <li>저장한 취향표</li>
              <li>들어볼 곡</li>
              <li>진행 중인 소트</li>
              <li>닉네임과 프로필 사진</li>
            </ul>
          </div>
          <div>
            <h3 className="type-body-strong text-navy">남는 정보</h3>
            <ul className="mt-2 flex flex-col gap-1 type-caption text-navy/70">
              {/* 남의 화면에 이미 들어가 있는 것들이다. 지우면 그 사람 것이 바뀐다. */}
              <li className="break-keep">등록한 미발매곡은 등록자 정보 없이 남아요.</li>
              <li className="break-keep">
                같이 소트한 순위는 다른 참여자의 결과를 유지하기 위해 남고, 내 이름만 삭제돼요.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="type-body-strong text-navy">
              탈퇴하는 이유를 알려주실래요? <span className="text-navy/70 font-normal">(선택)</span>
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(reason === r ? "" : r)}
                  aria-pressed={reason === r}
                  className={`min-h-[36px] px-3 rounded-full type-caption cursor-pointer transition-colors ${
                    reason === r ? "bg-navy text-cream" : "bg-navy/5 text-navy/80 hover:bg-navy/10"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason && (
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="더 하고 싶은 말이 있다면 적어 주세요."
                className="w-full mt-3 p-3 rounded-2xl bg-cream border border-navy/15 text-navy type-caption placeholder:text-navy/50 focus:outline-2 focus:outline-[var(--t-point-ink)] resize-none"
              />
            )}
            <p className="type-caption text-navy/70 mt-2 break-keep">
              서비스를 개선하는 데만 참고해요. 계정과 연결해 저장하지 않아요.
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="type-body text-navy break-keep">정말 탈퇴할까요?</p>
          <p className="type-caption text-navy/70 break-keep">삭제된 취향표와 기록은 복구할 수 없어요.</p>
          <p className="type-caption text-navy/70 break-keep">
            잠시 쉬고 싶다면 로그아웃만 해도 돼요. 기록은 그대로 남아 있어요.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          <p className="type-body text-navy break-keep">
            탈퇴하려면 닉네임 <strong>{nickname}</strong>을 입력해 주세요.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label="닉네임 확인"
            className="w-full h-12 px-4 rounded-2xl bg-cream border border-navy/15 text-navy type-body placeholder:text-navy/50 focus:outline-2 focus:outline-[var(--t-point-ink)]"
            placeholder={nickname}
          />
          <p className="type-caption text-navy/70">입력하면 탈퇴 버튼이 활성화돼요.</p>
        </div>
      )}
    </Sheet>
  );
}
