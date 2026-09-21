// Spotify 앨범 캐시 ↔ MusicBrainz 발매그룹을 제목·발매연도·곡 수로 대조해 연결한다. Spotify 호출 0회.
// (계획서 docs/canonical-db/spotify-quota-plan.md H1)
//
// 사용:
//   npx tsx --env-file=.env.local scripts/mb-title-match.ts match    연결 후보를 찾아 mb_album_release 에 넣고 워커 큐에 아티스트 등록
//   npx tsx --env-file=.env.local scripts/mb-title-match.ts verify   워커가 채운 트랙리스트를 Spotify 트랙 캐시와 대조해 틀린 연결 제거
//
// 기준:
//   - 제목(정규화)과 발매연도가 같은 발매그룹이 정확히 하나 (앨범 종류가 맞는 것 우선)
//   - 그 발매그룹의 발매판 중 곡 수 합계가 Spotify total_tracks 와 같은 것
//   - verify: Spotify 트랙 캐시가 있으면 순서대로 곡 제목 90% 이상 일치해야 유지

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function mb(path: string): Promise<any> {
  for (let i = 0; i < 12; i++) {
    await sleep(1150);
    let r: Response;
    try {
      r = await fetch("https://musicbrainz.org/ws/2/" + path, { headers: { "User-Agent": "Sortify/1.0 ( https://sortify.kr )" }, signal: AbortSignal.timeout(20000) });
    } catch { continue; }
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    if (r.status !== 503 && r.status !== 429) return null;
    await sleep((Number(r.headers.get("Retry-After")) || 2) * 1000);
  }
  return null;
}

const TYPE: Record<string, string> = { album: "Album", single: "Single", ep: "EP", compilation: "Album" };

async function match() {
  const v1 = await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums").select("artist_id, items").order("artist_id").range(f, t));
  const v2 = await fetchAll<any>((f, t) => sb.from("spotify_album_cache_v2").select("artist_id, items").order("artist_id").range(f, t));
  const albums = new Map<string, any>();
  for (const row of [...v1, ...v2]) for (const a of row.items ?? []) if (a?.id && !albums.has(a.id)) albums.set(a.id, { ...a, artist: row.artist_id });

  const linked = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("mb_album_release").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
    ...(await fetchAll<any>((f, t) => sb.from("discogs_album_match").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
    ...(await fetchAll<any>((f, t) => sb.from("mb_album_title_match").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id),
  ]);
  const artistMb = new Map((await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, mbid").eq("entity", "artist").in("confidence", ["url_rel", "manual", "wikidata"]).order("spotify_id").range(f, t))).map((m) => [m.spotify_id, m.mbid]));

  const todo = [...albums.values()].filter((a) => !linked.has(a.id) && artistMb.has(a.artist));
  const mbids = [...new Set(todo.map((a) => artistMb.get(a.artist)))];
  const rgsByArtist = new Map<string, any[]>();
  for (let i = 0; i < mbids.length; i += 100) {
    const rows = await fetchAll<any>((f, t) => sb.from("mb_release_group").select("mbid, artist_mbid, title, primary_type, first_release_date").in("artist_mbid", mbids.slice(i, i + 100)).order("mbid").range(f, t));
    for (const r of rows) rgsByArtist.set(r.artist_mbid, [...(rgsByArtist.get(r.artist_mbid) ?? []), r]);
  }
  console.log(`미연결 Spotify 앨범 ${todo.length}`);

  const queue = new Set<string>();
  let hit = 0, noRg = 0, ambiguous = 0, noCount = 0;
  for (const [i, a] of todo.entries()) {
    if (i % 50 === 0) console.log(`  ${i}/${todo.length} 연결 ${hit} · 발매그룹 없음 ${noRg} · 애매 ${ambiguous} · 곡 수 불일치 ${noCount}`);
    const year = String(a.release_date ?? "").slice(0, 4);
    let rgs = (rgsByArtist.get(artistMb.get(a.artist)) ?? []).filter((g) => norm(g.title) === norm(a.name) && String(g.first_release_date ?? "").slice(0, 4) === year);
    if (!rgs.length) { noRg++; continue; }
    if (rgs.length > 1) {
      const typed = rgs.filter((g) => g.primary_type === TYPE[a.album_type]);
      if (typed.length !== 1) { ambiguous++; continue; }
      rgs = typed;
    }
    const rg = rgs[0];
    const j = await mb(`release?release-group=${rg.mbid}&inc=media&limit=100&fmt=json`);
    const releases = (j?.releases ?? [])
      .map((r: any) => ({ id: r.id, status: r.status, country: r.country, date: r.date ?? "", tracks: (r.media ?? []).reduce((s: number, m: any) => s + (m["track-count"] ?? 0), 0) }))
      .filter((r: any) => r.tracks === a.total_tracks);
    if (!releases.length) { noCount++; continue; }
    const rank = (r: any) => (r.status === "Official" ? 0 : 1) * 10 + (["KR", "JP", "XW", "US", "GB"].includes(r.country) ? 0 : 1);
    const best = releases.sort((x: any, y: any) => rank(x) - rank(y) || String(x.date).localeCompare(String(y.date)))[0];

    let e = (await sb.from("mb_album_title_match").upsert({ spotify_album_id: a.id, release_mbid: best.id, release_group_mbid: rg.mbid, spotify_tracks: a.total_tracks }, { onConflict: "spotify_album_id" })).error;
    if (e) throw new Error(e.message);
    // 기존 조회·워커 경로가 그대로 쓰도록 mb_album_release 에 넣는다 (tracks_filled_at 은 워커가 채운다)
    e = (await sb.from("mb_album_release").upsert({ spotify_album_id: a.id, release_mbid: best.id, release_group_mbid: rg.mbid }, { onConflict: "spotify_album_id", ignoreDuplicates: true })).error;
    if (e) throw new Error(e.message);
    queue.add(a.artist);
    hit++;
  }
  if (queue.size) {
    const now = new Date().toISOString();
    const { error } = await sb.from("mb_resolve_queue").upsert([...queue].map((id) => ({ spotify_id: id, entity: "artist", attempts: 0, created_at: now })), { onConflict: "spotify_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`완료 · 연결 ${hit} · 발매그룹 없음 ${noRg} · 애매 ${ambiguous} · 곡 수 불일치 ${noCount} · 워커 큐 아티스트 ${queue.size}`);
}

async function verify() {
  const rows = await fetchAll<any>((f, t) => sb.from("mb_album_title_match").select("spotify_album_id, release_mbid").is("verified", null).order("spotify_album_id").range(f, t));
  let ok = 0, rejected = 0, pending = 0, unverifiable = 0;
  const loose = (x: string) => (x || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { data: filled } = await sb.from("mb_album_release").select("spotify_album_id, tracks_filled_at").in("spotify_album_id", chunk.map((r) => r.spotify_album_id));
    const filledSet = new Set((filled ?? []).filter((r) => r.tracks_filled_at).map((r) => r.spotify_album_id));
    const { data: sp } = await sb.from("spotify_cache_album_tracks").select("album_id, items").eq("locale", "ko").in("album_id", chunk.map((r) => r.spotify_album_id));
    const spOf = new Map((sp ?? []).map((r) => [r.album_id, (r.items ?? []).map((t: any) => String(t.name ?? ""))]));
    for (const r of chunk) {
      if (!filledSet.has(r.spotify_album_id)) { pending++; continue; }
      const titles = spOf.get(r.spotify_album_id);
      if (!titles?.length) { unverifiable++; continue; }
      const { data: tracks } = await sb.from("mb_release_track").select("disc, position, title").eq("release_mbid", r.release_mbid).order("disc").order("position");
      const mbTitles = (tracks ?? []).map((t) => t.title);
      const agree = titles.filter((st: string, k: number) => {
        const d = loose(mbTitles[k] ?? ""), q = loose(st);
        return d && (q === d || q.startsWith(d) || d.startsWith(q));
      }).length / titles.length;
      if (agree >= 0.9) {
        await sb.from("mb_album_title_match").update({ verified: "ok" }).eq("spotify_album_id", r.spotify_album_id);
        ok++;
      } else {
        // 틀린 연결: 이 스크립트가 만든 mb_album_release 행만 지운다 (트랙은 다른 앨범이 같은 발매판을 쓸 수 있어 남긴다)
        await sb.from("mb_album_release").delete().eq("spotify_album_id", r.spotify_album_id).eq("release_mbid", r.release_mbid);
        await sb.from("mb_album_title_match").update({ verified: "rejected" }).eq("spotify_album_id", r.spotify_album_id);
        rejected++;
      }
    }
  }
  console.log(`검증 · 유지 ${ok} · 제거 ${rejected} · 트랙 채우기 대기 ${pending} · Spotify 트랙 캐시 없어 미검증 ${unverifiable}`);
}

const cmd = process.argv[2];
(cmd === "match" ? match() : cmd === "verify" ? verify() : Promise.resolve(console.log("명령: match | verify")))
  .catch((e) => { console.error(e); process.exit(1); });
