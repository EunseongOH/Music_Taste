// 홍보 전 운영 캐시 사전 수집 (main 코드가 읽는 spotify_cache_* 테이블을 운영과 같은 모양으로 채운다)
//
// 사용:
//   npx tsx --env-file=.env.local scripts/prelaunch-warm.ts targets            대상 명단 만들기 (Spotify 0회)
//   npx tsx --env-file=.env.local scripts/prelaunch-warm.ts plan               남은 작업량 계산 (Spotify 0회)
//   npx tsx --env-file=.env.local scripts/prelaunch-warm.ts albums S 150 --go  앨범 목록 채우기 (등급, 호출 예산)
//   npx tsx --env-file=.env.local scripts/prelaunch-warm.ts tracks S 300 --go  앨범 트랙 채우기
//   --go 가 없으면 호출하지 않고 무엇을 할지만 출력한다.
//
// 안전장치 (docs/canonical-db/spotify-quota-plan.md 1.5):
//   - 모든 호출 전에 spotify_endpoint_gate(ep) 로 차단 확인과 계수. 차단 중이면 즉시 종료
//   - 오늘 spotify_429_log 에 기록이 하나라도 있으면 시작하지 않음
//   - 429 를 받으면 기록하고 즉시 종료 (재시도 없음)
//   - 호출 간격 1.5초 (30초 이동 창 기준 20회)
//   - 운영과 같은 키로 저장: 앨범 목록 (artist_id, 'ko', offset=10 단위, limit=10), 트랙 (album_id, 'ko'), 만료 21일
//     앨범 목록은 limit=50 으로 받아 10개씩 잘라 저장한다 (호출 1/5)

import { readFileSync, existsSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const SP = "C:/Users/User/AppData/Local/Temp/claude/c--Users-User-Music-Taste/825bed57-8bdc-4c43-b157-6fbdd08f2cd4/scratchpad";
const LOCALE = "ko";
const TTL_DAYS = 21;
const GAP_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const expiresAt = () => new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString();

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// ---------------------------------------------------------------- 대상 명단
async function targets() {
  const add = new Map<string, { name?: string; tier: "S" | "A"; sources: Set<string> }>();
  const put = (id: string | undefined, name: string | undefined, tier: "S" | "A", src: string) => {
    if (!id || !/^[0-9A-Za-z]{22}$/.test(id)) return;
    const cur = add.get(id);
    if (!cur) add.set(id, { name, tier, sources: new Set([src]) });
    else { cur.sources.add(src); if (tier === "S") cur.tier = "S"; cur.name ??= name; }
  };

  // S: 탐색 첫 화면(큐레이션), 실제 이용, 차트, 아이돌·팬덤 목록, 사용자가 직접 준 링크
  const curated = readFileSync("src/utils/curatedArtists.ts", "utf8");
  for (const m of curated.matchAll(/id: ?["']([0-9A-Za-z]{22})["'], ?name: ?["']([^"']+)["']/g)) put(m[1], m[2], "S", "curated");
  for (const r of await fetchAll<any>((f, t) => sb.from("tournament_results").select("artist_id, artist_name").not("artist_id", "is", null).range(f, t))) put(r.artist_id, r.artist_name, "S", "usage");
  for (const r of await fetchAll<any>((f, t) => sb.from("spotify_cache_artist_albums").select("artist_id").range(f, t))) put(r.artist_id, undefined, "S", "usage");
  for (const r of await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id").eq("entity", "artist").eq("confidence", "manual").range(f, t))) put(r.spotify_id, undefined, "S", "user_link");
  const lists: [string, "S" | "A"][] = [["chart", "S"], ["idol", "S"], ["kfandom", "S"], ["festival_jpop", "A"], ["indie", "A"]];
  for (const [f, tier] of lists) {
    const p = `${SP}/${f}_resolution.json`;
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, "utf8"));
    for (const r of j.resolved ?? []) put(r.spotifyId, r.label ?? r.name, tier, f);
  }

  // 이름 채우기
  const ids = [...add.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb.from("canonical_artist").select("spotify_id, name, name_ko").in("spotify_id", ids.slice(i, i + 500));
    for (const a of data ?? []) { const t = add.get(a.spotify_id)!; t.name ??= a.name_ko ?? a.name; }
  }

  const rows = [...add.entries()].map(([spotify_id, v]) => ({ spotify_id, name: v.name ?? null, tier: v.tier, sources: [...v.sources] }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("prelaunch_targets").upsert(rows.slice(i, i + 500), { onConflict: "spotify_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`대상 ${rows.length}명 · S ${rows.filter((r) => r.tier === "S").length} · A ${rows.filter((r) => r.tier === "A").length}`);
}

// ---------------------------------------------------------------- 현황 계산 (호출 없음)
async function liveAlbumPages(artistIds: string[]) {
  const rows = new Map<string, any[]>();
  for (let i = 0; i < artistIds.length; i += 300) {
    const { data, error } = await sb.from("spotify_cache_artist_albums")
      .select('artist_id, "offset", total, items')
      .in("artist_id", artistIds.slice(i, i + 300)).eq("locale", LOCALE).eq("limit", 10).gt("expires_at", new Date().toISOString());
    if (error) throw new Error(error.message);
    for (const r of data ?? []) rows.set(r.artist_id, [...(rows.get(r.artist_id) ?? []), r]);
  }
  // 모든 페이지가 채워진 아티스트만 "완료"로 본다
  const complete = new Map<string, string[]>();
  for (const [id, pages] of rows) {
    const total = pages[0]?.total ?? 0;
    const need = Math.ceil(total / 10);
    const have = new Set(pages.map((p) => p.offset));
    if (total > 0 && [...Array(need).keys()].every((k) => have.has(k * 10))) {
      complete.set(id, pages.flatMap((p) => (p.items ?? []).map((a: any) => a.id)).filter(Boolean));
    }
  }
  return complete;
}

async function liveTrackAlbums(albumIds: string[]) {
  const live = new Set<string>();
  for (let i = 0; i < albumIds.length; i += 300) {
    const { data, error } = await sb.from("spotify_cache_album_tracks")
      .select("album_id").in("album_id", albumIds.slice(i, i + 300)).eq("locale", LOCALE).gt("expires_at", new Date().toISOString());
    if (error) throw new Error(error.message);
    for (const r of data ?? []) live.add(r.album_id);
  }
  return live;
}

async function loadTargets(tier?: string) {
  let q = sb.from("prelaunch_targets").select("spotify_id, name, tier");
  if (tier) q = q.eq("tier", tier);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function plan() {
  for (const tier of ["S", "A"]) {
    const t = await loadTargets(tier);
    const done = await liveAlbumPages(t.map((x) => x.spotify_id));
    const albumIds = [...done.values()].flat();
    const liveTracks = await liveTrackAlbums(albumIds);
    const avg = 36; // 실측 평균 앨범 수 (2026-09-17)
    const pendingArtists = t.length - done.size;
    console.log(`[${tier}] 아티스트 ${t.length} · 앨범 목록 캐시 완료 ${done.size} · 남은 아티스트 ${pendingArtists} (예상 호출 약 ${Math.ceil(pendingArtists * 1.2)})`);
    console.log(`     완료 아티스트의 앨범 ${albumIds.length} · 트랙 캐시 있음 ${liveTracks.size} · 없음 ${albumIds.length - liveTracks.size}`);
    console.log(`     목록 미확보 아티스트까지 합친 트랙 캐시 예상 필요량 약 ${albumIds.length - liveTracks.size + pendingArtists * avg}`);
  }
}

// ---------------------------------------------------------------- Spotify 호출 (예산·게이트·즉시 중단)
let token = "";
async function getToken() {
  if (token) return token;
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials",
  });
  token = (await r.json()).access_token;
  return token;
}

class Stop extends Error {}
let calls = 0;

async function spotify(url: string, endpoint: string, budget: number): Promise<any> {
  if (calls >= budget) throw new Stop(`예산 ${budget}회 소진`);
  const { data: open, error } = await sb.rpc("spotify_endpoint_gate", { ep: endpoint });
  if (error) throw new Stop(`게이트 확인 실패: ${error.message} (안전을 위해 중단)`);
  if (open === false) throw new Stop(`${endpoint} 차단 중`);
  await sleep(GAP_MS);
  calls++;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await getToken()}`, "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" } });
  if (r.status === 429) {
    const secs = Number(r.headers.get("Retry-After")) || 60;
    const reason = await r.json().then((b) => b?.error?.reason).catch(() => undefined);
    await sb.rpc("spotify_record_429", { ep: endpoint, secs: reason === "QUOTA_EXCEEDED" ? secs : Math.min(secs, 3600), why: reason ?? "RATE_LIMIT" });
    throw new Stop(`429 ${reason ?? ""} on ${endpoint}, Retry-After ${secs}s — 즉시 중단`);
  }
  if (!r.ok) return null;
  return r.json();
}

async function preflight() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await sb.from("spotify_429_log").select("at, endpoint, reason").gte("at", since);
  if (data?.length) throw new Stop(`최근 24시간 429 기록 ${data.length}건 — 시작하지 않음`);
}

async function warmAlbums(tier: string, budget: number, go: boolean) {
  const t = await loadTargets(tier);
  const done = await liveAlbumPages(t.map((x) => x.spotify_id));
  const todo = t.filter((x) => !done.has(x.spotify_id));
  console.log(`[albums ${tier}] 남은 아티스트 ${todo.length} · 예산 ${budget}회${go ? "" : " · 미실행(--go 없음)"}`);
  if (!go) return;
  await preflight();
  let artists = 0;
  for (const a of todo) {
    const items: any[] = [];
    let total = 0;
    for (let offset = 0; ; offset += 50) {
      const j = await spotify(
        `https://api.spotify.com/v1/artists/${a.spotify_id}/albums?include_groups=album,single,ep&limit=50&offset=${offset}&market=KR`,
        "/v1/artists/{id}/albums", budget,
      );
      if (!j) break;
      total = j.total ?? 0;
      items.push(...(j.items ?? []));
      if (items.length >= total || !(j.items ?? []).length) break;
    }
    if (!total || items.length < total) continue; // 불완전하면 저장하지 않는다 (운영이 빈/부분 캐시를 쓰지 않게)
    const now = new Date().toISOString();
    const rows = [];
    for (let k = 0; k * 10 < total; k++) {
      rows.push({ artist_id: a.spotify_id, locale: LOCALE, offset: k * 10, limit: 10, items: items.slice(k * 10, k * 10 + 10), total, cached_at: now, expires_at: expiresAt() });
    }
    const { error } = await sb.from("spotify_cache_artist_albums").upsert(rows, { onConflict: "artist_id,locale,offset,limit" });
    if (error) throw new Error(error.message);
    await sb.from("prelaunch_targets").update({ spotify_albums: total, albums_warmed_at: now, checked_at: now }).eq("spotify_id", a.spotify_id);
    artists++;
  }
  console.log(`[albums ${tier}] 완료 아티스트 ${artists} · 호출 ${calls}`);
}

async function warmTracks(tier: string, budget: number, go: boolean) {
  const t = await loadTargets(tier);
  const done = await liveAlbumPages(t.map((x) => x.spotify_id));
  const albumIds = [...new Set([...done.values()].flat())];
  const live = await liveTrackAlbums(albumIds);
  const todo = albumIds.filter((id) => !live.has(id));
  console.log(`[tracks ${tier}] 앨범 ${albumIds.length} · 캐시 없음 ${todo.length} · 예산 ${budget}회${go ? "" : " · 미실행(--go 없음)"}`);
  if (!go) return;
  await preflight();
  let albums = 0;
  for (const id of todo) {
    const items: any[] = [];
    let total = 0;
    for (let offset = 0; ; offset += 50) {
      const j = await spotify(`https://api.spotify.com/v1/albums/${id}/tracks?limit=50&offset=${offset}&market=KR`, "/v1/albums/{id}/tracks", budget);
      if (!j) break;
      total = j.total ?? 0;
      items.push(...(j.items ?? []));
      if (items.length >= total || !(j.items ?? []).length) break;
    }
    if (!items.length || items.length < total) continue;
    const { error } = await sb.from("spotify_cache_album_tracks").upsert(
      { album_id: id, locale: LOCALE, items, cached_at: new Date().toISOString(), expires_at: expiresAt() },
      { onConflict: "album_id,locale" },
    );
    if (error) throw new Error(error.message);
    albums++;
  }
  console.log(`[tracks ${tier}] 완료 앨범 ${albums} · 호출 ${calls}`);
}

async function main() {
  const [cmd, tier = "S", budgetArg = "0"] = process.argv.slice(2);
  const go = process.argv.includes("--go");
  const budget = Number(budgetArg);
  try {
    if (cmd === "targets") await targets();
    else if (cmd === "plan") await plan();
    else if (cmd === "albums") await warmAlbums(tier, budget, go);
    else if (cmd === "tracks") await warmTracks(tier, budget, go);
    else console.log("명령: targets | plan | albums <S|A> <예산> [--go] | tracks <S|A> <예산> [--go]");
  } catch (e) {
    if (e instanceof Stop) console.log(`중단: ${e.message} · 호출 ${calls}`);
    else throw e;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
