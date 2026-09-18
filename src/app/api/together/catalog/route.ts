import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

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

/** 같은 곡이 앨범마다 다시 담기므로(정규판·리패키지) 제목으로 한 번만 남긴다. */
const titleKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\s*-\s*(inst\.?|instrumental|remaster(ed)?.*|live|feat\..*)$/i, "")
    .replace(/[^0-9a-z가-힣]/g, "")
    .trim();

export async function GET(request: Request) {
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
    if (albums.size === 0) return NextResponse.json({ tracks: [] });

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
    return NextResponse.json({ tracks });
  }

  // 아티스트 찾기: 앨범 캐시가 있는 아티스트 중에서 이름으로 고른다.
  const { data: cachedArtistIds } = await supabase.from("spotify_cache_artist_albums").select("artist_id");
  const ids = [...new Set((cachedArtistIds ?? []).map((r) => (r as { artist_id: string }).artist_id))];
  if (ids.length === 0) return NextResponse.json({ artists: [] });

  let query = supabase.from("spotify_cache_artists").select("id,name,images,popularity").in("id", ids).limit(40);
  if (q) query = query.ilike("name", `%${q}%`);
  else query = query.order("popularity", { ascending: false });

  const { data: artists } = await query;
  const seen = new Set<string>();
  const list = ((artists ?? []) as { id: string; name: string; images: SpotifyImage[] | null; popularity: number | null }[])
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .map((a) => ({
      id: a.id,
      name: a.name,
      image: a.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? a.images?.[0]?.url ?? "",
      popularity: a.popularity ?? 0,
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 20);

  return NextResponse.json({ artists: list });
}
