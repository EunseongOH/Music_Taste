"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchChallenge } from "@/utils/togetherDb";
import { Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";

/**
 * 같이 소트하기 — 첫 화면(실험). 문서: docs/together-sort.md
 *
 * 한자리에 모여 할 때는 링크보다 코드를 부르는 쪽이 빠르다. 여기서 코드를 입력해 들어간다.
 */
export default function TogetherHomePage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    const clean = code.trim().toLowerCase();
    if (clean.length < 4) return;
    setBusy(true);
    const found = await fetchChallenge(clean);
    setBusy(false);
    if (!found) {
      showToast("그런 코드가 없어요. 다시 확인해 주세요.", "error");
      return;
    }
    router.push(`/together/${found.code}`);
  };

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-12 pb-12">
      <h1 className="type-title-1 text-navy">같이 소트하기</h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        같은 곡을 각자 줄 세우고 얼마나 비슷한지 봐요.{"\n"}옆 사람에게 받은 코드를 넣어 주세요.
      </p>

      <label className="flex flex-col gap-1 mt-8">
        <span className="type-caption text-navy/70">코드</span>
        <input
          id="together-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enter();
          }}
          maxLength={12}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="abc1234"
          className="h-14 px-4 rounded-2xl bg-white border border-navy/15 font-num text-[22px] tracking-[0.12em] text-navy"
        />
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <button onClick={enter} disabled={busy || code.trim().length < 4} className={`${primaryButton} w-full`}>
          {busy ? "찾는 중" : "들어가기"}
        </button>
        {/* 링크로 둔다 — 화면이 다 그려져도 자바스크립트가 붙기 전에는 onClick 이 안 먹는다(느린 폰에서 "눌러도 반응 없음"). */}
        <Link href="/together/new" className={`${secondaryButton} w-full`}>
          새로 만들기
        </Link>
      </div>
      <Toast toast={toast} />
    </main>
  );
}
