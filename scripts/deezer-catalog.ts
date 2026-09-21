// Deezer 로 자체 음악 DB 를 채운다. Spotify 호출 0회.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/deezer-catalog.ts artists [최대명수] [장르]   아티스트 찾기 (이름 + 앨범 제목 교차 확인)
//     장르를 주면 전곡 모드 첫 화면 선정(explore_genre_picks)의 그 장르 아티스트만 본다. 예: "k-pop", "korean rock"
//   npx tsx --env-file=.env.local scripts/deezer-catalog.ts albums [최대명수]    찾은 아티스트의 앨범·트랙 수집
//   npx tsx --env-file=.env.local scripts/deezer-catalog.ts match              Spotify 앨범 캐시 ↔ Deezer 앨범 연결 (제목·연도·곡 수 + 곡 제목 대조)
//
// 주의 (사용자 결정 2026-09-18): Deezer 약관은 비상업 이용을 전제한다. 광고 등 수익화를 시작하면
// deezer_* 테이블을 지우고 그 출처의 데이터를 서비스에서 빼야 한다. 그래서 다른 테이블과 섞지 않는다.
// 이미지·미리듣기 URL 은 저장하지 않는다. 호출 간격은 초당 4회 이하로 둔다.

import { createAdminClient } from "../src/utils/supabase/admin";
import { buildDigest } from "../src/utils/trackDigest";

const sb = createAdminClient();
// Supabase 무료 한도는 500MB. 여유를 두고 멈춘다.
const DB_LIMIT_MB = Number(process.env.DB_LIMIT_MB ?? 420);
const GAP_MS = 260;                     // 초당 4회 이하 (Deezer 안내: 5초에 50회)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const normAlbum = (s: string) => (s || "").normalize("NFKC").toLowerCase()
  .replace(/\s*[([][^)\]]*(deluxe|edition|remaster|remastered|version|ver\.|repackage|anniversary|expanded|bonus)[^)\]]*[)\]]/gi, "")
  .replace(/[^\p{L}\p{N}]/gu, "");

let calls = 0;
async function dz(path: string): Promise<any> {
  for (let i = 0; i < 6; i++) {
    await sleep(GAP_MS);
    calls++;
    let r: Response;
    try { r = await fetch("https://api.deezer.com" + path, { signal: AbortSignal.timeout(20000) }); }
    catch { await sleep(1000); continue; }
    if (!r.ok) { await sleep(1000); continue; }
    const j = await r.json();
    // Deezer 는 한도를 넘으면 200 과 함께 error.code = 4 를 준다
    if (j?.error?.code === 4) { await sleep(5000); continue; }
    if (j?.error) return null;
    return j;
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

/** 우리 아티스트 목록: 빠진 앨범이 많은 쪽부터. 장르를 주면 그 장르 선정 아티스트만. */
async function targetArtists(limit: number, genres?: string[]) {
  await sb.rpc("refresh_artist_coverage_snapshot");
  const rows = await fetchAll<any>((f, t) => sb.from("artist_deezer_target")
    .select("spotify_id, mbid, name, name_ko, country, albums_with_tracks, release_groups, gap")
    .in("confidence", ["url_rel", "manual", "wikidata"]).order("spotify_id").range(f, t));
  const done = new Set((await fetchAll<any>((f, t) => sb.from("deezer_artist").select("mbid").not("mbid", "is", null).order("deezer_artist_id").range(f, t))).map((r) => r.mbid));
  let pool = rows.filter((r) => !done.has(r.mbid));
  if (genres?.length) {
    const picks = await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id, genre, rank").in("genre", genres).order("rank").range(f, t));
    const rank = new Map<string, number>();
    for (const p of picks) if (!rank.has(p.spotify_id)) rank.set(p.spotify_id, p.rank);
    pool = pool.filter((r) => rank.has(r.spotify_id)).sort((a, b) => (rank.get(a.spotify_id)! - rank.get(b.spotify_id)!));
    return pool.slice(0, limit);
  }
  // 국내·홍보 대상 아티스트를 먼저, 그 안에서 빠진 앨범이 많은 쪽부터.
  // (잔나비처럼 "앨범 일부만 뜨는" 아티스트가 여기 먼저 걸린다. 해외 롱테일은 뒤로 민다)
  const warm = new Set((await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id));
  const pri = (r: any) => (warm.has(r.spotify_id) || r.country === "KR" ? 0 : r.country === "JP" ? 1 : 2);
  return pool.sort((a, b) => pri(a) - pri(b) || (b.gap ?? 0) - (a.gap ?? 0)).slice(0, limit);
}

async function artists(limit: number, genres?: string[]) {
  const todo = await targetArtists(limit, genres);
  console.log(`대상 ${todo.length}명`);
  // 우리 쪽 앨범 제목 (교차 확인용)
  const titlesOf = new Map<string, Set<string>>();
  for (let i = 0; i < todo.length; i += 100) {
    const mbids = todo.slice(i, i + 100).map((a) => a.mbid);
    const rows = await fetchAll<any>((f, t) => sb.from("mb_release_group").select("artist_mbid, title").in("artist_mbid", mbids).order("mbid").range(f, t));
    for (const r of rows) {
      const set = titlesOf.get(r.artist_mbid) ?? new Set<string>();
      set.add(normAlbum(r.title));
      titlesOf.set(r.artist_mbid, set);
    }
  }

  let ok = 0, weak = 0, none = 0;
  for (const [i, a] of todo.entries()) {
    if (i % 25 === 0) console.log(`  ${i}/${todo.length} 확정 ${ok} · 보류 ${weak} · 없음 ${none} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    const queries = [...new Set([a.name, a.name_ko].filter(Boolean))] as string[];
    let picked: any = null, matchedBy = "";
    for (const q of queries) {
      const res = await dz(`/search/artist?q=${encodeURIComponent(q)}&limit=5`);
      const cands = (res?.data ?? []).filter((d: any) => norm(d.name) === norm(q));
      for (const c of cands) {
        // 이름이 같아도 동명이인이 있다. 앨범 제목이 하나라도 겹쳐야 확정한다.
        const alb = await dz(`/artist/${c.id}/albums?limit=50`);
        const theirs = new Set((alb?.data ?? []).map((x: any) => normAlbum(x.title)));
        const ours = titlesOf.get(a.mbid) ?? new Set<string>();
        const overlap = [...theirs].filter((t) => ours.has(t as string)).length;
        if (overlap >= 1) { picked = c; matchedBy = "name+album"; break; }
        if (!picked && ours.size === 0) { picked = c; matchedBy = "name"; }  // 우리 쪽 앨범 정보가 없으면 이름만으로 보류 등록
      }
      if (matchedBy === "name+album") break;
    }
    if (!picked) { none++; continue; }
    const { error } = await sb.from("deezer_artist").upsert({
      deezer_artist_id: picked.id, mbid: a.mbid, name: picked.name,
      nb_album: picked.nb_album ?? null, nb_fan: picked.nb_fan ?? null, matched_by: matchedBy,
    }, { onConflict: "deezer_artist_id" });
    if (error) throw new Error(error.message);
    if (matchedBy === "name+album") ok++; else weak++;
  }
  console.log(`완료 · 확정 ${ok} · 이름만(보류) ${weak} · 없음 ${none} · Deezer 호출 ${calls}`);
}

async function dbSizeMb(): Promise<number> {
  const { data } = await sb.rpc("db_size_mb");
  return Number(data ?? 0);
}

async function albums(limitArtists: number) {
  const size0 = await dbSizeMb();
  if (size0 >= DB_LIMIT_MB) {
    console.log(`DB ${size0}MB 로 한도(${DB_LIMIT_MB}MB)에 닿았다. 더 받지 않는다.`);
    return;
  }
  console.log(`DB ${size0}MB / ${DB_LIMIT_MB}MB`);
  const artistsRows = await fetchAll<any>((f, t) => sb.from("deezer_artist").select("deezer_artist_id, mbid, name, matched_by").eq("matched_by", "name+album").order("deezer_artist_id").range(f, t));
  const have = new Set((await fetchAll<any>((f, t) => sb.from("deezer_album").select("deezer_artist_id").order("deezer_album_id").range(f, t))).map((r) => Number(r.deezer_artist_id)));
  const todo = artistsRows.filter((a) => !have.has(Number(a.deezer_artist_id))).slice(0, limitArtists);
  console.log(`앨범 수집 대상 아티스트 ${todo.length}명`);
  let albumCount = 0, trackCount = 0;
  for (const [i, a] of todo.entries()) {
    if (i % 10 === 0) console.log(`  ${i}/${todo.length} 앨범 ${albumCount} 곡 ${trackCount} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    if (i % 50 === 49 && (await dbSizeMb()) >= DB_LIMIT_MB) { console.log("한도에 닿아 멈춘다."); break; }
    const seen = new Set<string>();
    for (let index = 0; ; index += 100) {
      const list = await dz(`/artist/${a.deezer_artist_id}/albums?limit=100&index=${index}`);
      const items = list?.data ?? [];
      if (!items.length) break;
      for (const alb of items) {
        const key = `${normAlbum(alb.title)}|${String(alb.release_date ?? "").slice(0, 4)}`;
        if (seen.has(key)) continue;          // 같은 앨범 중복 수집 방지
        seen.add(key);
        const full = await dz(`/album/${alb.id}`);
        const tracks = full?.tracks?.data ?? [];
        if (!tracks.length) continue;
        const { error: e1 } = await sb.from("deezer_album").upsert({
          deezer_album_id: alb.id, deezer_artist_id: a.deezer_artist_id, title: full?.title ?? alb.title,
          release_date: full?.release_date ?? alb.release_date ?? null, record_type: full?.record_type ?? alb.record_type ?? null,
          nb_tracks: tracks.length, upc: full?.upc ?? null,
        }, { onConflict: "deezer_album_id" });
        if (e1) throw new Error(e1.message);
        const rows = tracks.map((t: any, idx: number) => ({
          deezer_album_id: alb.id, idx, disk: t.disk_number ?? 1, position: t.track_position ?? idx + 1,
          title: t.title, duration_s: t.duration ?? null, isrc: t.isrc ?? null, deezer_track_id: t.id ?? null,
        }));
        const { error: e2 } = await sb.from("deezer_track").upsert(rows, { onConflict: "deezer_album_id,idx" });
        if (e2) throw new Error(e2.message);
        // 화면이 읽을 요약도 함께 만든다
        const { error: e3 } = await sb.from("deezer_album_digest")
          .upsert({ deezer_album_id: alb.id, ...buildDigest(rows.map((t: any) => ({ title: t.title, ms: (t.duration_s ?? 0) * 1000 }))) },
            { onConflict: "deezer_album_id" });
        if (e3) throw new Error(e3.message);
        albumCount++; trackCount += rows.length;
      }
      if (!list?.next) break;
    }
  }
  console.log(`완료 · 앨범 ${albumCount} · 곡 ${trackCount} · Deezer 호출 ${calls}`);
}

async function match() {
  // Spotify 앨범 캐시 (제목·연도·곡 수) ↔ Deezer 앨범
  const v1 = await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums").select("artist_id, items").order("artist_id").range(f, t));
  const v2 = await fetchAll<any>((f, t) => sb.from("spotify_album_cache_v2").select("artist_id, items").order("artist_id").range(f, t));
  const albumsSp = new Map<string, any>();
  for (const row of [...v1, ...v2]) for (const a of row.items ?? []) if (a?.id && !albumsSp.has(a.id)) albumsSp.set(a.id, { ...a, artist: row.artist_id });

  const linked = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("mb_album_release").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
    ...(await fetchAll<any>((f, t) => sb.from("discogs_album_match").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
    ...(await fetchAll<any>((f, t) => sb.from("deezer_album_match").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
  ]);
  const artistMb = new Map((await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, mbid").eq("entity", "artist").in("confidence", ["url_rel", "manual", "wikidata"]).order("spotify_id").range(f, t))).map((m) => [m.spotify_id, m.mbid]));
  const dzOfMb = new Map<string, number[]>();
  for (const d of await fetchAll<any>((f, t) => sb.from("deezer_artist").select("mbid, deezer_artist_id").not("mbid", "is", null).order("deezer_artist_id").range(f, t))) {
    dzOfMb.set(d.mbid, [...(dzOfMb.get(d.mbid) ?? []), Number(d.deezer_artist_id)]);
  }

  const targets = [...albumsSp.entries()].filter(([id, a]) => !linked.has(id) && dzOfMb.has(artistMb.get(a.artist)));
  console.log(`대상 Spotify 앨범 ${targets.length}`);
  const cache = new Map<number, any[]>();
  const loadAlbums = async (dzId: number) => {
    if (!cache.has(dzId)) cache.set(dzId, await fetchAll<any>((f, t) => sb.from("deezer_album").select("deezer_album_id, title, release_date, nb_tracks").eq("deezer_artist_id", dzId).order("deezer_album_id").range(f, t)));
    return cache.get(dzId)!;
  };

  // 곡 제목 대조용 Spotify 트랙 캐시
  const spTracks = new Map<string, string[]>();
  const ids = targets.map(([id]) => id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from("spotify_cache_album_tracks").select("album_id, items").eq("locale", "ko").in("album_id", ids.slice(i, i + 100));
    for (const r of data ?? []) spTracks.set(r.album_id, (r.items ?? []).map((t: any) => String(t.name ?? "")));
  }

  let ok = 0, rejected = 0, unverified = 0;
  for (const [spotifyId, a] of targets) {
    const year = String(a.release_date ?? "").slice(0, 4);
    let best: any = null;
    for (const dzId of dzOfMb.get(artistMb.get(a.artist))!) {
      for (const alb of await loadAlbums(dzId)) {
        if (alb.nb_tracks === a.total_tracks && String(alb.release_date ?? "").slice(0, 4) === year && normAlbum(alb.title) === normAlbum(a.name)) { best = alb; break; }
      }
      if (best) break;
    }
    if (!best) continue;
    const spTitles = spTracks.get(spotifyId);
    let verified: string | null = null;
    if (spTitles?.length) {
      const { data: dt } = await sb.from("deezer_track").select("idx, title").eq("deezer_album_id", best.deezer_album_id).order("idx");
      const titles = (dt ?? []).map((t) => t.title);
      const agree = spTitles.filter((st, k) => {
        const d = norm(titles[k] ?? ""), q = norm(st);
        return d && (q === d || q.startsWith(d) || d.startsWith(q));
      }).length / spTitles.length;
      verified = agree >= 0.9 ? "ok" : "rejected";
      if (verified === "rejected") { rejected++; continue; }
      ok++;
    } else unverified++;
    const { error } = await sb.from("deezer_album_match").upsert({ spotify_album_id: spotifyId, deezer_album_id: best.deezer_album_id, verified }, { onConflict: "spotify_album_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`연결 · 검증 통과 ${ok} · 검증 실패로 제외 ${rejected} · 대조할 Spotify 트랙 없음 ${unverified}`);
}

const [cmd, n, ...rest] = process.argv.slice(2);
(cmd === "artists" ? artists(Number(n ?? 100), rest.length ? rest : undefined) : cmd === "albums" ? albums(Number(n ?? 50)) : cmd === "match" ? match()
  : Promise.resolve(console.log("명령: artists [명수] | albums [명수] | match")))
  .catch((e) => { console.error(e); process.exit(1); });
