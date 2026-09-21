import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "같이 소트하기 - Sortify | 친구와 취향 일치율 보기",
  description:
    "같은 곡을 각자 소트하고 서로 취향이 얼마나 닮았는지 확인해요. 공연 대기줄에서, 모임 자리에서 코드 하나로 같이 시작할 수 있어요.",
  openGraph: {
    title: "같이 소트하기 - Sortify | 친구와 취향 일치율 보기",
    description:
      "같은 곡을 각자 소트하고 서로 취향이 얼마나 닮았는지 확인해요. 코드 하나로 같이 시작할 수 있어요.",
    images: ["/og-image.png"],
  },
  // 참여 링크(/together/<코드>)는 각자의 모임 것이라 색인하지 않는다 — 그 화면에서 따로 막는다.
};

export default function TogetherLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
