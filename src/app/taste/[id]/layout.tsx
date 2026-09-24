import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/** 카카오·슬랙·디스코드 크롤러는 상대 경로를 못 읽는다. 절대 주소로 만든다. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://sortify.kr";
const FALLBACK_OG = `${SITE}/og-sortify-v2.png`;

/**
 * 앨범 재킷이 없을 때 쓸 **아티스트 사진**.
 *
 * `tournament_results` 에는 아티스트 사진이 없고 `artist_id` 만 있다. 사진은
 * `spotify_cache_artists` 에 이미 들어 있으므로 새 칸을 만들지 않고 그걸 읽는다.
 * 그 표는 RLS 가 켜져 있고 정책이 없어 anon 으로는 못 읽는다 — 이 함수는 서버에서만
 * 돌고 읽는 값도 사진 주소 한 줄이라 service_role 로 읽는다.
 *
 * 지금은 전건이 재킷을 갖고 있어 거의 돌지 않는다(재킷이 빈 옛 기록을 위한 자리다).
 */
async function artistImage(artistId: string | null): Promise<string | null> {
  if (!artistId) return null;
  try {
    const { data } = await createAdminClient()
      .from("spotify_cache_artists")
      .select("images")
      .eq("id", artistId)
      .maybeSingle();
    const images = (data as { images?: unknown } | null)?.images;
    if (!Array.isArray(images)) return null;
    // Spotify 는 큰 것부터 준다. 첫 장이면 충분하다.
    const url = (images[0] as { url?: string } | undefined)?.url;
    return typeof url === "string" && url.startsWith("https://") ? url : null;
  } catch (e) {
    console.error("[taste/og] 아티스트 사진을 읽지 못했어요:", e);
    return null;
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const { data: result } = await supabase
      .from("tournament_results")
      .select("*")
      .eq("id", id)
      .single();

    if (result) {
      const winnerName = result.winner_track_title || "";
      const artistName = result.winner_track_artist || "";
      const nickname = result.user_nickname || "음악팬";

      const title = `${result.title} | Sortify`;
      const description = `${nickname}님의 음악 취향표 결과! 1위 곡: ${winnerName} - ${artistName}. 토너먼트 월드컵으로 완성한 최애 명곡 리스트를 확인해보세요.`;

      /*
       * 미리보기 이미지 — **1위 곡 재킷 → 아티스트 사진 → Sortify 로고**.
       *
       * 취향표에서 가장 먼저 눈에 들어오는 것이 1위 곡이고, 링크를 받는 쪽도
       * 그 그림으로 "무엇에 대한 취향표"인지 알아본다. 재킷이 비었을 때만 아래로
       * 내려간다(운영 확인: 지금은 전건이 https 재킷을 갖고 있다).
       */
      const cover = result.winner_track_image as string | null;
      const og = cover?.startsWith("https://")
        ? cover
        : (await artistImage(result.artist_id)) ?? FALLBACK_OG;

      return {
        metadataBase: new URL(SITE),
        title,
        description,
        openGraph: {
          title,
          description,
          images: [og],
          type: "website",
          url: `${SITE}/taste/${id}`,
        },
        twitter: { card: "summary_large_image", title, description, images: [og] },
      };
    }
  } catch (e) {
    console.error("Failed to generate metadata dynamically for taste result:", e);
  }

  return {
    metadataBase: new URL(SITE),
    title: "음악 취향표 결과 - Sortify",
    description: "월드컵 토너먼트를 거쳐 완성된 음악 취향표 결과를 확인하고 공유해보세요.",
    openGraph: {
      title: "음악 취향표 결과 - Sortify",
      description: "월드컵 토너먼트를 거쳐 완성된 음악 취향표 결과를 확인하고 공유해보세요.",
      images: [FALLBACK_OG],
    },
    twitter: { card: "summary_large_image", images: [FALLBACK_OG] },
  };
}

export default function TasteDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
