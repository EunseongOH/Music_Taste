// 지금 DB 를 우선 확보해야 할 아티스트 명단. Spotify 호출 0회.
//
// 대상: 홍보 대상(prelaunch_targets) + 전곡 모드 첫 화면 선정(explore_genre_picks).
//       = 이용자가 실제로 열 가능성이 높은 아티스트.
//
// 등급 (위에 있을수록 급하다)
//   A 연결 없음            MusicBrainz 아티스트를 못 찾았다. 리졸버가 다시 찾아야 한다.
//   B 이름만 연결·앨범 있음 앨범은 이미 DB 에 있는데 연결을 못 믿어서 못 낸다. 확인만 하면 바로 열린다.
//   C 이름만 연결·앨범 없음 연결도 못 믿고 앨범도 없다.
//   D 연결됨·트랙 0        앨범 목록은 있는데 트랙리스트가 하나도 없다.
//   E 연결됨·빈약          트랙리스트가 있는 앨범이 1~4장뿐이다.
//   F 정상                 5장 이상.
//
// 사용: npx tsx --env-file=.env.local scripts/export-priority.ts [출력 폴더]

import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const today = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `C:/Users/User/sortify-exports/우선확보-${today}`;
const TRUSTED = ["url_rel", "manual", "wikidata"];

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  await sb.rpc("refresh_artist_coverage_snapshot");
  mkdirSync(OUT, { recursive: true });

  const pre = await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id, name, tier").order("spotify_id").range(f, t));
  const picks = await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id, name, genre, rank").order("spotify_id").range(f, t));
  const maps = await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, mbid, confidence").eq("entity", "artist").order("spotify_id").range(f, t));
  // 지금 실제로 낼 수 있는 것 기준 (Spotify 연결 앨범 + "mb:" 발매그룹 + Deezer)
  const cov = await fetchAll<any>((f, t) => sb.from("artist_serve_snapshot")
    .select("spotify_id, name, country, albums_servable, tracks_servable, release_groups, sp_albums, mb_albums, dz_albums")
    .order("spotify_id").range(f, t));

  const mapOf = new Map(maps.map((m) => [m.spotify_id, m]));
  const covOf = new Map(cov.map((c) => [c.spotify_id, c]));
  const genreOf = new Map<string, string[]>();
  for (const p of picks) genreOf.set(p.spotify_id, [...(genreOf.get(p.spotify_id) ?? []), p.genre]);

  const want = new Map<string, { name: string; why: string[] }>();
  for (const p of pre) {
    const w = want.get(p.spotify_id) ?? { name: "", why: [] };
    if (!w.name && p.name) w.name = p.name;
    w.why.push(`홍보대상 ${p.tier}`);
    want.set(p.spotify_id, w);
  }
  for (const p of picks) {
    const w = want.get(p.spotify_id) ?? { name: "", why: [] };
    if (!w.name && p.name) w.name = p.name;
    if (!w.why.some((x) => x.startsWith("첫화면"))) w.why.push(`첫화면 ${(genreOf.get(p.spotify_id) ?? []).join("·")}`);
    want.set(p.spotify_id, w);
  }
  // 이름이 비면 Spotify 아티스트 캐시에서 가져온다
  const cached = await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id, name").order("id").range(f, t));
  const nameOf = new Map(cached.map((r) => [r.id, r.name as string]));
  for (const [id, w] of want) if (!w.name) w.name = nameOf.get(id) ?? "";

  const rows = [...want].map(([spotify_id, w]) => {
    const m = mapOf.get(spotify_id);
    const c = covOf.get(spotify_id);
    const rgs = c?.release_groups ?? 0;
    const withTracks = c?.albums_servable ?? 0;
    const grade = !m ? "A 연결없음"
      : !TRUSTED.includes(m.confidence) ? (rgs > 0 ? "B 이름만연결(앨범있음)" : "C 이름만연결(앨범없음)")
      : withTracks === 0 ? "D 트랙0"
      : withTracks < 5 ? "E 빈약"
      : "F 정상";
    return {
      등급: grade,
      // 차트 유입 ID 는 이름 없이 들어온 것이 있다. 이용자가 처음 열 때 Spotify 캐시가 채워진다
      아티스트: c?.name || w.name || "(이름 미상 · 차트 유입)",
      우선순위근거: w.why.join(" / "),
      국가: c?.country ?? "",
      "아는 앨범(발매그룹)": rgs,
      "낼 수 있는 앨범": withTracks,
      "낼 수 있는 곡": c?.tracks_servable ?? 0,
      "Spotify 연결": c?.sp_albums ?? 0,
      "MusicBrainz 단독": c?.mb_albums ?? 0,
      Deezer: c?.dz_albums ?? 0,
      연결근거: m?.confidence ?? "없음",
      spotify_id,
      "해야 할 일": !m ? "MusicBrainz 아티스트 찾기 (mb_resolve)"
        : !TRUSTED.includes(m.confidence) ? (rgs > 0 ? "연결 확인 (verify-name-links)" : "연결 확인 후 앨범 수집")
        : withTracks === 0 ? "트랙리스트 받기 (mb-rg-fill tracks)"
        : withTracks < 5 ? "빠진 앨범 트랙리스트 받기 (mb-rg-fill)"
        : "",
    };
  }).sort((a, b) => a.등급.localeCompare(b.등급) || b["아는 앨범(발매그룹)"] - a["아는 앨범(발매그룹)"] || a.아티스트.localeCompare(b.아티스트));

  const urgent = rows.filter((r) => !r.등급.startsWith("F"));
  const cols = Object.keys(rows[0]);
  const csv = (list: any[]) => "\ufeff" + [cols.join(","), ...list.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
  writeFileSync(`${OUT}/1_우선확보_명단.csv`, csv(urgent), "utf8");
  writeFileSync(`${OUT}/2_전체.csv`, csv(rows), "utf8");

  const byGrade = new Map<string, number>();
  for (const r of rows) byGrade.set(r.등급, (byGrade.get(r.등급) ?? 0) + 1);
  const lines = [
    `우선 확보 아티스트 명단 · ${new Date().toLocaleString("ko-KR")}`,
    `대상: 홍보 대상 + 전곡 모드 첫 화면 선정 = ${rows.length}팀`, "",
    ...[...byGrade].sort().map(([g, n]) => `${g.padEnd(24)} ${String(n).padStart(4)}팀`),
    "", `급한 것(F 제외) ${urgent.length}팀 -> 1_우선확보_명단.csv`,
    "",
    "등급이 뜻하는 것",
    "  A 연결없음              MusicBrainz 아티스트를 못 찾았다. 앨범도 트랙도 하나도 못 낸다.",
    "  B 이름만연결(앨범있음)  앨범은 이미 DB 에 있는데 연결을 못 믿어서 못 낸다. 확인만 하면 바로 열린다.",
    "  C 이름만연결(앨범없음)  연결도 못 믿고 앨범도 없다.",
    "  D 트랙0                 앨범 목록은 있고 낼 수 있는 곡이 없다.",
    "  E 빈약                  낼 수 있는 앨범이 1~4장뿐이다.",
    "  F 정상                  5장 이상. 지금도 Spotify 없이 서비스된다.",
  ];
  writeFileSync(`${OUT}/0_요약.txt`, "\ufeff" + lines.join("\r\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\n${OUT} 에 저장했다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
