import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "나만의 음악 취향표 및 랭킹 결과 - Sortify",
  description: "월드컵을 통해 완성된 나만의 세밀한 음악 취향표와 전체 트랙 순위 리스트를 확인하고 공유해보세요! 피라미드, 레코드, 감성 리스트형 템플릿을 제공합니다.",
  openGraph: {
    title: "나만의 음악 취향표 및 랭킹 결과 - Sortify",
    description: "월드컵을 통해 완성된 나만의 세밀한 음악 취향표와 전체 트랙 순위 리스트를 확인하고 공유해보세요! 피라미드, 레코드, 감성 리스트형 템플릿을 제공합니다.",
    images: ["/og-image.png"],
  },
};

export default function TasteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
