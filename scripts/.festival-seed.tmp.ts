// 일회성: 페스티벌·J-Pop 목록 -> DB 에 없는 아티스트만 수요 큐에 등록
// 사용: npx tsx --env-file=.env.local scripts/.festival-seed.tmp.ts resolve|enqueue
import { readFileSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";
import { ARTIST_TRANSLATION_MAP } from "../src/utils/artistNames";

const SP = "C:/Users/User/AppData/Local/Temp/claude/c--Users-User-Music-Taste/825bed57-8bdc-4c43-b157-6fbdd08f2cd4/scratchpad";
const IN = `${SP}/${process.argv[3] ?? "festival_jpop"}.txt`;
const OUT = IN.replace(/\.txt$/, "_resolution.json");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const EN_TO_KO = new Map(Object.entries(ARTIST_TRANSLATION_MAP).map(([ko, en]) => [norm(en), ko]));
const translate = (s: string) => ARTIST_TRANSLATION_MAP[s] ?? EN_TO_KO.get(norm(s));

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

let mbLast = 0, mbCalls = 0, spCalls = 0;
async function mb(p: string): Promise<any> {
  // MB 검색 엔드포인트는 전역 창(수 초)당 400회 한도라 503 이 잦지만 금방 풀린다 → 짧게 여러 번
  for (let i = 0; i < 10; i++) {
    const w = 1100 - (Date.now() - mbLast); if (w > 0) await sleep(w);
    mbLast = Date.now(); mbCalls++;
    let r: Response;
    try { r = await fetch("https://musicbrainz.org/ws/2/" + p, { headers: { "User-Agent": "Sortify/1.0 ( https://sortify.kr )" }, signal: AbortSignal.timeout(20000) }); }
    catch { await sleep(2000); continue; }  // 끊긴 연결 무한 대기 방지
    if (r.ok) return r.json();
    if (r.status === 503 || r.status === 429) { await sleep((Number(r.headers.get("Retry-After")) || 2) * 1000); continue; }
    return { __status: r.status };
  }
  return { __t: 1 };
}

let token = "";
async function spotifySearch(q: string): Promise<any[]> {
  // 2026-09-16 이후 원칙: 로컬 배치는 Spotify 를 부르지 않는다. 사용자가 명시 허락한 경우만 ALLOW_SPOTIFY=1 로.
  if (process.env.ALLOW_SPOTIFY !== "1") return [];
  if (!token) {
    const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
    token = (await (await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json()).access_token;
  }
  for (let i = 0; i < 4; i++) {
    await sleep(700); spCalls++;  // 운영 트래픽과 쿼터 공유 — 분당 약 85회 이하
    let r: Response;
    try { r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=10&market=KR`, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(20000) }); }
    catch { continue; }
    if (r.status === 429) { await sleep((Number(r.headers.get("Retry-After")) || 5) * 1000 + 500); continue; }
    return r.ok ? ((await r.json()).artists?.items ?? []) : [];
  }
  return [];
}

/** MB 에서 이름으로 찾고(국가 우선) 그 아티스트에 달린 Spotify 링크 + 별칭을 가져온다 */
async function viaMB(q: string, prefer?: string) {
  const s = await mb(`artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=5`);
  if (s.__status || s.__t) return null;
  const hits = (s.artists || []).filter((a: any) => a.score >= 88);
  const pick = (prefer && hits.find((a: any) => a.country === prefer)) ?? hits[0];
  if (!pick) return null;
  const d = await mb(`artist/${pick.id}?inc=url-rels+aliases&fmt=json`);
  if (d.__status || d.__t) return null;
  const link = (d.relations || []).map((x: any) => String(x.url?.resource ?? "")).find((u: string) => u.includes("open.spotify.com/artist/"));
  const spotifyId = link?.split("/artist/")[1]?.split(/[?#/]/)[0];
  const names = [...new Set([pick.name, pick["sort-name"], ...(d.aliases ?? []).map((a: any) => a.name)].filter(Boolean))] as string[];
  return { spotifyId, names, name: pick.name, country: pick.country ?? "?", disamb: pick.disambiguation ?? "" };
}

async function resolve(retry = false) {
  const sb = createAdminClient();
  const prev = retry ? JSON.parse(readFileSync(OUT, "utf8")) : { inDb: [], resolved: [], unresolved: [] };
  const only = new Set<string>(prev.unresolved);
  const entries = readFileSync(IN, "utf8").split(/\r?\n/).filter(Boolean).map(l => {
    const [sec, label, query] = l.split("|");
    const m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
    return { sec, label, primary: (m ? m[1] : label).trim(), alts: m ? [m[2].trim()] : [], q: (query ?? (m ? m[1] : label)).trim() };
  }).filter(e => !retry || only.has(e.label));

  const canon = await fetchAll<any>((f, t) => sb.from("canonical_artist").select("spotify_id, mbid, name, name_ko").order("spotify_id").range(f, t));
  const aliasRows = await fetchAll<any>((f, t) => sb.from("mb_artist").select("mbid, aliases").order("mbid").range(f, t));
  const aliasOf = new Map(aliasRows.map(r => [r.mbid, r.aliases ?? []]));
  const index = new Map<string, any>();
  for (const a of canon) for (const n of [a.name, a.name_ko, ...(aliasOf.get(a.mbid) ?? []).map((x: any) => x.name)]) if (n && !index.has(norm(n))) index.set(norm(n), a);
  const mapRows = await fetchAll<any>((f, t) => sb.from("mb_spotify_map").select("spotify_id, confidence").eq("entity", "artist").order("spotify_id").range(f, t));
  const confOf = new Map(mapRows.map(r => [r.spotify_id, r.confidence]));

  const inDb: any[] = [], resolved: any[] = [], unresolved: any[] = [];
  for (const [i, e] of entries.entries()) {
    if (i % 25 === 0) console.log(`  ${i}/${entries.length} ${new Date().toLocaleTimeString()}`);
    const hit = [e.primary, e.q, translate(e.primary)].filter(Boolean).map(s => index.get(norm(s!))).find(Boolean);
    if (hit) { inDb.push(`${e.label}→${hit.name}`); continue; }

    const targets = new Set([e.primary, e.q, ...e.alts, translate(e.primary)].filter(Boolean).map(s => norm(s!)));
    const bySpotify = async () => {
      for (const q of [...new Set([e.q, e.primary, translate(e.primary)].filter(Boolean))] as string[]) {
        const it = (await spotifySearch(q)).find(x => targets.has(norm(x.name)));
        if (it) return { spotifyId: it.id, name: it.name, via: "spotify" };
      }
      return null;
    };
    const byMB = async () => {
      const r = await viaMB(e.q, e.sec === "J" ? "JP" : e.sec === "W" ? undefined : "KR");
      if (!r) return null;
      const tag = `${r.name}(${r.country}${r.disamb ? `, ${r.disamb}` : ""})`;
      if (r.spotifyId) return { spotifyId: r.spotifyId, name: tag, via: "mb" };
      if (e.sec === "M") return null;  // 흔한 이름은 MB 링크가 있을 때만 채택 (이브→일본 Eve 같은 오매칭 방지)
      // MB 에 Spotify 링크가 없으면 MB 별칭(영문 표기 등)으로 Spotify 재검색 — 워커가 url_rel 검증/격리한다
      for (const n of r.names) targets.add(norm(n));
      for (const q of r.names.filter(n => norm(n) !== norm(e.q) && norm(n) !== norm(e.primary)).slice(0, 3)) {
        const it = (await spotifySearch(q)).find(x => targets.has(norm(x.name)));
        if (it) return { spotifyId: it.id, name: `${it.name} ← MB ${tag}`, via: "mb-alias" };
      }
      return null;
    };
    // J(일본)·M(흔한 이름이라 Spotify 검색이 위험) 은 MB 우선, 나머지는 Spotify 우선
    const r = e.sec === "J" || e.sec === "M" ? (await byMB()) ?? (await bySpotify()) : (await bySpotify()) ?? (await byMB());
    if (!r) { unresolved.push(e.label); continue; }
    const conf = confOf.get(r.spotifyId);
    resolved.push({ ...r, label: e.label, sec: e.sec, hint: [e.q, e.primary, ...e.alts].filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join("|"),
      status: conf === "url_rel" || conf === "manual" ? "trusted" : conf === "name" ? "quarantined" : "new" });
  }
  const byId = new Map<string, any>();
  for (const r of [...prev.resolved, ...resolved]) if (!byId.has(r.spotifyId)) byId.set(r.spotifyId, r);
  const uniq = [...byId.values()];
  writeFileSync(OUT, JSON.stringify({ inDb: [...prev.inDb, ...inDb], resolved: uniq, unresolved }, null, 1));
  const c = (s: string) => uniq.filter(x => x.status === s).length;
  console.log(`목록 ${entries.length} · 이름으로 DB 확인 ${inDb.length} · 확인 ${uniq.length} (이미 DB ${c("trusted")} / 격리 ${c("quarantined")} / 신규 ${c("new")}) · 미확인 ${unresolved.length} · MB ${mbCalls}회 · Spotify ${spCalls}회`);
}

async function enqueue() {
  const { resolved } = JSON.parse(readFileSync(OUT, "utf8"));
  const rows = resolved.filter((r: any) => r.status === "new").map((r: any) => ({ spotify_id: r.spotifyId, entity: "artist", hint: r.hint, attempts: 0, created_at: new Date().toISOString() }));
  const { error } = await createAdminClient().from("mb_resolve_queue").upsert(rows, { onConflict: "spotify_id" });
  console.log(error ? `실패: ${error.message}` : `수요 큐 등록 ${rows.length}명`);
}

(process.argv[2] === "enqueue" ? enqueue() : resolve(process.argv[2] === "retry")).catch(e => { console.error(e); process.exit(1); });
