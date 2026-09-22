import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";

/**
 * 참여 링크(`/together/<코드>`)의 미리보기와 색인 규칙.
 *
 * 색인은 막는다 — 이 주소는 특정 모임의 것이고 코드를 아는 사람만 들어온다.
 * 색인되면 남의 모임 코드가 검색 결과에 뜬다. 입구(`/together`)만 열어 둔다.
 *
 * 미리보기(카카오톡·슬랙 등)는 방마다 다르게 만든다. 예전에는 사이트 기본
 * `/og-image.png`(어두운 영문 목업)가 떠서 링크 내용과도 브랜드와도 맞지 않았다.
 *  - 그림: 그 방에서 소트하는 **아티스트 사진**. 없으면 **Sortify 로고**.
 *    (화면 배경은 사진이 없을 때 첫 곡 재킷으로 가지만, 미리보기는 로고로 간다 —
 *     작은 썸네일에서 앨범 재킷은 무슨 링크인지 알려 주지 못한다.)
 *  - 글: 초대 화면과 같은 문구.
 */
const LOGO = "/og-sortify.png";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { code } = await params;
  const fallback: Metadata = {
    title: "같이 소트하기 - Sortify",
    robots: { index: false, follow: false },
    openGraph: { title: "같이 소트하기 - Sortify", images: [LOGO], type: "website" },
    twitter: { card: "summary_large_image", images: [LOGO] },
  };

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sort_challenges")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!data) return fallback;

    const artist = (data.artist_name as string | null) ?? null;
    const creator = (data.creator_nickname as string | null) || "리스너";
    // artist_image 는 나중에 더해진 칸이다(20260922000000). 없으면 로고로 간다.
    const image = (data.artist_image as string | null) || LOGO;
    const title = artist ? `${artist} 소트에 초대받았어요!` : `'${data.title}' 소트에 초대받았어요!`;
    const description = artist
      ? `${artist} 곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`
      : `곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`;

    return {
      title: `${title} - Sortify`,
      description,
      robots: { index: false, follow: false },
      openGraph: { title, description, images: [image], type: "website" },
      twitter: { card: "summary_large_image", title, description, images: [image] },
    };
  } catch (e) {
    console.error("[together] 미리보기 정보를 만들지 못했어요:", e);
    return fallback;
  }
}

export default function TogetherCodeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
