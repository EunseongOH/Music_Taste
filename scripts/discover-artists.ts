// 새 아티스트를 찾아 DB 에 들인다. Spotify 호출 0회.
//
// 어떻게 찾는가
//   1) scan   MusicBrainz 에서 최근 한국 발매를 훑어 아티스트 후보를 모은다 (country:KR, 최근 2년).
//             릴리스 검색은 CC0 core 데이터고, 초당 1회 제한만 지키면 된다.
//   2) rank   후보마다 Deezer 팬 수를 본다. 인기 판단 기준이 이것뿐이다 (차트는 지역 구분이 없다).
//   3) add    팬 수가 기준 이상인 후보를 들인다. MusicBrainz 아티스트 정보 + Spotify 링크(URL 관계가
//             있을 때만) + 발매그룹을 넣는다. Spotify ID 를 추측하지 않는다 — 없으면 연결 없이 둔다.
//
// 중복 방지
//   - 이미 있는 mbid, 이미 쓰는 Spotify ID 는 넣지 않는다.
//   - 이름이 같고 나라가 같은 아티스트가 이미 있으면 사람이 볼 수 있게 note 에 남기고 건너뛴다.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/discover-artists.ts scan [페이지수]
//   npx tsx --env-file=.env.local scripts/discover-artists.ts rank [후보수]
//   npx tsx --env-file=.env.local scripts/discover-artists.ts add  [후보수] [--go]

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const UA = "Sortify/1.0 ( https://sortify.kr )";
const MIN_FANS = Number(process.env.MIN_FANS ?? 3000);   // 이 정도는 돼야 이용자가 찾는다
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** MusicBrainz 는 "2025" 나 "2025-03" 처럼 짧은 날짜도 준다. 날짜 칸에 넣으려면 채워야 한다. */
const fullDate = (d?: string | null) =>
  !d ? null : d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d.slice(0, 10);

let mbLast = 0, mbCalls = 0;
async function mb(path: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const wait = 1100 - (Date.now() - mbLast);
    if (wait > 0) await sleep(wait);
    mbLast = Date.now(); mbCalls++;
    try {
      const r = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return r.json();
      if (r.status === 503 || r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      return null;
    } catch { await sleep(2000); }
  }
  return null;
}

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

/** 1) 최근 한국 발매에서 아티스트 후보 모으기 */
async function scan(pages: number) {
  const known = new Set((await fetchAll<any>((f, t) => sb.from("mb_artist").select("mbid").order("mbid").range(f, t))).map((r) => r.mbid));
  const have = new Set((await fetchAll<any>((f, t) => sb.from("artist_candidate").select("mbid").order("mbid").range(f, t))).map((r) => r.mbid));
  const year = new Date().getFullYear();
  const q = encodeURIComponent(`country:KR AND date:[${year - 2}-01-01 TO ${year + 1}-12-31]`);
  const found = new Map<string, { name: string; date: string; n: number }>();

  for (let page = 0; page < pages; page++) {
    const d = await mb(`release?query=${q}&limit=100&offset=${page * 100}&fmt=json`);
    const rels = d?.releases ?? [];
    if (!rels.length) break;
    for (const rel of rels) {
      const credits = rel["artist-credit"] ?? [];
      for (const c of credits) {
        const a = c.artist;
        if (!a?.id || known.has(a.id) || have.has(a.id)) continue;
        const cur = found.get(a.id) ?? { name: a.name, date: "", n: 0 };
        cur.n++;
        if ((rel.date ?? "") > cur.date) cur.date = rel.date ?? "";
        found.set(a.id, cur);
      }
    }
    console.log(`  ${page + 1}/${pages}쪽 · 새 후보 ${found.size} · MB 호출 ${mbCalls}`);
  }

  const rows = [...found].map(([mbid, v]) => ({
    mbid, name: v.name, country: "KR",
    latest_date: fullDate(v.date), releases: v.n,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("artist_candidate").upsert(rows.slice(i, i + 200), { onConflict: "mbid", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  console.log(`완료 · 새 후보 ${rows.length}명 (이미 아는 아티스트 제외)`);
}

/** 2) 후보의 인기(Deezer 팬 수) 확인 */
async function rank(limit: number) {
  const { data: todo } = await sb.from("artist_candidate").select("mbid, name, releases")
    .eq("status", "new").order("releases", { ascending: false }).limit(limit);
  console.log(`인기 확인 대상 ${todo?.length ?? 0}명`);
  let ok = 0;
  for (const [i, c] of (todo ?? []).entries()) {
    if (i % 25 === 0) console.log(`  ${i}/${todo!.length} · Deezer 호출 ${dzCalls} ${new Date().toLocaleTimeString()}`);
    const res = await dz(`/search/artist?q=${encodeURIComponent(c.name)}&limit=5`);
    const hit = (res?.data ?? []).find((d: any) => norm(d.name) === norm(c.name));
    const fans = hit?.nb_fan ?? 0;
    await sb.from("artist_candidate").update({ nb_fan: fans, status: "checked" }).eq("mbid", c.mbid);
    if (fans >= MIN_FANS) ok++;
  }
  console.log(`완료 · 기준(${MIN_FANS}팬) 넘은 후보 ${ok}명 · Deezer 호출 ${dzCalls}`);
}

/** 3) 들이기 — MusicBrainz 아티스트 정보 + Spotify 링크 + 발매그룹 */
async function add(limit: number, go: boolean) {
  const { data: todo } = await sb.from("artist_candidate").select("mbid, name, nb_fan")
    .eq("status", "checked").gte("nb_fan", MIN_FANS).order("nb_fan", { ascending: false }).limit(limit);
  console.log(`들일 후보 ${todo?.length ?? 0}명${go ? "" : " — 확인만 한다 (--go 로 반영)"}`);

  const usedSpotify = new Set((await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id").eq("entity", "artist").order("spotify_id").range(f, t))).map((r) => r.spotify_id));
  let added = 0, noLink = 0, dupName = 0;

  for (const [i, c] of (todo ?? []).entries()) {
    if (i % 10 === 0) console.log(`  ${i}/${todo!.length} 들임 ${added} · 링크없음 ${noLink} · 이름겹침 ${dupName} · MB 호출 ${mbCalls}`);
    const a = await mb(`artist/${c.mbid}?inc=url-rels+aliases&fmt=json`);
    if (!a?.id) continue;

    // 이름이 같은 한국 아티스트가 이미 있으면 사람이 확인해야 한다
    const { data: same } = await sb.from("mb_artist").select("mbid, name").eq("country", "KR").ilike("name", a.name).limit(1);
    if (same?.length) {
      dupName++;
      if (go) await sb.from("artist_candidate").update({ status: "skipped", note: `이름이 같은 아티스트가 이미 있다 (${same[0].mbid})` }).eq("mbid", c.mbid);
      continue;
    }

    const spUrl = (a.relations ?? []).find((r: any) => String(r.url?.resource ?? "").includes("open.spotify.com/artist/"));
    const spotify = spUrl ? String(spUrl.url.resource).split("/artist/")[1]?.split(/[?#/]/)[0] : null;
    if (!spotify) { noLink++; if (go) await sb.from("artist_candidate").update({ status: "skipped", note: "Spotify 링크 없음" }).eq("mbid", c.mbid); continue; }
    if (usedSpotify.has(spotify)) { dupName++; if (go) await sb.from("artist_candidate").update({ status: "skipped", note: `Spotify ID 가 이미 쓰인다 (${spotify})` }).eq("mbid", c.mbid); continue; }

    const aliases = (a.aliases ?? []).map((x: any) => ({ name: x.name, type: x.type ?? null, locale: x.locale ?? null }));
    const nameKo = (a.aliases ?? []).find((x: any) => String(x.locale ?? "").startsWith("ko"))?.name
      ?? (/[가-힣]/.test(a.name) ? a.name : null);

    console.log(`  [들임] ${a.name}${nameKo && nameKo !== a.name ? ` (${nameKo})` : ""} · 팬 ${c.nb_fan} · ${spotify}`);
    if (!go) { added++; continue; }

    const { error: e1 } = await sb.from("mb_artist").upsert({
      mbid: a.id, name: a.name, sort_name: a["sort-name"] ?? null, country: a.country ?? "KR",
      aliases, ...(nameKo ? { name_ko: nameKo } : {}), updated_at: new Date().toISOString(),
    }, { onConflict: "mbid" });
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await sb.from("mb_spotify_map").upsert(
      { spotify_id: spotify, entity: "artist", mbid: a.id, confidence: "url_rel" }, { onConflict: "spotify_id" });
    if (e2) throw new Error(e2.message);
    usedSpotify.add(spotify);

    // 발매그룹 (이 아티스트가 낸 앨범 목록). 트랙리스트는 mb-rg-fill 이 이어서 채운다.
    for (let off = 0; off < 300; off += 100) {
      const rg = await mb(`release-group?artist=${a.id}&limit=100&offset=${off}&fmt=json`);
      const groups = rg?.["release-groups"] ?? [];
      if (!groups.length) break;
      const rows = groups.map((g: any) => ({
        mbid: g.id, artist_mbid: a.id, title: g.title,
        primary_type: g["primary-type"] ?? null,
        first_release_date: g["first-release-date"]
          ? (g["first-release-date"].length === 4 ? `${g["first-release-date"]}-01-01`
            : g["first-release-date"].length === 7 ? `${g["first-release-date"]}-01` : g["first-release-date"])
          : null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await sb.from("mb_release_group").upsert(rows, { onConflict: "mbid" });
      if (error) throw new Error(error.message);
      if (off + groups.length >= (rg["release-group-count"] ?? 0)) break;
    }
    await sb.from("artist_candidate").update({ status: "added", spotify_id: spotify }).eq("mbid", c.mbid);
    added++;
  }
  console.log(`\n완료 · 들임 ${added} · Spotify 링크 없음 ${noLink} · 이미 있음 ${dupName} · MB 호출 ${mbCalls} · Deezer 호출 ${dzCalls}`);
}

const cmd = process.argv[2];
const n = Number(process.argv[3] ?? 10);
const go = process.argv.includes("--go");
if (cmd === "scan") scan(n);
else if (cmd === "rank") rank(n);
else if (cmd === "add") add(n, go);
else { console.log("scan [페이지수] | rank [후보수] | add [후보수] [--go]"); process.exit(1); }
