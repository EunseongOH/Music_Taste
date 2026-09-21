import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { corsHeaders, preflight } from "../../toss/cors";

/**
 * 같이 소트하기 — 아티스트·곡 목록(실험). 문서: docs/together-sort.md
 *
 * **이미 DB 에 담긴 Spotify 캐시만 읽는다. Spotify 를 호출하지 않는다.**
 * (캐시 테이블은 RLS 로 클라이언트에서 못 읽어 서버에서 읽어 준다.)
 *
 *   GET /api/together/catalog?q=윤하        → 곡까지 캐시된 아티스트 찾기
 *   GET /api/together/catalog?artistId=...  → 그 아티스트의 캐시된 전곡
 */

interface SpotifyImage {
  url: string;
  width?: number;
}

interface CachedAlbum {
  id: string;
  name: string;
  images?: SpotifyImage[];
  release_date?: string;
  album_type?: string;
}

interface CachedTrack {
  id: string;
  name: string;
  artists?: { name: string }[];
  duration_ms?: number;
}

interface CatalogRow {
  id: string;
  name: string;
  images: SpotifyImage[] | null;
}

/** 이보다 적으면 소트할 거리가 안 된다(중복 제거 전 기준). */
const MIN_TRACKS = 8;

/** 같은 곡이 앨범마다 다시 담기므로(정규판·리패키지) 제목으로 한 번만 남긴다. */
const titleKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\s*-\s*(inst\.?|instrumental|remaster(ed)?.*|live|feat\..*)$/i, "")
    .replace(/[^0-9a-z가-힣]/g, "")
    .trim();

/** 토스 미니앱(별도 origin)에서도 부른다 — 같은 CORS 규칙을 쓴다. */
export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const artistId = searchParams.get("artistId")?.trim() ?? "";
  const supabase = createAdminClient();

  if (artistId) {
    const { data: albumRows } = await supabase
      .from("spotify_cache_artist_albums")
      .select("items")
      .eq("artist_id", artistId);

    const albums = new Map<string, CachedAlbum>();
    for (const row of albumRows ?? []) {
      for (const album of ((row as { items: CachedAlbum[] }).items ?? [])) {
        if (album?.id && !albums.has(album.id)) albums.set(album.id, album);
      }
    }
    if (albums.size === 0) return NextResponse.json({ tracks: [] }, { headers: cors });

    const { data: trackRows } = await supabase
      .from("spotify_cache_album_tracks")
      .select("album_id,items")
      .in("album_id", [...albums.keys()]);

    const seen = new Set<string>();
    const tracks: { id: string; title: string; artistName: string; albumImage: string; albumName: string; releaseDate: string }[] = [];
    for (const row of (trackRows ?? []) as { album_id: string; items: CachedTrack[] }[]) {
      const album = albums.get(row.album_id);
      if (!album) continue;
      const cover = album.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? album.images?.[0]?.url ?? "";
      for (const track of row.items ?? []) {
        if (!track?.id || !track.name) continue;
        // 이 아티스트가 참여한 곡만
        if (!(track.artists ?? []).some((a) => a?.name)) continue;
        const key = titleKey(track.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        tracks.push({
          id: track.id,
          title: track.name,
          artistName: (track.artists ?? []).map((a) => a.name).join(", "),
          albumImage: cover,
          albumName: album.name,
          releaseDate: album.release_date ?? "",
        });
      }
    }
    // 최근 발매 순으로 보여 준다(고를 때 익숙한 곡이 위에 온다).
    tracks.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
    return NextResponse.json({ tracks }, { headers: cors });
  }

  // 아티스트 찾기 — 전곡을 확실히 낼 수 있는 아티스트가 먼저 온다.
  // coverage = 곡까지 받아 둔 앨범 / 스포티파이가 말한 앨범 수 (뷰: together_artist_catalog)
  let query = supabase
    .from("together_artist_catalog")
    .select("id,name,images,coverage")
    .gte("track_count", MIN_TRACKS)
    .order("coverage", { ascending: false })
    .order("track_count", { ascending: false })
    .limit(q ? 20 : 18);
  if (q) query = query.ilike("name", `%${q}%`);

  // coverage 는 순서로만 쓴다 — 화면에 확보율을 적지 않는다(없는 쪽을 먼저 알리는 꼴이 된다).
  const { data: artists } = await query;
  const list = ((artists ?? []) as CatalogRow[]).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? a.images?.[0]?.url ?? "",
  }));

  return NextResponse.json({ artists: list }, { headers: cors });
}
