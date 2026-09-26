"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Toast, primaryButton, dangerButton, useToast } from "@/components/space/SpaceUI";
import { draftExpiresAt, formatDraftExpiry, fetchActiveDraftStrict, type StageSaveResult } from "@/utils/worldcupDb";
import { clearActiveRun, draftResumePath, restoreDraftToStorage } from "@/utils/worldcupRun";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";

/** 시트 문구에 필요한 만큼의 초안. */
type DraftSummary = { status?: string; is_single_artist?: boolean; saved_at?: string | null; updated_at?: string; current_round_name?: string | null };

/** saveOrAsk 가 끝난 뒤 화면이 할 일을 정할 수 있게 돌려준다. */
export type SaveOrAskOutcome = "proceeded" | "asked" | "failed";

/**
 * 고르기 단계(아티스트·곡)에서 계정 초안에 쓰는 자리마다 쓰는 흐름.
 *
 *   saveOrAsk(모드, 저장, 바꾸기, 원래 할 일)
 *     게스트                 원래 할 일(계정 초안이 없다)
 *     saved                  원래 할 일
 *     conflict               시트: 이어서 진행하기 -> 그 초안으로 / 새로 시작 -> 바꾸고 원래 할 일
 *     error · no-user        **원래 할 일을 하지 않는다.** 알리고 이 화면·선택 그대로 — 다시 누르면 된다
 *
 * 예전에는 conflict 만 따로 보고 나머지는 모두 성공처럼 다음 화면으로 갔다. 저장이
 * 실패해도 넘어가서, 다음 화면이 계정의 옛 초안을 읽고 새 선택이 조용히 사라졌다
 * (UX-001, UX-009, AC-06). 결과는 빠짐없이 나눠서 다룬다 — 새 결과가 생기면 타입 검사가
 * 여기서 멈춘다.
 *
 * "새로 시작" 을 고르기 전에는 이전 초안을 건드리지 않는다(UX-001).
 */
export function useDraftConflict(signedIn: boolean, locale: "ko" | "en") {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [pending, setPending] = useState<{
    draft: DraftSummary | null;
    replace: () => Promise<StageSaveResult>;
    proceed: () => void | Promise<void>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  /** 실패를 알린다. 원문 오류(23502·TypeError 등)는 보여 주지 않는다. */
  const reportFailure = (result: "error" | "no-user") => {
    const en = locale === "en";
    showToast(
      result === "no-user"
        ? en ? "Your login session expired. Please log in again." : "로그인 세션이 만료되었어요. 다시 로그인해 주세요."
        : en ? "Couldn't save. Please try again." : "임시저장에 실패했어요. 다시 시도해 주세요.",
      "error"
    );
  };

  /** 저장 결과 하나를 처리한다. 성공일 때만 원래 할 일로 넘어간다. */
  const settle = async (
    result: StageSaveResult,
    onConflict: () => Promise<boolean | void>,
    proceed: () => void | Promise<void>
  ): Promise<SaveOrAskOutcome> => {
    switch (result) {
      case "saved":
        await proceed();
        return "proceeded";
      case "conflict": {
        // 충돌은 났지만 물어볼 준비(초안 상세)를 못 하면 실패다 — 부르는 화면이 시트를 닫지 않고 다시 시도하게 한다(UX-011).
        const asked = await onConflict();
        return asked === false ? "failed" : "asked";
      }
      case "error":
      case "no-user":
        reportFailure(result);
        return "failed";
      default: {
        const unhandled: never = result;
        throw new Error(`처리하지 않은 저장 결과: ${String(unhandled)}`);
      }
    }
  };

  /** 던져진 예외도 "error" 로 받는다 — 성공으로 오해해 넘어가지 않게. */
  const run = async (save: () => Promise<StageSaveResult>): Promise<StageSaveResult> => {
    try {
      return await save();
    } catch {
      return "error";
    }
  };

  const saveOrAsk = async (
    isSingle: boolean,
    save: () => Promise<StageSaveResult>,
    replace: () => Promise<StageSaveResult>,
    proceed: () => void | Promise<void>
  ): Promise<SaveOrAskOutcome> => {
    if (!signedIn) {
      await proceed();
      return "proceeded";
    }
    return settle(
      await run(save),
      async () => {
        /*
         * 충돌은 났는데 초안 상세를 못 읽으면(연결 문제) 시트를 띄우지 않는다 — UX-011.
         * 예전에는 draft: null 로 시트를 열어 "이어서 진행하기"가 아무 일도 하지 않는 막다른 길이 됐다.
         * 대신 무엇을 못 했는지 말하고, 사용자는 같은 버튼으로 다시 시도한다. 기존 초안은 건드리지 않는다.
         */
        let draft: DraftSummary | null;
        try {
          draft = await fetchActiveDraftStrict(isSingle);
        } catch {
          showToast(
            locale === "en" ? "Couldn't check your sort in progress. Please try again." : "진행 중인 소트를 확인하지 못했어요. 다시 시도해 주세요.",
            "error"
          );
          return false;
        }
        setPending({ draft, replace, proceed });
        return true;
      },
      proceed
    );
  };

  const sheet = (
    <>
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
          const current = pending;
          setBusy(true);
          const result = await run(current.replace);
          setBusy(false);
          await settle(
            result,
            // 명시적 바꾸기는 upsert 라 conflict 가 나지 않는다. 난다면 시트를 그대로 둔다.
            async () => {},
            async () => {
              // 이전 판은 이제 없다. 이 기기에 남은 그 판의 진행도 함께 치운다.
              safeSessionStorage.removeItem("worldcup_progress");
              safeLocalStorage.removeItem("worldcup_progress");
              clearActiveRun();
              setPending(null);
              await current.proceed();
            }
          );
        }}
      />
      <Toast toast={toast} />
    </>
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
