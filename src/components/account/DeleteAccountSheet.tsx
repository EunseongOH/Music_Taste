"use client";

import React, { useState } from "react";
import { Sheet, dangerButton, secondaryButton } from "@/components/space/SpaceUI";

/**
 * 회원 탈퇴 — 세 단계.
 *
 * 되돌릴 수 없는 일이라 한 번에 끝나지 않게 한다. 다만 **막는 것이 목적이 아니다** —
 * 지우겠다는 사람을 붙잡으려고 단계를 늘리면 그건 어둠의 설계다. 단계마다
 * "무엇이 사라지고 무엇이 남는지"를 말해 주는 것이 목적이다.
 *
 *   1) 무엇이 지워지는지 보여주고, 이유를 고른다(고르지 않아도 넘어갈 수 있다)
 *   2) 정말 지울지 한 번 더 묻는다
 *   3) 닉네임을 직접 적어야 버튼이 열린다 — 손이 미끄러져 지워지는 일이 없게
 *
 * 이유는 통계로만 쌓고 계정과 연결하지 않는다(account_deletion_reasons 에 user 칸이 없다).
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
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, detail }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "지우지 못했어요.");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "지우지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  const header = (
    <>
      <h2 className="type-title-2 text-navy">
        {step === 3 ? "마지막 확인이에요" : "탈퇴하기"}
      </h2>
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
              다음
            </button>
          )}
          {step === 2 && (
            <button type="button" onClick={() => setStep(3)} className={`${dangerButton} w-full`}>
              네, 지울게요
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={submit}
              disabled={busy || typed.trim() !== nickname.trim() || !nickname.trim()}
              className={`${dangerButton} w-full disabled:opacity-40 disabled:pointer-events-none`}
            >
              {busy ? "지우는 중이에요" : "탈퇴하기"}
            </button>
          )}
          <button type="button" onClick={close} disabled={busy} className={`${secondaryButton} w-full`}>
            그만두기
          </button>
        </div>
      }
    >
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="type-body-strong text-navy">지워지는 것</h3>
            <ul className="mt-2 flex flex-col gap-1 type-caption text-navy/70">
              <li>· 내가 만든 취향표 전부</li>
              <li>· 들어볼 곡 목록</li>
              <li>· 진행 중이던 소트</li>
              <li>· 계정 정보(닉네임·프로필 사진)</li>
            </ul>
          </div>
          <div>
            <h3 className="type-body-strong text-navy">남는 것</h3>
            <ul className="mt-2 flex flex-col gap-1 type-caption text-navy/70">
              {/* 남의 화면에 이미 들어가 있는 것들이다. 지우면 그 사람 것이 바뀐다. */}
              <li>· 내가 등록한 미발매곡 — 등록자 표시만 지워져요</li>
              <li>· 같이 소트하기 방과 그 결과 — 내 이름은 지워져요</li>
            </ul>
            <p className="type-caption text-navy/70 mt-2 break-keep">
              같이 소트한 사람들의 결과가 바뀌지 않게 순위는 남기고 이름만 지워요.
            </p>
          </div>
          <div>
            <h3 className="type-body-strong text-navy">
              떠나는 이유를 알려 주시겠어요? <span className="text-navy/70 font-normal">(선택)</span>
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
              이유는 무엇을 고칠지 세는 데만 써요. 누가 적었는지는 저장하지 않아요.
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="type-body text-navy break-keep">정말 탈퇴할까요?</p>
          <p className="type-caption text-navy/70 break-keep">
            지워진 취향표는 되돌릴 수 없어요. 같은 계정으로 다시 로그인해도 돌아오지 않아요.
          </p>
          <p className="type-caption text-navy/70 break-keep">
            잠시 쉬고 싶은 것이라면 로그아웃만 해도 괜찮아요. 기록은 그대로 남아 있어요.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          <p className="type-body text-navy break-keep">
            지우려면 <strong>{nickname}</strong> 을(를) 그대로 적어 주세요.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label="닉네임 확인"
            className="w-full h-12 px-4 rounded-2xl bg-cream border border-navy/15 text-navy type-body placeholder:text-navy/50 focus:outline-2 focus:outline-[var(--t-point-ink)]"
            placeholder={nickname}
          />
          <p className="type-caption text-navy/70">손이 미끄러져 지워지는 일이 없게 한 번 더 확인해요.</p>
        </div>
      )}
    </Sheet>
  );
}
