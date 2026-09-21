import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ThemeLab from "./ThemeLab";

export const metadata: Metadata = {
  title: "테마 시안 비교 - Sortify",
  robots: { index: false, follow: false },
};

/**
 * 로고 기반 색·워드마크 시안을 나란히 비교하는 개발용 페이지 (design/logo-theme).
 * 로컬 개발 서버와 Vercel 프리뷰에서만 열리고, 운영에서는 404. 문서: docs/design-system/color.md
 */
export default function ThemeLabPage() {
  const isLocalDev = process.env.NODE_ENV !== "production";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isLocalDev && !isPreview) notFound();
  return <ThemeLab />;
}
