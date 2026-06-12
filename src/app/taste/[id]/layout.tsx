import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
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
      
      return {
        title,
        description,
        openGraph: {
          title,
          description,
          images: [result.winner_track_image || "/og-image.png"],
          type: "website",
        },
      };
    }
  } catch (e) {
    console.error("Failed to generate metadata dynamically for taste result:", e);
  }

  return {
    title: "음악 취향표 결과 - Sortify",
    description: "월드컵 토너먼트를 거쳐 완성된 음악 취향표 결과를 확인하고 공유해보세요.",
    openGraph: {
      title: "음악 취향표 결과 - Sortify",
      description: "월드컵 토너먼트를 거쳐 완성된 음악 취향표 결과를 확인하고 공유해보세요.",
      images: ["/og-image.png"],
    }
  };
}

export default function TasteDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
