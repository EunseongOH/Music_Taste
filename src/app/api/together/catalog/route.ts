import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ARTIST_TRANSLATION_MAP } from "@/utils/artistNames";
import { betterTitle, songKey } from "@/utils/songKey";
import { getAlbumTracks, getArtistAlbums } from "@/utils/spotify";
import { corsHeaders, preflight } from "../../toss/cors";

/**
 * 같이 소트하기 — 아티스트·곡 목록. 문서: docs/together-sort.md
 *
 * **전곡 모드(/tracks)와 같은 데이터 경로를 쓴다.**
 * 같이 소트하기는 전곡 모드를 같이 하게 해 주는 기능일 뿐 별개의 서비스가 아니다.
 * 예전에는 이 라우트만 `spotify_cache_*` 를 직접 읽어서, 같은 아티스트를 두 화면에서
 * 열면 앨범 수·곡 수가 달랐다(판본 병합·미발매곡·중복 판정이 전부 달랐다).
 * 이제 `getArtistAlbums`/`getAlbumTracks` 를 그대로 부르고 `songKey` 로 센다.
 *
 * 비용 경계 (사용자 승인):
 *  ① 캐시·DB 히트는 그대로 즉시 — 대부분의 요청이 여기서 끝난다
 *     (`getAlbumTracks` 는 우리 DB → mb:/deezer: → Spotify 캐시 → 예산 → Spotify 순이라
 *      DB 로 답되면 예산을 아예 건드리지 않는다)
 *  ② 미스는 `spotify.ts` 의 일일 예산 안에서만 Spotify 로 나간다. 가드가 함수 안쪽에
 *     있어 서버 라우트에서 불러도 그대로 먹는다(`SPOTIFY_CACHE_ONLY` 포함)
 *  ③ 예산이 떨어지면 두 함수는 **예외가 아니라 빈 배열**을 준다. 그때는 `notReady` 를
 *     돌려준다 — 화면이 "아직 준비 중"이라고 말해야 한다. 조용히 빈 목록을 주면
 *     이용자는 곡이 없는 아티스트로 읽는다
 *  ④ 목록은 담긴 아티스트를 앞에 둔다(is_full → coverage 순)
 *
 *   GET /api/together/catalog                → 이번주 추천(전곡 확보 풀에서 12명)
 *   GET /api/together/catalog?q=윤하         → 아티스트 찾기
 *   GET /api/together/catalog?servable=1     → 지금 곡을 낼 수 있는 아티스트 id 목록
 *   GET /api/together/catalog?artistId=...   → 그 아티스트의 곡(전곡 모드와 같은 결과)
 */

interface SpotifyImage {
  url: string;
  width?: number;
}

/** 확보 현황 뷰(`artist_coverage`, 정의 B). 목록 순서와 "전곡" 판정을 여기서만 가져온다. */
interface CoverageRow {
  spotify_id: string;
  name: string;
  name_ko: string | null;
  distinct_tracks: number;
  is_full: boolean;
  coverage: string | number | null;
}

/** 이보다 적으면 소트할 거리가 안 된다. */
const MIN_TRACKS = 8;
/** 앨범 한 페이지. /tracks 와 같은 값이어야 캐시를 함께 쓴다(캐시 키에 limit·offset 이 들어간다). */
const ALBUM_PAGE = 10;
/** 한 아티스트에서 볼 앨범 수 상한. 그 이상은 소트로 감당이 안 된다. */
const MAX_ALBUMS = 120;
/** 곡 목록을 몇 앨범씩 묶어 받을지. 너무 넓히면 예산을 순식간에 쓴다. */
const TRACK_BATCH = 5;
/** 이번주 추천에 올릴 수. 전곡 확보(is_full) 풀에서 고른다. */
const PICK_SIZE = 12;

/**
 * 한글로 쳐도 영문으로 등록된 아티스트가 잡히게 한다.
 * `artist_coverage` 에 `name_ko` 가 있어 대부분 그것으로 잡히지만, 아직 비어 있는
 * 아티스트가 있어 본 검색(`utils/spotify.ts`)과 같은 맵을 함께 쓴다.
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
 * 한국 시간 월요일 0시에 넘어가는 주차 번호.
 * 1970-01-01 이 목요일이라 3일을 더해야 월요일이 경계가 된다.
 */
function weekIndex(now: number = Date.now()): number {
  const DAY = 86_400_000;
  return Math.floor((now + 9 * 3_600_000 + 3 * DAY) / (7 * DAY));
}

/** 아티스트 사진은 뷰에 없다. 캐시에서 따로 붙인다. */
async function withImages(rows: CoverageRow[]) {
  if (rows.length === 0) return [];
  const { data } = await createAdminClient()
    .from("spotify_cache_artists")
    .select("id,images")
    .in(
      "id",
      rows.map((r) => r.spotify_id)
    );
  const pic = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; images: SpotifyImage[] | null }[]) {
    const url = row.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? row.images?.[0]?.url ?? "";
    if (url && !pic.has(row.id)) pic.set(row.id, url);
  }
  return rows.map((r) => ({
    id: r.spotify_id,
    // 한글 이름이 있으면 그쪽을 보여 준다 — 우리 화면은 한국어다.
    name: r.name_ko || r.name,
    image: pic.get(r.spotify_id) ?? "",
  }));
}

/** 담긴 아티스트가 앞에 오도록 정렬한 기본 쿼리. */
function coverageQuery() {
  return createAdminClient()
    .from("artist_coverage")
    .select("spotify_id,name,name_ko,distinct_tracks,is_full,coverage")
    .gte("distinct_tracks", MIN_TRACKS)
    .order("is_full", { ascending: false })
    .order("coverage", { ascending: false })
    .order("distinct_tracks", { ascending: false });
}

/** 진행 상황 한 줄. 화면이 프로그레스 바를 채우는 데 쓴다. */
type Progress =
  /** 앨범 목록을 받는 중 — got/total. total 은 첫 페이지 뒤에야 안다 */
  | { t: "albums"; got: number; total: number }
  /** 앨범별 곡을 받는 중 — done/total */
  | { t: "tracks"; done: number; total: number };

/**
 * 한 아티스트의 곡을 모은다.
 *
 * 두 갈래(한 번에 주는 JSON · 한 줄씩 흘려보내는 NDJSON)가 **같은 코드**를 쓴다.
 * 진행 상황이 필요한 쪽만 `emit` 으로 받아 간다 — 두 벌이 되면 어느 한쪽만
 * 고쳐져서 두 화면의 곡 수가 또 갈린다.
 */
async function buildCatalog(artistId: string, emit: (p: Progress) => void) {
  /*
   * 앨범 목록 — /tracks 와 같은 함수·같은 페이지 크기로 받는다.
   * 같은 캐시 항목을 쓰기 때문에, 그 화면에서 이미 열어 본 아티스트는 Spotify 를
   * 부르지 않는다. 캐시가 없으면 예산 안에서만 나간다.
   */
  const albums: { id: string; name: string; cover: string; releaseDate: string }[] = [];
  let total = Infinity;
  for (let offset = 0; offset < Math.min(total, MAX_ALBUMS); offset += ALBUM_PAGE) {
    const page = await getArtistAlbums(artistId, offset, ALBUM_PAGE);
    total = page.total || page.items.length;
    if (!page.items.length) break;
    for (const album of page.items as { id: string; name: string; images?: SpotifyImage[]; release_date?: string }[]) {
      if (!album?.id) continue;
      albums.push({
        id: album.id,
        name: album.name,
        cover: album.images?.find((i) => (i.width ?? 0) <= 400)?.url ?? album.images?.[0]?.url ?? "",
        releaseDate: album.release_date ?? "",
      });
    }
    // 총 장수는 첫 페이지를 받고 나서야 안다. 그 전까지 화면은 불확정 바를 보여 준다.
    emit({ t: "albums", got: albums.length, total: Math.min(total, MAX_ALBUMS) });
  }

  type Row = {
    id: string;
    title: string;
    artistName: string;
    albumImage: string;
    albumName: string;
    releaseDate: string;
    unreleased?: boolean;
  };
  const rows: Row[] = [];

  // 앨범별 곡 목록. 몇 개씩 묶어 받는다 — 한 번에 다 던지면 예산을 순식간에 쓴다.
  for (let i = 0; i < albums.length; i += TRACK_BATCH) {
    const batch = albums.slice(i, i + TRACK_BATCH);
    const results = await Promise.all(batch.map((album) => getAlbumTracks(album.id)));
    results.forEach((tracks, n) => {
      const album = batch[n];
      for (const track of (tracks ?? []) as { id: string; name: string; artists?: { name: string }[] }[]) {
        if (!track?.id || !track.name) continue;
        rows.push({
          id: track.id,
          title: track.name,
          artistName: (track.artists ?? []).map((a) => a.name).join(", "),
          albumImage: album.cover,
          albumName: album.name,
          releaseDate: album.releaseDate,
        });
      }
    });
    emit({ t: "tracks", done: Math.min(i + TRACK_BATCH, albums.length), total: albums.length });
  }

  /*
   * 이용자가 올린 미발매곡도 전곡 모드처럼 함께 낸다. **승인된 것만** —
   * 서버에서 읽으므로 RLS 가 아니라 여기서 걸러야 한다(누구나 들어오는 방에 남의
   * 미심사 제보를 넣지 않는다). 곡 id 는 Spotify id 가 아니라 이 표의 id 이고,
   * 방(`sort_challenges.tracks`)에 그대로 저장된다. 일치율은 id 로 비교하므로 섞여도 된다.
   */
  const { data: unreleased } = await createAdminClient()
    .from("unreleased_tracks")
    .select("id,title,artist_name,video_url,release_date")
    .eq("artist_id", artistId)
    .eq("is_released", false)
    .eq("is_approved", true);
  for (const track of (unreleased ?? []) as {
    id: string;
    title: string;
    artist_name: string | null;
    video_url: string | null;
    release_date: string | null;
  }[]) {
    const youtube = (track.video_url ?? "").match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1];
    rows.push({
      id: track.id,
      title: track.title,
      artistName: track.artist_name ?? "",
      albumImage: youtube ? `https://img.youtube.com/vi/${youtube}/hqdefault.jpg` : "",
      albumName: "미발매곡",
      releaseDate: track.release_date ?? "",
      unreleased: true,
    });
  }

  /*
   * 같은 곡이 앨범마다 다시 담긴다(정규판·리패키지·일본어판). 한 번만 남기되
   * **화면 전체가 쓰는 같은 규칙**으로 센다 — utils/songKey. 남길 쪽은 판 표기가
   * 없는 제목(betterTitle). 아티스트 자리에는 artistId 를 넣는다(이 요청은 한
   * 아티스트만 다루므로 상수면 되고, 피처링 표기로 키가 갈리지 않는다).
   */
  const best = new Map<string, Row>();
  for (const row of rows) {
    const key = songKey(artistId, row.title);
    if (!key) continue;
    const kept = best.get(key);
    const swap =
      !kept ||
      // 미발매곡이 발매곡과 겹치면 발매곡을 남긴다(제보는 정식 발매되면 지워진다).
      (kept.unreleased && !row.unreleased) ||
      (!!kept.unreleased === !!row.unreleased && betterTitle(row.title, kept.title) < 0);
    if (swap) best.set(key, row);
  }
  const tracks = [...best.values()].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));


  return { tracks, notReady: tracks.length === 0 };
}

/** 토스 미니앱(별도 origin)에서도 부른다 — 같은 CORS 규칙을 쓴다. */
export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const artistId = searchParams.get("artistId")?.trim() ?? "";

  /*
   * `?servable=1` — 지금 곡을 낼 수 있는 아티스트 id 목록.
   * 아티스트 고르기 화면이 목록 순서를 정할 때 쓴다. 정의 B(`artist_coverage`)를 그대로
   * 따르므로, 예전에 임시로 두었던 확보율 하한(0.8)은 없앴다.
   */
  if (searchParams.get("servable") === "1") {
    const supabase = createAdminClient();
    const [view, cache] = await Promise.all([
      supabase.from("artist_coverage").select("spotify_id").gte("distinct_tracks", MIN_TRACKS).limit(4000),
      // 뷰에 없지만 곡은 이미 담긴 아티스트도 있다(아래 주석 참고).
      supabase.from("together_artist_catalog").select("id").gte("track_count", MIN_TRACKS).limit(4000),
    ]);
    const ids = new Set<string>();
    for (const r of (view.data ?? []) as { spotify_id: string }[]) ids.add(r.spotify_id);
    for (const r of (cache.data ?? []) as { id: string }[]) ids.add(r.id);
    return NextResponse.json({ ids: [...ids] }, { headers: cors });
  }

  if (artistId) {
    /*
     * `?stream=1` — 진행 상황을 한 줄씩(NDJSON) 흘려보낸다. 곡 고르기 화면이
     * 이걸로 프로그레스 바를 채운다. 마지막 줄이 결과다.
     *
     * 스트림을 못 읽는 환경이면 화면이 본문을 통째로 받아 마지막 줄만 쓴다 —
     * 진행률만 못 보고 결과는 같다.
     */
    if (searchParams.get("stream") === "1") {
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const line = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          try {
            line({ t: "done", ...(await buildCatalog(artistId, line)) });
          } catch (err) {
            console.error("[api/together/catalog] 곡을 모으지 못했습니다:", err);
            line({ t: "done", tracks: [], notReady: true });
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          ...cors,
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
          // 중간 프록시가 모아 뒀다 한 번에 보내면 진행률이 의미 없어진다.
          "x-accel-buffering": "no",
        },
      });
    }

    return NextResponse.json(await buildCatalog(artistId, () => {}), { headers: cors });
  }

  // 검색어가 없으면 이번주 추천 묶음을 낸다.
  if (!q) {
    const { data } = await coverageQuery().eq("is_full", true).limit(400);
    const pool = (data ?? []) as CoverageRow[];
    if (pool.length >= PICK_SIZE) {
      /*
       * 창이 끝을 넘어가면 앞에서 마저 채운다(한 바퀴 돌면 처음으로).
       *
       * 추천에는 **사진이 있는 아티스트만** 올린다. 확보 풀이 777명으로 넓어지면서
       * 사진이 없는 아티스트가 섞이는데, 얼굴 없는 동그라미가 추천 자리에 뜨면
       * 고장으로 읽힌다. 그래서 창을 넉넉히 잡고 사진이 붙는 것만 12명 채운다.
       */
      const start = (weekIndex() * PICK_SIZE) % pool.length;
      const window = [...pool.slice(start), ...pool.slice(0, start)];
      const withPics = (await withImages(window.slice(0, PICK_SIZE * 6))).filter((a) => a.image);
      const picked = withPics.slice(0, PICK_SIZE);
      if (picked.length >= PICK_SIZE) return NextResponse.json({ artists: picked }, { headers: cors });
      // 사진이 붙는 아티스트가 12명도 안 되면 아래 기본 목록으로 떨어진다.
    }
    // 전곡 확보가 12명도 안 되면 화면을 비우지 않고 아래 기본 목록으로 떨어진다.
  }

  let query = coverageQuery().limit(q ? 20 : 18);
  if (q) {
    // 쉼표는 or() 의 구분자라 값에 들어가면 안 된다. 괄호·점도 같이 턴다.
    const safe = (v: string) => v.replace(/[,().]/g, " ").trim();
    const terms = [q, ...altNames(q)].map(safe).filter(Boolean);
    query = query.or(terms.flatMap((t) => [`name.ilike.%${t}%`, `name_ko.ilike.%${t}%`]).join(","));
  }

  const { data: artists } = await query;
  let rows = (artists ?? []) as CoverageRow[];

  /*
   * 뷰에서 못 찾으면 캐시 쪽으로 한 번 더 본다.
   *
   * `artist_coverage` 는 확신 있는 연결(url_rel·manual·wikidata)만 담는다 — 이름만 맞은
   * 연결은 정확도가 57% 라 뺀 것이고, 그 판단은 맞다. 그런데 그 때문에 **곡은 이미
   * 담겨 있는데 뷰에는 없는** 아티스트가 생긴다(전환 시점에 11명: indigo la End·김동률·
   * Megadeth·The Libertines·Sasha Alex Sloan·나상현씨밴드 등). 검색해도 안 나오면
   * 이용자에게는 "없는 아티스트"다 — 실제로는 157곡이 있는데도.
   *
   * 그래서 목록 순서와 추천은 뷰를 따르고(확신 있는 쪽을 앞에), 찾지 못했을 때만
   * 캐시를 본다. 뷰가 넓어지면 이 경로는 자연히 안 타게 된다.
   */
  if (q && rows.length === 0) {
    const safe = (v: string) => v.replace(/[,().]/g, " ").trim();
    const terms = [q, ...altNames(q)].map(safe).filter(Boolean);
    const { data: fallback } = await createAdminClient()
      .from("together_artist_catalog")
      .select("id,name,track_count,coverage")
      .gte("track_count", MIN_TRACKS)
      .or(terms.map((term) => `name.ilike.%${term}%`).join(","))
      .order("coverage", { ascending: false })
      .limit(20);
    rows = ((fallback ?? []) as { id: string; name: string; track_count: number; coverage: string | number | null }[]).map(
      (r) => ({
        spotify_id: r.id,
        name: r.name,
        name_ko: null,
        distinct_tracks: r.track_count,
        is_full: false,
        coverage: r.coverage,
      })
    );
  }

  // 사진이 없는 아티스트는 뒤로 보낸다(목록에서 얼굴 없는 동그라미가 먼저 보이지 않게).
  const listed = await withImages(rows);
  listed.sort((a, b) => Number(!a.image) - Number(!b.image));
  return NextResponse.json({ artists: listed }, { headers: cors });
}
