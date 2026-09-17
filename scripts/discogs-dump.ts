// Discogs 월간 덤프(CC0)로 트랙리스트 보강. Spotify 호출 0회. Discogs API 호출 0회.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/discogs-dump.ts links              정식 매핑 아티스트의 Discogs ID 를 MusicBrainz 링크로 수집
//   npx tsx --env-file=.env.local scripts/discogs-dump.ts parse <dump.xml.gz> 덤프에서 해당 아티스트 발매판만 추출해 로컬 NDJSON 저장
//   npx tsx --env-file=.env.local scripts/discogs-dump.ts match [ndjson]     Spotify 앨범 캐시 ↔ Discogs 발매판 연결 후, 연결된 발매판만 DB 저장
//
// DB 에는 연결된 발매판만 올린다: 같은 앨범의 나라·형식별 판이 많아 전부 올리면 무료 플랜 용량(500MB)을 넘는다.
// 앨범 목록 캐시가 늘면 덤프를 다시 읽지 않고 match 만 다시 돌린다.
//
// 라이선스: 덤프는 CC0 (data.discogs.com). 이미지·마켓 데이터는 덤프에 없고 쓰지 않는다.

import { createReadStream, statSync, createWriteStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const DIR = "C:/Users/User/discogs-dump";
const ndjsonFor = (dump: string) => `${DIR}/releases_${dump}.ndjson`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// ------------------------------------------------------------------ 1. Discogs 아티스트 ID (MusicBrainz url-rels)
async function mb(path: string): Promise<any> {
  for (let i = 0; i < 12; i++) {
    await sleep(1150);
    let r: Response;
    try {
      r = await fetch("https://musicbrainz.org/ws/2/" + path, { headers: { "User-Agent": "Sortify/1.0 ( https://sortify.kr )" }, signal: AbortSignal.timeout(20000) });
    } catch { continue; }
    if (r.ok) return r.json();
    if (r.status === 404) return { notFound: true };
    if (r.status !== 503 && r.status !== 429) return null;
    await sleep((Number(r.headers.get("Retry-After")) || 2) * 1000);
  }
  return null;
}

async function links() {
  const maps = await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("mbid").eq("entity", "artist").in("confidence", ["url_rel", "manual"]).order("spotify_id").range(f, t));
  const done = new Set((await fetchAll<any>((f, t) => sb.from("mb_artist_discogs").select("mbid").order("mbid").range(f, t))).map((r) => r.mbid));
  const checked = new Set<string>();
  const todo = [...new Set(maps.map((m) => m.mbid))].filter((m) => !done.has(m));
  console.log(`대상 ${todo.length}명 (이미 수집 ${done.size})`);
  let found = 0, none = 0, fail = 0;
  for (const [i, mbid] of todo.entries()) {
    if (i % 100 === 0) console.log(`  ${i}/${todo.length} 찾음 ${found} 없음 ${none} 실패 ${fail} ${new Date().toLocaleTimeString()}`);
    const d = await mb(`artist/${mbid}?inc=url-rels&fmt=json`);
    if (!d || d.notFound) { fail++; continue; }
    const ids = (d.relations ?? [])
      .map((r: any) => String(r.url?.resource ?? ""))
      .map((u: string) => u.match(/discogs\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number);
    checked.add(mbid);
    if (!ids.length) { none++; continue; }
    const { error } = await sb.from("mb_artist_discogs").upsert([...new Set(ids)].map((id) => ({ mbid, discogs_artist_id: id })), { onConflict: "mbid,discogs_artist_id" });
    if (error) throw new Error(error.message);
    found++;
  }
  console.log(`완료 · 찾음 ${found} · 링크 없음 ${none} · 조회 실패 ${fail}`);
}

// ------------------------------------------------------------------ 2. 덤프 파싱
const unescape = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? unescape(m[1]) : null; };
const all = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => unescape(m[1]));

function parseRelease(xml: string) {
  const id = Number(xml.match(/^<release id="(\d+)"/)?.[1]);
  const artistsBlock = xml.match(/<artists>([\s\S]*?)<\/artists>/)?.[1] ?? "";
  const artistIds = [...artistsBlock.matchAll(/<artist><id>(\d+)<\/id>/g)].map((m) => Number(m[1]));
  const trackBlock = xml.match(/<tracklist>([\s\S]*?)<\/tracklist>/)?.[1] ?? "";
  const tracks: { position: string | null; title: string; duration: string | null }[] = [];
  // 최상위 <track> 만 (sub_tracks 안의 track 은 건너뛴다). 소제목(heading)·인덱스 줄은 곡이 아니다
  const trackRe = /<track>([\s\S]*?)<\/track>/g;
  let depthSafe = trackBlock.replace(/<sub_tracks>[\s\S]*?<\/sub_tracks>/g, "");
  for (const m of depthSafe.matchAll(trackRe)) {
    const t = m[1];
    const type = tag(t, "type_");
    if (type && type !== "track") continue;
    const title = tag(t, "title");
    if (!title) continue;
    tracks.push({ position: tag(t, "position") || null, title, duration: tag(t, "duration") || null });
  }
  const master = xml.match(/<master_id is_main_release="(true|false)">(\d+)<\/master_id>/);
  const formats = [...xml.matchAll(/<format name="([^"]*)"/g)].map((m) => unescape(m[1]));
  const barcode = xml.match(/<identifier type="Barcode"[^>]*value="([^"]*)"/)?.[1] ?? null;
  return {
    release_id: id,
    artistIds,
    master_id: master ? Number(master[2]) : null,
    is_main_release: master ? master[1] === "true" : null,
    title: tag(xml, "title") ?? "",
    released: tag(xml, "released"),
    country: tag(xml, "country"),
    formats,
    genres: all(xml.match(/<genres>([\s\S]*?)<\/genres>/)?.[1] ?? "", "genre"),
    styles: all(xml.match(/<styles>([\s\S]*?)<\/styles>/)?.[1] ?? "", "style"),
    barcode: barcode ? unescape(barcode) : null,
    tracks,
  };
}

async function parse(file: string) {
  const dump = file.match(/discogs_(\d{8})_releases/)?.[1] ?? "unknown";
  const wanted = new Set((await fetchAll<any>((f, t) => sb.from("mb_artist_discogs").select("discogs_artist_id").order("mbid").range(f, t))).map((r) => Number(r.discogs_artist_id)));
  console.log(`Discogs 아티스트 ${wanted.size}명 대상 · 파일 ${(statSync(file).size / 1e9).toFixed(1)}GB`);
  if (!wanted.size) throw new Error("mb_artist_discogs 가 비어 있음. links 먼저");

  const outPath = ndjsonFor(dump);
  const out = createWriteStream(outPath, { encoding: "utf8" });
  let buf = "", seen = 0, kept = 0, tracksKept = 0, bytes = 0;
  const size = statSync(file).size;
  const src = createReadStream(file);
  src.on("data", (c) => { bytes += (c as Buffer).length; });
  const gz = src.pipe(createGunzip());
  const started = Date.now();
  const maxBytes = Number(process.env.MAX_MB ?? 0) * 1e6; // 속도 측정용: 압축 기준 앞부분만 처리
  let lastLog = 0;
  for await (const chunk of gz) {
    if (maxBytes && bytes > maxBytes) break;
    buf += chunk.toString("utf8");
    let end: number;
    while ((end = buf.indexOf("</release>")) >= 0) {
      const startIdx = buf.lastIndexOf("<release id=", end);
      const xml = startIdx >= 0 ? buf.slice(startIdx, end + 10) : "";
      buf = buf.slice(end + 10);
      if (!xml) continue;
      seen++;
      // 빠른 거르기: 메인 아티스트 ID 가 대상에 있는지 먼저 본다
      const artistsBlock = xml.match(/<artists>([\s\S]*?)<\/artists>/)?.[1] ?? "";
      const ids = [...artistsBlock.matchAll(/<artist><id>(\d+)<\/id>/g)].map((m) => Number(m[1]));
      const hits = ids.filter((i) => wanted.has(i));
      if (!hits.length) continue;
      const r = parseRelease(xml);
      if (!r.tracks.length) continue;
      const { artistIds, ...rest } = r;
      if (!out.write(JSON.stringify({ ...rest, artists: hits }) + "\n")) await new Promise<void>((res) => out.once("drain", () => res()));
      kept++; tracksKept += r.tracks.length;
    }
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log(`  ${((bytes / size) * 100).toFixed(1)}% · 발매판 ${seen.toLocaleString()} · 추출 ${kept.toLocaleString()} (곡 ${tracksKept.toLocaleString()}) · ${Math.round((Date.now() - started) / 60000)}분`);
    }
  }
  await new Promise<void>((res) => out.end(() => res()));
  console.log(`완료 · 발매판 ${seen.toLocaleString()} 중 ${kept.toLocaleString()} 추출 · 곡 ${tracksKept.toLocaleString()} · ${outPath}`);
}

// ------------------------------------------------------------------ 3. Spotify 앨범 ↔ Discogs 발매판 연결
const normTitle = (s: string) => (s || "")
  .normalize("NFKC").toLowerCase()
  .replace(/\s*[\(\[][^\)\]]*(deluxe|edition|remaster|version|ver\.|repackage|anniversary|expanded|bonus)[^\)\]]*[\)\]]/gi, "")
  .replace(/[^\p{L}\p{N}]/gu, "");

async function match(ndjson?: string) {
  // Spotify 쪽: 운영·브랜치 앨범 목록 캐시 (만료 여부와 무관하게 제목·연도·곡 수만 쓴다 — 저장하는 것은 앨범 ID 연결뿐)
  const v1 = await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums").select("artist_id, items").order("artist_id").range(f, t));
  const v2 = await fetchAll<any>((f, t) => sb.from("spotify_album_cache_v2").select("artist_id, items").order("artist_id").range(f, t));
  const spotifyAlbums = new Map<string, { artist: string; title: string; year: string; tracks: number }>();
  for (const row of [...v1, ...v2]) for (const a of row.items ?? []) {
    if (a?.id && !spotifyAlbums.has(a.id)) spotifyAlbums.set(a.id, { artist: row.artist_id, title: a.name, year: String(a.release_date ?? "").slice(0, 4), tracks: a.total_tracks });
  }
  const mapped = new Set((await fetchAll<any>((f, t) => sb.from("mb_album_release").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id));
  const already = new Set((await fetchAll<any>((f, t) => sb.from("discogs_album_match").select("spotify_album_id").order("spotify_album_id").range(f, t))).map((r) => r.spotify_album_id));

  // 아티스트: Spotify ID -> MB -> Discogs ID
  const artistMap = await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, mbid").eq("entity", "artist").in("confidence", ["url_rel", "manual"]).order("spotify_id").range(f, t));
  const disc = await fetchAll<any>((f, t) => sb.from("mb_artist_discogs").select("mbid, discogs_artist_id").order("mbid").range(f, t));
  const discOfMb = new Map<string, number[]>();
  for (const d of disc) discOfMb.set(d.mbid, [...(discOfMb.get(d.mbid) ?? []), Number(d.discogs_artist_id)]);
  const discOfSpotify = new Map<string, number[]>();
  for (const m of artistMap) if (discOfMb.has(m.mbid)) discOfSpotify.set(m.spotify_id, discOfMb.get(m.mbid)!);

  const targets = [...spotifyAlbums.entries()].filter(([id, a]) => !mapped.has(id) && !already.has(id) && discOfSpotify.has(a.artist));
  console.log(`Spotify 앨범 ${spotifyAlbums.size} · DB 미연결 ${[...spotifyAlbums.keys()].filter((id) => !mapped.has(id)).length} · Discogs 아티스트 있는 대상 ${targets.length}`);

  const file = ndjson ?? ndjsonFor("20260901");
  if (!existsSync(file)) throw new Error(`${file} 없음. parse 먼저`);
  // 1차 읽기: 연결 판단에 필요한 최소 필드만 색인 (곡 목록은 버린다 — 파일이 GB 단위라 통째로 올리면 메모리가 모자란다)
  const needArtists = new Set([...discOfSpotify.values()].flat());
  const releasesByArtist = new Map<number, any[]>();
  const readLines = () => createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of readLines()) {
    if (!line) continue;
    const r = JSON.parse(line);
    const artists = (r.artists as number[]).filter((x) => needArtists.has(x));
    if (!artists.length) continue;
    const slim = { release_id: r.release_id, title: r.title, released: r.released, track_count: r.tracks.length, is_main_release: r.is_main_release, artists };
    for (const x of artists) {
      const list = releasesByArtist.get(x);
      if (list) list.push(slim); else releasesByArtist.set(x, [slim]);
    }
  }
  console.log(`로컬 발매판 색인 아티스트 ${releasesByArtist.size}명`);
  const loadArtist = async (did: number) => releasesByArtist.get(did) ?? [];
  const dump = file.match(/releases_(\d{8})/)?.[1] ?? "unknown";

  const out: any[] = [];
  let ambiguous = 0;
  for (const [spotifyId, a] of targets) {
    const cands: any[] = [];
    for (const did of discOfSpotify.get(a.artist)!) {
      for (const r of await loadArtist(did)) {
        if (r.track_count === a.tracks && String(r.released ?? "").slice(0, 4) === a.year && normTitle(r.title) === normTitle(a.title)) cands.push(r);
      }
    }
    if (!cands.length) continue;
    // 같은 앨범의 여러 발매판(나라·형식별)은 트랙리스트가 같다. 메인 발매판을 우선, 없으면 가장 작은 ID
    const best = cands.find((c) => c.is_main_release) ?? cands.sort((x, y) => x.release_id - y.release_id)[0];
    if (cands.length > 1) ambiguous++;
    out.push({ spotify_album_id: spotifyId, release_id: best.release_id, release: null as any, artist: discOfSpotify.get(a.artist)!.find((d) => best.artists.includes(d)) ?? best.artists[0] });
  }
  // 품질 기준 (2026-09-17 표본 검수 결과):
  //  - Discogs 는 한국·일본 곡을 영어 번역 제목으로 올린 판이 많고, 같은 앨범이라도 곡 순서가 다른 판이 있다.
  //  - Spotify 트랙 캐시가 있으면 순서대로 비교한 곡 제목이 90% 이상 같을 때만 연결한다.
  //  - 캐시가 없으면 해외 아티스트이거나, 한국·일본 아티스트는 곡 제목에 한글·일본 문자가 있을 때만 연결한다.
  const countryOfSpotify = new Map<string, string | null>();
  {
    const mbids = [...new Set(artistMap.map((m) => m.mbid))];
    for (let i = 0; i < mbids.length; i += 300) {
      const { data } = await sb.from("mb_artist").select("mbid, country").in("mbid", mbids.slice(i, i + 300));
      const c = new Map((data ?? []).map((x) => [x.mbid, x.country]));
      for (const m of artistMap) if (c.has(m.mbid)) countryOfSpotify.set(m.spotify_id, c.get(m.mbid) ?? null);
    }
  }
  const spotifyTracks = new Map<string, string[]>();
  {
    const ids = out.map((o) => o.spotify_album_id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from("spotify_cache_album_tracks").select("album_id, items").eq("locale", "ko").in("album_id", ids.slice(i, i + 100));
      for (const r of data ?? []) spotifyTracks.set(r.album_id, (r.items ?? []).map((t: any) => String(t.name ?? "")));
    }
  }
  const NATIVE = /[가-힣ぁ-んァ-ン一-龯]/;
  const loose = (x: string) => (x || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const albumArtist = new Map(targets.map(([id, a]) => [id, a.artist]));
  let rejected = 0;
  const pass = (o: any, full: any) => {
    const titles: string[] = full.tracks.map((t: any) => t.title);
    const sp = spotifyTracks.get(o.spotify_album_id);
    if (sp?.length) {
      const agree = sp.filter((st, i) => {
        const d = loose(titles[i] ?? ""), q = loose(st);
        return d && (q === d || q.startsWith(d) || d.startsWith(q));
      }).length / sp.length;
      return agree >= 0.9;
    }
    const country = countryOfSpotify.get(albumArtist.get(o.spotify_album_id) ?? "");
    return !(country === "KR" || country === "JP") || titles.some((t) => NATIVE.test(t));
  };

  // 2차 읽기: 연결된 발매판만 전체 필드(곡 목록 포함)를 가져온다
  const wantedReleases = new Set(out.map((o) => o.release_id));
  const full = new Map<number, any>();
  if (wantedReleases.size) {
    for await (const line of readLines()) {
      if (!line) continue;
      const id = Number(line.slice(14, 40).match(/^(\d+)/)?.[1]); // {"release_id":667,...
      if (!wantedReleases.has(id)) continue;
      full.set(id, JSON.parse(line));
    }
  }
  for (const o of out) {
    const f = full.get(o.release_id);
    if (f && pass(o, f)) o.release = f; else { o.release = null; rejected++; }
  }
  console.log(`품질 기준 탈락 ${rejected}`);
  // 연결된 발매판만 DB 에 올린다 (발매판 -> 곡 -> 연결 순서: 연결이 있으면 곡이 반드시 있다)
  const uniq = new Map(out.filter((o) => o.release).map((o) => [o.release_id, o]));
  const relRows = [...uniq.values()].map(({ release: r, artist }) => ({
    release_id: r.release_id, discogs_artist_id: artist, master_id: r.master_id, is_main_release: r.is_main_release,
    title: r.title, released: r.released, country: r.country, formats: r.formats, genres: r.genres, styles: r.styles,
    barcode: r.barcode, track_count: r.tracks.length, dump,
  }));
  const trackRows = [...uniq.values()].flatMap(({ release: r }) => r.tracks.map((t: any, idx: number) => ({ release_id: r.release_id, idx, position: t.position, title: t.title, duration: t.duration })));
  for (let i = 0; i < relRows.length; i += 500) {
    const { error } = await sb.from("discogs_release").upsert(relRows.slice(i, i + 500), { onConflict: "release_id" });
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < trackRows.length; i += 2000) {
    const { error } = await sb.from("discogs_track").upsert(trackRows.slice(i, i + 2000), { onConflict: "release_id,idx" });
    if (error) throw new Error(error.message);
  }
  const matchRows = out.filter((o) => o.release).map((o) => ({ spotify_album_id: o.spotify_album_id, release_id: o.release_id }));
  for (let i = 0; i < matchRows.length; i += 500) {
    const { error } = await sb.from("discogs_album_match").upsert(matchRows.slice(i, i + 500), { onConflict: "spotify_album_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`업로드 · 발매판 ${relRows.length} · 곡 ${trackRows.length}`);
  console.log(`연결 ${matchRows.length} (조건 일치 ${out.length}, 후보 여러 개 중 선택 ${ambiguous})`);
}

const [cmd, arg] = process.argv.slice(2);
(cmd === "links" ? links() : cmd === "parse" ? parse(arg) : cmd === "match" ? match(arg) : Promise.resolve(console.log("명령: links | parse <file> | match")))
  .catch((e) => { console.error(e); process.exit(1); });
