import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "아티스트 선택 - Sortify | 최애곡 순위 매기기",
  description: "월드컵을 통해 최애곡 순위를 매길 아티스트를 검색하고 선택해보세요. 좋아하는 아티스트의 수많은 명곡 중 최고를 가려내는 음악 취향 테스트가 시작됩니다.",
  openGraph: {
    title: "아티스트 선택 - Sortify | 최애곡 순위 매기기",
    description: "월드컵을 통해 최애곡 순위를 매길 아티스트를 검색하고 선택해보세요. 좋아하는 아티스트의 수많은 명곡 중 최고를 가려내는 음악 취향 테스트가 시작됩니다.",
    images: ["/og-image.png"],
  },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
