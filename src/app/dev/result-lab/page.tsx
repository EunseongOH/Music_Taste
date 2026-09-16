import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ResultLab from "./ResultLab";

export const metadata: Metadata = {
  title: "결과 템플릿 점검 - Sortify",
  robots: { index: false, follow: false },
};

/**
 * 결과 템플릿·1위 공개를 곡 수별로 한눈에 점검하는 개발용 페이지.
 * 로컬 개발 서버와 Vercel 프리뷰(develop)에서만 열리고, 운영(sortify.kr)에서는 404.
 */
export default function ResultLabPage() {
  const isLocalDev = process.env.NODE_ENV !== "production";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isLocalDev && !isPreview) notFound();
  return <ResultLab />;
}
