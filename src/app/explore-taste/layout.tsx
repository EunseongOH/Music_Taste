import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "유저 취향 매칭 피드 - Sortify | 최애곡 순위 매기기",
  description: "나와 음악 취향이 유사한 다른 유저들의 프로필과 아티스트별 취향표를 탐색해보세요. 최애곡 싱크를 비교하며 새로운 명곡을 발견할 수 있습니다.",
  openGraph: {
    title: "유저 취향 매칭 피드 - Sortify | 최애곡 순위 매기기",
    description: "나와 음악 취향이 유사한 다른 유저들의 프로필과 아티스트별 취향표를 탐색해보세요. 최애곡 싱크를 비교하며 새로운 명곡을 발견할 수 있습니다.",
    images: ["/og-image.png"],
  },
};

export default function ExploreTasteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
