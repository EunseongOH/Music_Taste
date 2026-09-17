import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "같이 소트하기 - Sortify",
  // 실험 기능이라 검색에 노출하지 않는다(링크를 받은 사람만 들어온다).
  robots: { index: false, follow: false },
};

export default function TogetherLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
