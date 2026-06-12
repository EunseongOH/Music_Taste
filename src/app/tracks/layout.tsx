import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "토너먼트 곡 선택 - Sortify | 최애곡 순위 매기기",
  description: "좋아하는 아티스트의 추천 명곡 리스트를 직접 선택하거나 검색해보세요. 나만의 명곡 순위 리스트를 가릴 준비가 완료됩니다.",
  openGraph: {
    title: "토너먼트 곡 선택 - Sortify | 최애곡 순위 매기기",
    description: "좋아하는 아티스트의 추천 명곡 리스트를 직접 선택하거나 검색해보세요. 나만의 명곡 순위 리스트를 가릴 준비가 완료됩니다.",
    images: ["/og-image.png"],
  },
};

export default function TracksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
