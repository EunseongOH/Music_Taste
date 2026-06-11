import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공개 취향 아카이브 - Sortify | 최애곡 순위 매기기",
  description: "전 세계 음악 팬들이 완성한 다양한 아티스트별 취향표와 명곡 순위 저장소를 구경해보세요. 다른 유저들의 음악 아카이빙 정보를 살펴보실 수 있습니다.",
  openGraph: {
    title: "공개 취향 아카이브 - Sortify | 최애곡 순위 매기기",
    description: "전 세계 음악 팬들이 완성한 다양한 아티스트별 취향표와 명곡 순위 저장소를 구경해보세요. 다른 유저들의 음악 아카이빙 정보를 살펴보실 수 있습니다.",
    images: ["/og-image.png"],
  },
};

export default function ArchiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
