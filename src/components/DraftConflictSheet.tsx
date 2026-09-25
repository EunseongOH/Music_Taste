"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, primaryButton, dangerButton } from "@/components/space/SpaceUI";
import { draftExpiresAt, formatDraftExpiry, loadActiveDraft, type StageSaveResult } from "@/utils/worldcupDb";
import { clearActiveRun, draftResumePath, restoreDraftToStorage } from "@/utils/worldcupRun";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";

/**
 * 고르기 단계(아티스트·곡)에서 계정 초안에 쓰는 자리마다 쓰는 흐름.
 *
 *   saveOrAsk(모드, 저장, 바꾸기, 원래 할 일)
 *     저장이 됐거나 게스트면       원래 할 일
 *     진행 중인 월드컵이 있으면     시트: 이어서 진행하기 -> 그 초안으로 / 새로 시작 -> 바꾸고 원래 할 일
 *
 * "새로 시작" 을 고르기 전에는 이전 초안을 건드리지 않는다(UX-001).
 */
/** 시트 문구에 필요한 만큼의 초안. */
type DraftSummary = { status?: string; is_single_artist?: boolean; saved_at?: string | null; updated_at?: string; current_round_name?: string | null };

export function useDraftConflict(signedIn: boolean, locale: "ko" | "en") {
  const router = useRouter();
  const [pending, setPending] = useState<{
    draft: DraftSummary | null;
    replace: () => Promise<StageSaveResult>;
    proceed: () => void | Promise<void>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveOrAsk = async (
    isSingle: boolean,
    save: () => Promise<StageSaveResult>,
    replace: () => Promise<StageSaveResult>,
    proceed: () => void | Promise<void>
  ) => {
    if (signedIn && (await save()) === "conflict") {
      setPending({ draft: await loadActiveDraft(isSingle), replace, proceed });
      return;
    }
    await proceed();
  };

  const sheet = (
    <DraftConflictSheet
      open={!!pending}
      draft={pending?.draft ?? null}
      locale={locale}
      busy={busy}
      onClose={() => { if (!busy) setPending(null); }}
      onContinue={() => {
        const draft = pending?.draft;
        setPending(null);
        if (!draft) return;
        restoreDraftToStorage(draft);
        router.push(draftResumePath(draft));
      }}
      onStartNew={async () => {
        if (!pending) return;
        setBusy(true);
        const r = await pending.replace();
        setBusy(false);
        if (r !== "saved") {
          alert(locale === "en" ? "Couldn't start new. Please try again." : "새로 시작하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        // 이전 판은 이제 없다. 이 기기에 남은 그 판의 진행도 함께 치운다.
        safeSessionStorage.removeItem("worldcup_progress");
        safeLocalStorage.removeItem("worldcup_progress");
        clearActiveRun();
        const { proceed } = pending;
        setPending(null);
        await proceed();
      }}
    />
  );

  return { saveOrAsk, sheet };
}

/**
 * "진행 중인 월드컵이 있어요" — 이전 소트를 버리게 되는 자리에서 **한 가지 모양으로** 묻는다.
 *
 * 예전에는 홈 "시작하기" 에만 있었다. `/explore` 에 바로 들어와 아티스트를 고르면 같은 결과
 * (이전 진행이 지워짐)가 경고 없이 났다(UX-001). 같은 일에는 같은 시트를 쓴다.
 * 문서: docs/design-system/dialogs.md 3장
 */
export default function DraftConflictSheet({
  open,
  draft,
  locale,
  busy = false,
  onContinue,
  onStartNew,
  onClose,
}: {
  open: boolean;
  /** 계정의 초안. 없으면(이 기기에만 남은 진행) 일반 문구를 쓴다. */
  draft: DraftSummary | null;
  locale: "ko" | "en";
  busy?: boolean;
  onContinue: () => void;
  onStartNew: () => void;
  onClose: () => void;
}) {
  const en = locale === "en";
  const detail =
    draft && draftExpiresAt(draft) !== null
      ? `${draft.current_round_name ?? ""} · ${formatDraftExpiry(draft, locale)}`
      : en ? "Your chosen artists and songs are still here." : "고르던 아티스트와 곡이 남아 있어요.";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={en ? "Cancel" : "취소"}
      header={
        <>
          <h2 className="type-title-1 text-navy">{en ? "You have a World Cup in progress" : "진행 중인 월드컵이 있어요"}</h2>
          <p className="type-sub text-navy/70 mt-1 whitespace-pre-line break-keep">
            {detail + (en ? "\nStarting new clears them." : "\n새로 시작하면 이전 내역은 지워져요.")}
          </p>
        </>
      }
      footer={
        <div className="flex flex-col gap-2">
          <button onClick={onContinue} disabled={busy} className={`${primaryButton} w-full`}>
            {en ? "Continue Progress" : "이어서 진행하기"}
          </button>
          <button onClick={onStartNew} disabled={busy} className={`${dangerButton} w-full`}>
            {en ? "Start New" : "새로 시작"}
          </button>
        </div>
      }
    />
  );
}
