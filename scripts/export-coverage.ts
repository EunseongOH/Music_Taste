// 확보 현황 내보내기 (CSV, 엑셀용 UTF-8 BOM). Spotify 호출 0회.
//
// 사용: npx tsx --env-file=.env.local scripts/export-coverage.ts [출력 폴더]
//
//   1_트랙리스트_확보_아티스트.csv   트랙리스트가 DB 에 있는 앨범이 1개 이상인 정식 매핑 아티스트
//   2_앨범목록만_확보_아티스트.csv   앨범(발매) 목록은 있지만 트랙리스트가 있는 앨범이 없는 정식 매핑 아티스트
//
// "정식 매핑" = Spotify 아티스트 ID 가 MusicBrainz 링크(url_rel) 또는 사람 확인(manual)으로 연결된 아티스트.

import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const OUT = process.argv[2] ?? "C:/Users/User/sortify-exports";

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const csv = (rows: Record<string, any>[]) => {
  if (!rows.length) return "\uFEFF";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join(" / ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

async function main() {
  await sb.rpc("refresh_artist_coverage_snapshot");
  const snap = await fetchAll<any>((f, t) => sb.from("artist_coverage_snapshot")
    .select("spotify_id, mbid, name, name_ko, country, confidence, albums_with_tracks, tracks")
    .in("confidence", ["url_rel", "manual", "wikidata"]).order("spotify_id").range(f, t));

  // MB 발매그룹(앨범 목록) 수
  const rgCount = new Map<string, number>();
  for (const r of await fetchAll<any>((f, t) => sb.from("mb_release_group").select("artist_mbid").order("mbid").range(f, t))) {
    rgCount.set(r.artist_mbid, (rgCount.get(r.artist_mbid) ?? 0) + 1);
  }

  // Discogs 트랙리스트 (연결된 발매판 -> Discogs 아티스트 -> MB 아티스트)
  const matches = await fetchAll<any>((f, t) => sb.from("discogs_album_match").select("spotify_album_id, release_id").order("spotify_album_id").range(f, t));
  const releases = await fetchAll<any>((f, t) => sb.from("discogs_release").select("release_id, discogs_artist_id, track_count").order("release_id").range(f, t));
  const relById = new Map(releases.map((r) => [Number(r.release_id), r]));
  const mbOfDiscogs = new Map<number, string[]>();
  for (const d of await fetchAll<any>((f, t) => sb.from("mb_artist_discogs").select("mbid, discogs_artist_id").order("mbid").range(f, t))) {
    const k = Number(d.discogs_artist_id);
    mbOfDiscogs.set(k, [...(mbOfDiscogs.get(k) ?? []), d.mbid]);
  }
  const discogsAlbums = new Map<string, number>(), discogsTracks = new Map<string, number>();
  for (const m of matches) {
    const r = relById.get(Number(m.release_id));
    if (!r) continue;
    for (const mbid of mbOfDiscogs.get(Number(r.discogs_artist_id)) ?? []) {
      discogsAlbums.set(mbid, (discogsAlbums.get(mbid) ?? 0) + 1);
      discogsTracks.set(mbid, (discogsTracks.get(mbid) ?? 0) + r.track_count);
    }
  }

  // 운영 Spotify 앨범 목록 캐시 (ko, 10개 단위 페이지가 모두 살아 있는지)
  const now = new Date().toISOString();
  const pages = await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums")
    .select('artist_id, "offset", total').eq("locale", "ko").eq("limit", 10).gt("expires_at", now).order("artist_id").range(f, t));
  const pageInfo = new Map<string, { total: number; have: Set<number> }>();
  for (const p of pages) {
    const cur = pageInfo.get(p.artist_id) ?? { total: p.total ?? 0, have: new Set<number>() };
    cur.have.add(p.offset);
    pageInfo.set(p.artist_id, cur);
  }
  const spotifyListState = (id: string) => {
    const p = pageInfo.get(id);
    if (!p || !p.total) return { spotify_albums: "", cache: "없음" };
    const need = Math.ceil(p.total / 10);
    const full = [...Array(need).keys()].every((k) => p.have.has(k * 10));
    return { spotify_albums: p.total, cache: full ? "전체" : `일부 (${p.have.size}/${need}페이지)` };
  };

  // 표시 이름: 운영 캐시의 Spotify 표기 우선
  const spName = new Map<string, string>();
  for (const r of await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id, name").eq("locale", "ko").order("id").range(f, t))) spName.set(r.id, r.name);

  // 전곡 모드 첫 화면 선정 장르
  const picks = new Map<string, string[]>();
  for (const p of await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id, genre").order("genre").range(f, t))) {
    picks.set(p.spotify_id, [...(picks.get(p.spotify_id) ?? []), p.genre]);
  }

  const rows = snap.map((a) => {
    const mbAlbums = a.albums_with_tracks ?? 0, dAlbums = discogsAlbums.get(a.mbid) ?? 0;
    const sp = spotifyListState(a.spotify_id);
    return {
      "아티스트": spName.get(a.spotify_id) ?? a.name,
      "MusicBrainz 표기": a.name,
      "한글 표기": a.name_ko ?? "",
      "국가": a.country ?? "",
      "매핑 근거": a.confidence === "manual" ? "사람 확인" : "MusicBrainz 링크",
      "앨범 목록 (MB 발매그룹 수)": rgCount.get(a.mbid) ?? 0,
      "트랙리스트 앨범 합계": mbAlbums + dAlbums,
      "트랙리스트 앨범 (MusicBrainz)": mbAlbums,
      "트랙리스트 앨범 (Discogs)": dAlbums,
      "곡 수 합계": (a.tracks ?? 0) + (discogsTracks.get(a.mbid) ?? 0),
      "Spotify 앨범 수 (캐시 기준)": sp.spotify_albums,
      "운영 앨범 목록 캐시": sp.cache,
      "전곡 모드 첫 화면 장르": picks.get(a.spotify_id) ?? [],
      "Spotify ID": a.spotify_id,
      "Spotify 링크": `https://open.spotify.com/artist/${a.spotify_id}`,
    };
  });

  const withTracks = rows.filter((r) => r["트랙리스트 앨범 합계"] > 0)
    .sort((x, y) => y["곡 수 합계"] - x["곡 수 합계"]);
  const albumsOnly = rows.filter((r) => r["트랙리스트 앨범 합계"] === 0 && (r["앨범 목록 (MB 발매그룹 수)"] > 0 || r["Spotify 앨범 수 (캐시 기준)"] !== ""))
    .sort((x, y) => y["앨범 목록 (MB 발매그룹 수)"] - x["앨범 목록 (MB 발매그룹 수)"]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/1_트랙리스트_확보_아티스트.csv`, csv(withTracks));
  writeFileSync(`${OUT}/2_앨범목록만_확보_아티스트.csv`, csv(albumsOnly));

  const kr = (list: any[]) => list.filter((r) => r["국가"] === "KR").length;
  const jp = (list: any[]) => list.filter((r) => r["국가"] === "JP").length;
  const summary = [
    `기준 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    `정식 매핑 아티스트: ${rows.length}명`,
    `1. 트랙리스트 확보: ${withTracks.length}명 (한국 ${kr(withTracks)}, 일본 ${jp(withTracks)}) · 트랙리스트 앨범 ${withTracks.reduce((s, r) => s + r["트랙리스트 앨범 합계"], 0)}개 · 곡 ${withTracks.reduce((s, r) => s + r["곡 수 합계"], 0)}개`,
    `   그중 Discogs 로 보강된 아티스트: ${withTracks.filter((r) => r["트랙리스트 앨범 (Discogs)"] > 0).length}명 (MusicBrainz 트랙리스트가 없던 아티스트 ${withTracks.filter((r) => r["트랙리스트 앨범 (MusicBrainz)"] === 0).length}명)`,
    `2. 앨범 목록만 확보: ${albumsOnly.length}명 (한국 ${kr(albumsOnly)}, 일본 ${jp(albumsOnly)})`,
    `운영 앨범 목록 캐시 전체 확보: ${rows.filter((r) => r["운영 앨범 목록 캐시"] === "전체").length}명`,
  ].join("\n");
  writeFileSync(`${OUT}/0_요약.txt`, "\uFEFF" + summary + "\n");
  console.log(summary);
  console.log(`\n저장: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
