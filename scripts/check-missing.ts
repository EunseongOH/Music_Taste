// 디스코그래피에 빠진 곡이 없는지 확인한다. Spotify 호출 0회.
//
// 왜 Spotify 를 안 쓰고도 되는가
//   빠진 것을 찾으려면 "정답지"가 필요한데, Spotify 말고도 정답지가 셋 있다.
//
//   1) MusicBrainz 자신 — 우리가 아는 발매그룹 중 트랙리스트를 아직 못 받은 것 (mb_rg_release.tracks_filled_at).
//      이건 우리가 게을러서 빠진 것이라 세기만 하면 된다. artist_completeness.rg_pending 이 그 수다.
//   2) Deezer 인기곡 — /artist/{id}/top 은 그 아티스트의 많이 들은 곡을 준다. 이용자가 소트에서 찾는 곡이
//      바로 이것들이다. 앨범 수를 맞추는 것보다 "히트곡이 다 있는가"가 실제로 중요한 기준이다.
//      아티스트 1명당 Deezer 1회면 된다.
//   3) 이미 받아 둔 Spotify 앨범 목록 캐시의 total 값 — 새로 부르지 않고 읽기만 한다.
//      Spotify 가 세는 앨범 수와 우리가 내는 수를 비교한다. 판·에디션을 세는 방식이 달라 정확한
//      비교는 아니고, 크게 벌어진 아티스트를 찾는 용도다.
//
// 사용: npx tsx --env-file=.env.local scripts/check-missing.ts [아티스트수] [출력폴더]

import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";
import { getDbArtistAlbums, getDbTracksByAlbum } from "../src/utils/dbCatalog";
import { songKey } from "../src/utils/songKey";

const sb = createAdminClient();
const LIMIT = Number(process.argv[2] ?? 200);
const OUT = process.argv[3] ?? `C:/Users/User/sortify-exports/누락점검-${new Date().toISOString().slice(0, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

let dzCalls = 0;
async function dz(path: string): Promise<any> {
  for (let i = 0; i < 5; i++) {
    await sleep(280);
    dzCalls++;
    try {
      const r = await fetch("https://api.deezer.com" + path, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) { await sleep(1000); continue; }
      const j = await r.json();
      if (j?.error?.code === 4) { await sleep(5000); continue; }
      return j?.error ? null : j;
    } catch { await sleep(1000); }
  }
  return null;
}

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
  mkdirSync(OUT, { recursive: true });
  await sb.rpc("refresh_artist_serve_snapshot");

  const want = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
  ]);
  const comp = await fetchAll<any>((f, t) => sb.from("artist_completeness")
    .select("spotify_id, name, name_ko, country, opens, rg_pending, tracks_servable, albums_servable")
    .in("confidence", ["url_rel", "manual", "wikidata"]).order("spotify_id").range(f, t));
  const dzArtist = new Map((await fetchAll<any>((f, t) => sb.from("deezer_artist")
    .select("mbid, deezer_artist_id, nb_album").eq("matched_by", "name+album").order("deezer_artist_id").range(f, t)))
    .map((r) => [r.mbid, r]));
  const mbidOf = new Map((await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, mbid").eq("entity", "artist").order("spotify_id").range(f, t))).map((r) => [r.spotify_id, r.mbid]));
  const spTotal = new Map<string, number>();
  for (const r of await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums").select("artist_id, total").order("artist_id").range(f, t))) {
    spTotal.set(r.artist_id, Math.max(spTotal.get(r.artist_id) ?? 0, r.total ?? 0));
  }

  const todo = comp
    .filter((a) => (a.tracks_servable ?? 0) > 0)
    .sort((x, y) => (y.opens ?? 0) - (x.opens ?? 0)
      || (want.has(y.spotify_id) ? 1 : 0) - (want.has(x.spotify_id) ? 1 : 0)
      || (y.tracks_servable ?? 0) - (x.tracks_servable ?? 0))
    .slice(0, LIMIT);
  console.log(`점검 대상 ${todo.length}팀 (수요 많은 쪽 -> 홍보 대상 -> 확보 많은 쪽 순)`);

  const rows: any[] = [];
  const misses: any[] = [];
  for (const [i, a] of todo.entries()) {
    if (i % 20 === 0) console.log(`  ${i}/${todo.length} · Deezer 호출 ${dzCalls} ${new Date().toLocaleTimeString()}`);
    const name = a.name_ko || a.name;
    const albums = await getDbArtistAlbums(a.spotify_id);
    const tracks = await getDbTracksByAlbum(albums.map((x) => x.id));
    const have = new Set<string>();
    for (const al of albums) for (const t of tracks[al.id] ?? []) have.add(songKey(name, t.name));

    // 정답지 2: Deezer 인기곡
    let topTotal = 0, topMissing: string[] = [];
    const d = dzArtist.get(mbidOf.get(a.spotify_id));
    if (d) {
      const top = await dz(`/artist/${d.deezer_artist_id}/top?limit=50`);
      for (const t of top?.data ?? []) {
        topTotal++;
        if (!have.has(songKey(name, t.title))) topMissing.push(t.title);
      }
    }

    rows.push({
      아티스트: name,
      "낼 수 있는 곡": a.tracks_servable ?? 0,
      "낼 수 있는 앨범": a.albums_servable ?? 0,
      "아직 안 받은 발매그룹": a.rg_pending ?? 0,
      "Deezer 인기곡": topTotal,
      "그중 빠진 곡": topMissing.length,
      "빠진 비율(%)": topTotal ? Math.round((topMissing.length / topTotal) * 100) : "",
      "Deezer 앨범수(참고)": d?.nb_album ?? "",
      "Spotify 앨범수(캐시)": spTotal.get(a.spotify_id) ?? "",
      열람수: a.opens ?? 0,
      홍보대상: want.has(a.spotify_id) ? "O" : "",
      spotify_id: a.spotify_id,
    });
    for (const m of topMissing.slice(0, 10)) misses.push({ 아티스트: name, 빠진곡: m, spotify_id: a.spotify_id });
  }

  const w = (f: string, list: any[]) => {
    if (!list.length) return;
    const cols = Object.keys(list[0]);
    writeFileSync(`${OUT}/${f}`, "\ufeff" + [cols.join(","), ...list.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n"), "utf8");
  };
  rows.sort((x, y) => (Number(y["빠진 비율(%)"]) || 0) - (Number(x["빠진 비율(%)"]) || 0));
  w("1_아티스트별.csv", rows);
  w("2_빠진곡.csv", misses);

  const checked = rows.filter((r) => r["Deezer 인기곡"] > 0);
  const totalTop = checked.reduce((s, r) => s + r["Deezer 인기곡"], 0);
  const totalMiss = checked.reduce((s, r) => s + r["그중 빠진 곡"], 0);
  const lines = [
    `디스코그래피 누락 점검 · ${new Date().toLocaleString("ko-KR")}`,
    `점검 ${rows.length}팀 (Deezer 인기곡으로 대조한 팀 ${checked.length}팀)`, "",
    `Deezer 인기곡 ${totalTop}곡 중 우리에게 없는 곡 ${totalMiss}곡 (${totalTop ? Math.round(totalMiss / totalTop * 100) : 0}%)`,
    `히트곡이 다 있는 팀        ${checked.filter((r) => r["그중 빠진 곡"] === 0).length}팀`,
    `10% 이하만 빠진 팀         ${checked.filter((r) => Number(r["빠진 비율(%)"]) > 0 && Number(r["빠진 비율(%)"]) <= 10).length}팀`,
    `30% 넘게 빠진 팀           ${checked.filter((r) => Number(r["빠진 비율(%)"]) > 30).length}팀`,
    `아직 안 받은 발매그룹 합계  ${rows.reduce((s, r) => s + r["아직 안 받은 발매그룹"], 0)}건`,
    "",
    "Deezer 연결이 없어 대조를 못 한 팀은 " + (rows.length - checked.length) + "팀이다.",
    "Spotify 는 한 번도 부르지 않았다. 캐시에 남아 있던 앨범 수만 참고로 적었다.",
  ];
  writeFileSync(`${OUT}/0_요약.txt`, "\ufeff" + lines.join("\r\n"), "utf8");
  console.log("\n" + lines.join("\n") + `\n\n${OUT} 에 저장했다. Deezer 호출 ${dzCalls}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
