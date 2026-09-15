import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "내 취향표 - Sortify",
  // 로그인한 본인의 저장본을 여는 화면이라 검색에 노출하지 않는다.
  robots: { index: false, follow: false },
};

export default function MyTasteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
