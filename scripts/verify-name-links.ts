// 이름으로만 연결된 아티스트를 교차 확인해 승격한다. Spotify 호출 0회.
//
// 왜: mb_spotify_map.confidence='name' 은 이름만 같아서 잡힌 연결이라 믿지 않는다(실측 정확도 57%).
//     그런데 그 아티스트의 앨범은 이미 MusicBrainz 에서 받아 DB 에 있다. 연결만 확인되면
//     Spotify 를 한 번도 부르지 않고 앨범 목록·트랙리스트를 낼 수 있다.
//     조용필·이문세·부활·김광석·검정치마 같은 S급 아티스트가 여기 묶여 있다.
//
// 확인 방법 (앞에서 걸리면 멈춘다):
//   1. Deezer 에서 같은 이름의 아티스트를 찾아 앨범 제목을 맞춰 본다. 2장 이상 겹치면 확정.
//      (서로 다른 출처가 "이 이름의 아티스트는 이런 앨범을 냈다"고 같은 말을 하는 셈이다)
//   2. Deezer 로 안 되면 MusicBrainz 에 그 이름의 한국 아티스트가 몇 명인지 묻는다.
//      한글 이름이 정확히 일치하는 한국 아티스트가 MusicBrainz 에 한 명뿐이면 동명이인이 아니다.
//      (틀린 연결은 대부분 로마자 표기에서 났다 — 빌스택스->Vasco Rossi 같은 식이다.
//       한글 이름이 통째로 같으면서 다른 사람일 가능성은 낮고, 유일성까지 확인하면 더 낮아진다)
//
// 사용: npx tsx --env-file=.env.local scripts/verify-name-links.ts [최대명수] [--go]
//       --go 없이 돌리면 무엇을 올릴지만 보여준다.

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const GAP_MS = 260;                       // Deezer 초당 4회 이하
const NEED_OVERLAP = 2;                   // 앨범 제목이 이 수 이상 겹쳐야 승격한다
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const normAlbum = (s: string) => (s || "").normalize("NFKC").toLowerCase()
  .replace(/\s*[([][^)\]]*(deluxe|edition|remaster|remastered|version|ver\.|repackage|anniversary|expanded|bonus)[^)\]]*[)\]]/gi, "")
  .replace(/[^\p{L}\p{N}]/gu, "");

const MB_UA = "Sortify/1.0 ( https://sortify.kr )";
let mbLast = 0, mbCalls = 0;
/** MusicBrainz 에 이 이름의 한국 아티스트가 몇 명인지. 한 명이면 그 MBID 를 돌려준다. */
async function mbUniqueKorean(name: string): Promise<string | null> {
  const wait = 1100 - (Date.now() - mbLast);
  if (wait > 0) await sleep(wait);
  mbLast = Date.now(); mbCalls++;
  try {
    const q = encodeURIComponent(`artist:"${name}" AND country:KR`);
    const r = await fetch(`https://musicbrainz.org/ws/2/artist?query=${q}&limit=10&fmt=json`, {
      headers: { "User-Agent": MB_UA }, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const exact = (j.artists ?? []).filter((a: any) => norm(a.name) === norm(name) && a.country === "KR");
    return exact.length === 1 ? exact[0].id : null;
  } catch { return null; }
}

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
    if (j?.error?.code === 4) { await sleep(5000); continue; }   // 한도
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

async function main() {
  const limit = Number(process.argv[2] ?? 200);
  const go = process.argv.includes("--go");

  // 이용자가 실제로 열 아티스트 (홍보 대상 + 전곡 모드 첫 화면 선정)
  const warm = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
  ]);

  const maps = await fetchAll<any>((f, t) => sb.from("mb_spotify_map")
    .select("spotify_id, mbid, confidence").eq("entity", "artist")
    .not("confidence", "in", "(url_rel,manual)").order("spotify_id").range(f, t));

  // 후보: 우리 DB 에 이 아티스트의 앨범이 이미 있고, 한국·일본 아티스트인 것부터
  const mbids = [...new Set(maps.map((m) => m.mbid))];
  const info = new Map<string, any>();
  for (let i = 0; i < mbids.length; i += 200) {
    const { data } = await sb.from("mb_artist").select("mbid, name, name_ko, country").in("mbid", mbids.slice(i, i + 200));
    for (const a of data ?? []) info.set(a.mbid, a);
  }
  const albumsOf = new Map<string, string[]>();
  for (let i = 0; i < mbids.length; i += 100) {
    const rows = await fetchAll<any>((f, t) => sb.from("mb_release_group").select("artist_mbid, title")
      .in("artist_mbid", mbids.slice(i, i + 100)).order("mbid").range(f, t));
    for (const r of rows) albumsOf.set(r.artist_mbid, [...(albumsOf.get(r.artist_mbid) ?? []), r.title]);
  }

  const cands = maps
    .map((m) => ({ ...m, a: info.get(m.mbid), albums: albumsOf.get(m.mbid) ?? [] }))
    .filter((c) => c.a && c.albums.length >= NEED_OVERLAP && ["KR", "JP"].includes(c.a.country))
    .sort((x, y) => (warm.has(y.spotify_id) ? 1 : 0) - (warm.has(x.spotify_id) ? 1 : 0) || y.albums.length - x.albums.length)
    .slice(0, limit);

  console.log(`후보 ${cands.length}명 (이름만 연결 · 앨범 이미 있음 · KR/JP)${go ? "" : " — 확인만 한다 (--go 로 실제 승격)"}`);

  let up = 0, no = 0, notFound = 0;
  for (const [i, c] of cands.entries()) {
    if (i % 20 === 0) console.log(`  ${i}/${cands.length} 승격 ${up} · 근거부족 ${no} · Deezer없음 ${notFound} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    const ours = new Set(c.albums.map(normAlbum));
    const queries = [...new Set([c.a.name, c.a.name_ko].filter(Boolean))] as string[];
    let best: { id: number; name: string; overlap: number; titles: string[] } | null = null;
    for (const q of queries) {
      const res = await dz(`/search/artist?q=${encodeURIComponent(q)}&limit=5`);
      for (const d of (res?.data ?? []).filter((x: any) => norm(x.name) === norm(q))) {
        const alb = await dz(`/artist/${d.id}/albums?limit=50`);
        const titles = (alb?.data ?? []).map((x: any) => x.title as string);
        const overlap = titles.filter((t: string) => ours.has(normAlbum(t))).length;
        if (!best || overlap > best.overlap) best = { id: d.id, name: d.name, overlap, titles };
        if (overlap >= NEED_OVERLAP) break;
      }
      if (best && best.overlap >= NEED_OVERLAP) break;
    }
    let why = "";
    if (best && best.overlap >= NEED_OVERLAP) why = `Deezer 앨범 ${best.overlap}장 일치`;
    else {
      // 2단계: MusicBrainz 에 같은 한글 이름의 한국 아티스트가 유일한가
      const hangul = /[가-힣]/.test(c.a.name);
      if (hangul && c.a.country === "KR") {
        const only = await mbUniqueKorean(c.a.name);
        if (only && only === c.mbid) why = "MusicBrainz 에 같은 이름의 한국 아티스트가 1명뿐";
      }
    }
    if (!why) { if (best) no++; else notFound++; continue; }

    console.log(`  [승격] ${c.a.name} (앨범 ${c.albums.length}장 · ${why}) ${c.spotify_id}`);
    if (go) {
      const { error } = await sb.from("mb_spotify_map")
        .update({ confidence: "manual" }).eq("spotify_id", c.spotify_id).eq("entity", "artist");
      if (error) throw new Error(error.message);
      // 확인에 쓴 Deezer 아티스트도 같이 기록해 둔다 (앨범 수집 대상이 된다)
      if (best && best.overlap >= NEED_OVERLAP) {
        await sb.from("deezer_artist").upsert({
          deezer_artist_id: best.id, mbid: c.mbid, name: best.name, matched_by: "name+album",
        }, { onConflict: "deezer_artist_id", ignoreDuplicates: true });
      }
    }
    up++;
  }
  console.log(`\n완료 · 승격 ${go ? "" : "가능 "}${up} · 근거부족 ${no} · Deezer 없음 ${notFound} · Deezer 호출 ${calls}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
