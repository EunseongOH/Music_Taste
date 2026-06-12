import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "장르별 아티스트 추천 - Sortify | 최애곡 순위 매기기",
  description: "좋아하는 음악 장르들을 선택하고 어울리는 국내외 아티스트들을 추천받아보세요. 월드컵 토너먼트를 시작할 다양한 장르별 대표 가수가 나열됩니다.",
  openGraph: {
    title: "장르별 아티스트 추천 - Sortify | 최애곡 순위 매기기",
    description: "좋아하는 음악 장르들을 선택하고 어울리는 국내외 아티스트들을 추천받아보세요. 월드컵 토너먼트를 시작할 다양한 장르별 대표 가수가 나열됩니다.",
    images: ["/og-image.png"],
  },
};

export default function GenresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
