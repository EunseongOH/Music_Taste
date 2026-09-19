// 확보한 아티스트 데이터를 실제 서빙 경로로 훑어 이상을 찾는다. Spotify 호출 0회.
//
// 보는 것
//   1) 같은 앨범이 두 번 나오는가 (제목+연도, 제목+연도+곡수)
//   2) 한 앨범 안에 같은 곡이 두 번 있는가
//   3) 화면에 적히는 곡 수와 실제 받아지는 곡 수가 다른가
//   4) 곡이 하나도 안 나오는 앨범이 있는가 (눌렀을 때 빈 화면이 된다)
//   5) 발매일이 비었거나 말이 안 되는 앨범
//   6) 같은 앨범이 발매일만 다르게 두 번 나가는가 (수록곡의 8할 이상이 같으면 같은 앨범)
//
// 사용: npx tsx --env-file=.env.local scripts/audit-catalog.ts [아티스트수] [출력폴더]

import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";
import { getDbArtistAlbums, getDbTracksByAlbum } from "../src/utils/dbCatalog";

const sb = createAdminClient();
const LIMIT = Number(process.argv[2] ?? 400);
const OUT = process.argv[3] ?? `C:/Users/User/sortify-exports/데이터검증-${new Date().toISOString().slice(0, 10)}`;
const ALBUM_CAP = Number(process.env.ALBUM_CAP ?? 60);
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

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
  const want = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
  ]);
  const all = await fetchAll<any>((f, t) => sb.from("artist_serve_coverage")
    .select("spotify_id, name, name_ko, tracks_servable, albums_servable")
    .in("confidence", ["url_rel", "manual", "wikidata"]).gt("tracks_servable", 0).order("spotify_id").range(f, t));
  const todo = all
    .sort((a, b) => (want.has(b.spotify_id) ? 1 : 0) - (want.has(a.spotify_id) ? 1 : 0) || b.tracks_servable - a.tracks_servable)
    .slice(0, LIMIT);
  console.log(`검사 대상 ${todo.length}팀 (확보 아티스트 ${all.length}팀 중 이용자가 열 쪽부터)`);

  const rows: any[] = [];
  const problems: any[] = [];
  for (const [i, a] of todo.entries()) {
    if (i % 25 === 0) console.log(`  ${i}/${todo.length} ${new Date().toLocaleTimeString()}`);
    const name = a.name_ko || a.name;
    let albums, tracks;
    try {
      albums = await getDbArtistAlbums(a.spotify_id);
      tracks = await getDbTracksByAlbum(albums.slice(0, ALBUM_CAP).map((x) => x.id));
    } catch (e) {
      problems.push({ 아티스트: name, 종류: "조회 실패", 내용: String(e).slice(0, 120), spotify_id: a.spotify_id });
      continue;
    }

    const keyYear = new Map<string, string[]>();      // 제목+연도
    const keyFull = new Map<string, string[]>();      // 제목+연도+곡수
    let emptyAlbums = 0, countMismatch = 0, badDate = 0, dupInAlbum = 0;
    for (const al of albums) {
      const yr = String(al.release_date ?? "").slice(0, 4);
      const k1 = `${norm(al.name)}|${yr}`;
      const k2 = `${k1}|${al.total_tracks}`;
      keyYear.set(k1, [...(keyYear.get(k1) ?? []), al.id]);
      keyFull.set(k2, [...(keyFull.get(k2) ?? []), al.id]);

      const list = tracks[al.id] ?? [];
      if (!(al.id in tracks) && albums.indexOf(al) >= ALBUM_CAP) continue;   // 검사 대상 밖
      if (!list.length) emptyAlbums++;
      else if (list.length !== al.total_tracks) countMismatch++;
      if (!/^(19|20)\d{2}/.test(yr)) badDate++;
      const seen = new Set<string>();
      for (const t of list) { const k = norm(t.name); if (seen.has(k)) dupInAlbum++; seen.add(k); }
    }
    // 6) 같은 앨범이 발매일만 다르게 두 번 나가는가.
    //    출처마다 발매일 표기가 다르면 날짜 기준 합치기를 빠져나간다. 수록곡이 거의 같으면 같은 앨범이다.
    const titleSets = albums.map((al) => ({ al, t: new Set((tracks[al.id] ?? []).map((x) => norm(x.name))) }))
      .filter((x) => x.t.size > 0);
    const sameAlbumPairs: string[] = [];
    for (let i = 0; i < titleSets.length; i++) {
      for (let j = i + 1; j < titleSets.length; j++) {
        const A = titleSets[i], B = titleSets[j];
        if (A.al.release_date.slice(0, 10) === B.al.release_date.slice(0, 10)) continue;   // 날짜 같은 건 이미 합쳐졌다
        const small = A.t.size <= B.t.size ? A.t : B.t;
        const big = A.t.size <= B.t.size ? B.t : A.t;
        if (small.size < 2) continue;                        // 1곡짜리는 우연히 겹칠 수 있다
        let hit = 0;
        for (const x of small) if (big.has(x)) hit++;
        if (hit / small.size >= 0.8) sameAlbumPairs.push(`${A.al.name} (${A.al.release_date}) = ${B.al.name} (${B.al.release_date})`);
      }
    }

    const dupYear = [...keyYear].filter(([, v]) => v.length > 1);
    const dupFull = [...keyFull].filter(([, v]) => v.length > 1);

    rows.push({
      아티스트: name, 앨범: albums.length,
      "곡(합계)": Object.values(tracks).flat().length,
      "앨범중복 제목+연도": dupYear.length,
      "앨범중복 제목+연도+곡수": dupFull.length,
      "곡 없는 앨범": emptyAlbums,
      "곡수 불일치": countMismatch,
      "앨범 안 곡 중복": dupInAlbum,
      "발매일 이상": badDate,
      "발매일만 다른 같은 앨범": sameAlbumPairs.length,
      홍보대상: want.has(a.spotify_id) ? "O" : "",
      spotify_id: a.spotify_id,
    });
    for (const [k, v] of dupYear.slice(0, 3)) problems.push({ 아티스트: name, 종류: "앨범 중복", 내용: `${k} (${v.join(", ")})`, spotify_id: a.spotify_id });
    if (emptyAlbums) problems.push({ 아티스트: name, 종류: "곡 없는 앨범", 내용: `${emptyAlbums}장`, spotify_id: a.spotify_id });
    if (dupInAlbum) problems.push({ 아티스트: name, 종류: "앨범 안 곡 중복", 내용: `${dupInAlbum}건`, spotify_id: a.spotify_id });
    for (const c of sameAlbumPairs.slice(0, 4)) problems.push({ 아티스트: name, 종류: "발매일만 다른 같은 앨범", 내용: c, spotify_id: a.spotify_id });
  }

  const w = (file: string, list: any[]) => {
    if (!list.length) return;
    const cols = Object.keys(list[0]);
    writeFileSync(`${OUT}/${file}`, "\ufeff" + [cols.join(","), ...list.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n"), "utf8");
  };
  w("1_아티스트별.csv", rows);
  w("2_문제목록.csv", problems);

  const sum = (k: string) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const lines = [
    `데이터 검증 · ${new Date().toLocaleString("ko-KR")}`,
    `검사 ${rows.length}팀 · 앨범 ${sum("앨범")} · 곡 ${sum("곡(합계)")}`, "",
    `앨범 중복 (제목+연도)        ${sum("앨범중복 제목+연도")}건 · ${rows.filter((r) => r["앨범중복 제목+연도"]).length}팀`,
    `앨범 중복 (제목+연도+곡수)   ${sum("앨범중복 제목+연도+곡수")}건`,
    `곡이 하나도 없는 앨범        ${sum("곡 없는 앨범")}장 · ${rows.filter((r) => r["곡 없는 앨범"]).length}팀`,
    `적힌 곡 수 ≠ 실제 곡 수      ${sum("곡수 불일치")}장 · ${rows.filter((r) => r["곡수 불일치"]).length}팀`,
    `한 앨범 안 같은 곡           ${sum("앨범 안 곡 중복")}건`,
    `발매일이 이상함              ${sum("발매일 이상")}장`,
    `발매일만 다른 같은 앨범      ${sum("발매일만 다른 같은 앨범")}건 · ${rows.filter((r) => r["발매일만 다른 같은 앨범"]).length}팀`,
  ];
  writeFileSync(`${OUT}/0_요약.txt`, "\ufeff" + lines.join("\r\n"), "utf8");
  console.log("\n" + lines.join("\n") + `\n\n${OUT} 에 저장했다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
