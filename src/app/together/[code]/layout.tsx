import type { Metadata } from "next";

/**
 * 참여 링크(`/together/<코드>`)는 검색에 올리지 않는다.
 *
 * 이 주소는 특정 모임의 것이고 코드를 아는 사람만 들어온다. 색인되면
 * 남의 모임 코드가 검색 결과에 뜬다. 입구(`/together`)만 열어 둔다.
 */
export const metadata: Metadata = {
  title: "같이 소트하기 - Sortify",
  robots: { index: false, follow: false },
};

export default function TogetherCodeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
