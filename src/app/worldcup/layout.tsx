import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "믹스매치 월드컵 - Sortify | 최애곡 순위 매기기",
  description: "좋아하는 아티스트들의 명곡을 한데 모아 나만의 음악 취향 월드컵을 즐겨보세요! 토너먼트 배틀을 거쳐 진정한 취향을 가려낼 수 있습니다.",
  openGraph: {
    title: "믹스매치 월드컵 - Sortify | 최애곡 순위 매기기",
    description: "좋아하는 아티스트들의 명곡을 한데 모아 나만의 음악 취향 월드컵을 즐겨보세요! 토너먼트 배틀을 거쳐 진정한 취향을 가려낼 수 있습니다.",
    images: ["/og-image.png"],
  },
};

export default function WorldcupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
