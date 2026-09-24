import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "소트 진행 - Sortify | 최애곡 순위 매기기",
  description: "두 곡씩 비교하며 내가 더 좋아하는 곡을 골라 보세요. 끝까지 남은 한 곡과 전체 순위가 취향표가 됩니다.",
  openGraph: {
    title: "소트 진행 - Sortify | 최애곡 순위 매기기",
    description: "두 곡씩 비교하며 내가 더 좋아하는 곡을 골라 보세요. 끝까지 남은 한 곡과 전체 순위가 취향표가 됩니다.",
    images: ["/og-sortify-v2.png"],
  },
};

export default function WorldcupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
