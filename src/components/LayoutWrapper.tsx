"use client";

import React from "react";
import { usePathname } from "next/navigation";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith("/manager-taste-control");

  if (isAdminPage) {
    // 어드민 페이지는 화면 전체를 채우는 래퍼 사용
    return (
      <div className="w-full min-h-screen bg-[var(--app-bg)] relative flex flex-col overflow-x-hidden">
        {children}
      </div>
    );
  }

  // 일반 유저 페이지는 기존처럼 430px 모바일 너비 제한 래퍼 적용
  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-[var(--app-bg)] shadow-2xl relative flex flex-col px-6 overflow-x-hidden">
      {children}
    </div>
  );
}
