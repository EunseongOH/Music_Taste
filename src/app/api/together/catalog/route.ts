import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ARTIST_TRANSLATION_MAP } from "@/utils/artistNames";
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

/**
 * 한글로 쳐도 영문으로 등록된 아티스트가 잡히게 한다.
 *
 * 이 뷰의 `name` 은 Spotify 가 준 이름 하나뿐이라, 한국 아티스트도 영문으로만 들어 있는
 * 경우가 많다(까치산 → `KACHISAN`, 김승주 → `kimseungjoo`, 라쿠나 → `Lacuna`).
 * 본 검색(`utils/spotify.ts`)은 같은 맵을 거치는데 여기만 빠져 있어서, 한글로 치면
 * 아무것도 안 나왔다. 부분 일치까지 본 검색과 같은 규칙을 쓴다.
 *
 * 더 넓히려면 `canonical_artist.name_ko` 를 같이 보면 된다 — 이 맵은 356 쌍뿐이다.
 */
function altNames(q: string): string[] {
  const key = q.trim().toLowerCase();
  const direct = ARTIST_TRANSLATION_MAP[key] ?? ARTIST_TRANSLATION_MAP[q.trim()];
  if (direct) return [direct];
  if (key.length < 2) return [];
  const hit = Object.keys(ARTIST_TRANSLATION_MAP).find((k) => k.includes(key) || key.includes(k));
  return hit ? [ARTIST_TRANSLATION_MAP[hit]] : [];
}

/**
 * 검색 전 첫 화면에 올리는 "이번주 소트 추천 아티스트".
 *
 * 전곡이 다 있는 아티스트만 올린다 — 추천해 놓고 들어갔더니 곡이 비면 안 된다.
 * 그 풀이 지금 22명뿐이라(2026-09-21 실측) 한 번에 18명을 보여주면 매주 바꿔도
 * 얼굴이 거의 안 바뀐다. 그래서 12명씩 끊어 주마다 다음 묶음으로 넘긴다.
 *
 * 풀이 넉넉해지면 PICK_SIZE 를 올리면 되고, 소트 횟수 지표가 쌓이면 아래 정렬을
 * popularity 대신 그 횟수로 바꾸면 "많이 소트한 아티스트"가 된다. 그때도 이 창은 그대로 쓴다.
 */
const PICK_COVERAGE = 1;
const PICK_SIZE = 12;

/**
 * 한국 시간 월요일 0시에 넘어가는 주차 번호.
 *
 * 1970-01-01 이 목요일이라 3일을 더해야 월요일이 경계가 된다.
 * 같은 주 안에서는 항상 같은 목록이 나온다(새로고침해도 안 바뀐다).
 */
function weekIndex(now: number = Date.now()): number {
  const DAY = 86_400_000;
  return Math.floor((now + 9 * 3_600_000 + 3 * DAY) / (7 * DAY));
}

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

  /*
   * `?servable=1` — 지금 곡까지 낼 수 있는 아티스트의 id 목록.
   *
   * 아티스트 고르기 화면이 목록 순서를 정할 때 쓴다. 이 목록에 있는 아티스트를 누르면
   * DB 에 곡이 있어 Spotify 를 부르지 않고 바로 뜬다. 지금 67명이라 통째로 보내도 가볍다.
   */
  if (searchParams.get("servable") === "1") {
    const { data } = await createAdminClient()
      .from("together_artist_catalog")
      .select("id")
      .gte("track_count", MIN_TRACKS)
      .limit(500);
    return NextResponse.json({ ids: (data ?? []).map((r) => (r as { id: string }).id) }, { headers: cors });
  }

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

  const toArtist = (a: CatalogRow) => ({
    id: a.id,
    name: a.name,
    image: a.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? a.images?.[0]?.url ?? "",
  });

  // 검색어가 없으면 이번주 추천 묶음을 낸다.
  if (!q) {
    const { data: full } = await supabase
      .from("together_artist_catalog")
      .select("id,name,images")
      .gte("track_count", MIN_TRACKS)
      .gte("coverage", PICK_COVERAGE)
      // 주 안에서의 차례만 정한다. 이 순서가 고정이라 같은 주엔 같은 묶음이 나온다.
      // popularity 로 정렬하지 않는다 — 이 뷰의 popularity 는 현재 전 행이 0이다(2026-09-21 실측).
      .order("track_count", { ascending: false })
      .order("id", { ascending: true })
      .limit(200);

    const pool = (full ?? []) as CatalogRow[];
    if (pool.length >= PICK_SIZE) {
      // 창이 끝을 넘어가면 앞에서 마저 채운다(한 바퀴 돌면 처음으로).
      const start = (weekIndex() * PICK_SIZE) % pool.length;
      const picked = [...pool.slice(start), ...pool.slice(0, start)].slice(0, PICK_SIZE);
      return NextResponse.json({ artists: picked.map(toArtist) }, { headers: cors });
    }
    // 전곡 확보가 12명도 안 되면 화면을 비우지 않고 아래 기존 경로로 떨어진다.
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
  if (q) {
    // 쉼표는 or() 의 구분자라 값에 들어가면 안 된다. 괄호·점도 같이 턴다.
    const safe = (v: string) => v.replace(/[,().]/g, " ").trim();
    const terms = [q, ...altNames(q)].map(safe).filter(Boolean);
    query = query.or(terms.map((t) => `name.ilike.%${t}%`).join(","));
  }

  // coverage 는 순서로만 쓴다 — 화면에 확보율을 적지 않는다(없는 쪽을 먼저 알리는 꼴이 된다).
  const { data: artists } = await query;

  return NextResponse.json({ artists: ((artists ?? []) as CatalogRow[]).map(toArtist) }, { headers: cors });
}
