// 아티스트 확보 현황을 스프레드시트용 JSON 으로 내보낸다. Spotify 호출 0회.
// 색칠은 파이썬(openpyxl)이 맡는다 — scripts/make_coverage_xlsx.py
//
// 구분
//   1 트랙리스트 전체   아는 앨범을 빠짐없이 곡까지 갖고 있다. Spotify 없이 소트를 끝까지 한다.
//   2 앨범 목록만       앨범 이름은 아는데 곡이 없다. 앨범을 누르면 Spotify 를 부른다.
//   3 트랙리스트 일부   곡이 있는 앨범도, 아직 못 받은 앨범도 있다.
//   4 Spotify 필요      연결이 없거나 믿을 수 없어 우리 DB 로는 아무것도 못 낸다.
//
// 사용: npx tsx --env-file=.env.local scripts/export-coverage-xlsx.ts [출력파일]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const OUT = process.argv[2] ?? "C:/Users/User/sortify-exports/아티스트_확보현황.json";
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

async function main() {
  await sb.rpc("refresh_artist_coverage_snapshot");
  await sb.rpc("refresh_artist_serve_snapshot");

  const comp = await fetchAll<any>((f, t) => sb.from("artist_completeness")
    .select("spotify_id, name, name_ko, country, confidence, opens, release_groups, rg_pending, albums_servable, tracks_servable, dz_albums")
    .order("spotify_id").range(f, t));
  const serve = new Map((await fetchAll<any>((f, t) => sb.from("artist_serve_snapshot")
    .select("spotify_id, sp_albums, mb_albums, dz_albums").order("spotify_id").range(f, t))).map((r) => [r.spotify_id, r]));
  const pre = await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id, name, tier").order("spotify_id").range(f, t));
  const picks = await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id, name, genre").order("spotify_id").range(f, t));
  const cache = await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id, name").order("id").range(f, t));

  const want = new Map<string, string>();     // spotify_id -> 우선순위 근거
  for (const p of pre) want.set(p.spotify_id, `홍보대상 ${p.tier ?? ""}`.trim());
  const genreOf = new Map<string, string[]>();
  for (const g of picks) genreOf.set(g.spotify_id, [...(genreOf.get(g.spotify_id) ?? []), g.genre]);
  for (const [id, gs] of genreOf) want.set(id, [want.get(id), `첫화면 ${gs.join("·")}`].filter(Boolean).join(" / "));

  const nameOf = new Map<string, string>();
  for (const r of [...cache.map((c) => ({ id: c.id, name: c.name })), ...pre.map((p) => ({ id: p.spotify_id, name: p.name })), ...picks.map((p) => ({ id: p.spotify_id, name: p.name }))]) {
    if (r.name && !nameOf.has(r.id)) nameOf.set(r.id, r.name);
  }

  const rows: any[] = [];
  const seen = new Set<string>();
  for (const c of comp) {
    seen.add(c.spotify_id);
    const s = serve.get(c.spotify_id);
    const trusted = TRUSTED.includes(c.confidence);
    const tracks = c.tracks_servable ?? 0;
    const rgs = c.release_groups ?? 0;
    const pending = c.rg_pending ?? 0;
    const 구분 = !trusted || (tracks === 0 && rgs === 0) ? 4
      : tracks === 0 ? 2
      : pending === 0 ? 1 : 3;
    // 연결을 믿을 수 없으면 화면에 아무것도 못 낸다. "낼 수 있는" 칸은 0 으로 적는다
    // (아는 앨범 수는 그대로 둔다 — 연결만 확인되면 바로 쓸 수 있다는 뜻이다)
    rows.push({
      구분,
      아티스트: c.name_ko || c.name || nameOf.get(c.spotify_id) || "",
      국가: c.country ?? "",
      "낼 수 있는 앨범": trusted ? (c.albums_servable ?? 0) : 0,
      "낼 수 있는 곡": trusted ? tracks : 0,
      "아는 앨범": rgs,
      "아직 못 받은 앨범": pending,
      "Spotify 연결 앨범": trusted ? (s?.sp_albums ?? 0) : 0,
      "MusicBrainz 단독": trusted ? (s?.mb_albums ?? 0) : 0,
      Deezer: trusted ? (s?.dz_albums ?? 0) : 0,
      연결근거: trusted ? c.confidence : `${c.confidence ?? ""} (믿을 수 없음)`,
      열람수: c.opens ?? 0,
      우선순위: want.get(c.spotify_id) ?? "",
      spotify_id: c.spotify_id,
    });
  }
  // 연결 자체가 없어 목록에도 못 들어온 아티스트 (앱은 아는데 우리 DB 가 모른다)
  for (const [id, nm] of nameOf) {
    if (seen.has(id)) continue;
    rows.push({
      구분: 4, 아티스트: nm, 국가: "", "낼 수 있는 앨범": 0, "낼 수 있는 곡": 0, "아는 앨범": 0,
      "아직 못 받은 앨범": 0, "Spotify 연결 앨범": 0, "MusicBrainz 단독": 0, Deezer: 0,
      연결근거: "연결 없음", 열람수: 0, 우선순위: want.get(id) ?? "", spotify_id: id,
    });
  }

  rows.sort((a, b) => a.구분 - b.구분 || b.열람수 - a.열람수 || b["낼 수 있는 곡"] - a["낼 수 있는 곡"]
    || String(a.아티스트).localeCompare(String(b.아티스트), "ko"));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 0), "utf8");
  const n = (k: number) => rows.filter((r) => r.구분 === k).length;
  console.log(`전체 ${rows.length}팀 · 전체보유 ${n(1)} · 앨범목록만 ${n(2)} · 일부보유 ${n(3)} · Spotify필요 ${n(4)}`);
  console.log(`${OUT} 에 저장했다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
