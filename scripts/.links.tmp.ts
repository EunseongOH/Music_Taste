// 일회성: 사용자가 준 "이름 : Spotify ID" 목록을 MusicBrainz 만으로 판정해 매핑·큐 등록 (Spotify 호출 0회)
// 사용: npx tsx --env-file=.env.local scripts/.links.tmp.ts <파일> [apply]
//   판정: trusted(이미 정식) / url(MB 에 이 링크 있음 → 큐만) / promote(격리 매핑이 발매 있는 KR·JP 항목 → manual)
//         pick(MB 이름 검색 후보 → manual) / none(못 찾음)
import { readFileSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function mb(p: string): Promise<any> {
  for (let i = 0; i < 12; i++) {
    await sleep(1150);
    let r: Response;
    try { r = await fetch("https://musicbrainz.org/ws/2/" + p, { headers: { "User-Agent": "Sortify/1.0 ( https://sortify.kr )" }, signal: AbortSignal.timeout(20000) }); }
    catch { continue; }
    if (r.ok) return r.json();
    if (r.status === 404) return { notFound: true };
    if (r.status !== 503 && r.status !== 429) return null;
  }
  return null;
}
const rgCount = async (mbid: string) => (await mb(`release-group?artist=${mbid}&limit=1&fmt=json`))?.["release-group-count"] ?? 0;

async function main() {
  const [file, mode] = process.argv.slice(2);
  const sb = createAdminClient();
  const rows = readFileSync(file, "utf8").split(/\r?\n/).map(l => l.match(/^(.+?)\s*[:：]\s*([0-9A-Za-z]{22})\s*$/)).filter(Boolean).map(m => ({ label: m![1].trim(), sid: m![2] }));
  const { data: maps } = await sb.from("mb_spotify_map").select("spotify_id, mbid, confidence").eq("entity", "artist").in("spotify_id", rows.map(r => r.sid));
  const mapOf = new Map((maps ?? []).map(m => [m.spotify_id, m]));
  const out: any[] = [];
  for (const r of rows) {
    let note: string | undefined;
    const m = mapOf.get(r.sid);
    if (m && (m.confidence === "url_rel" || m.confidence === "manual")) { out.push({ ...r, verdict: "trusted" }); continue; }
    if (m?.confidence === "name") {
      const { data: a } = await sb.from("mb_artist").select("name, country").eq("mbid", m.mbid).maybeSingle();
      const n = await rgCount(m.mbid);
      if (n > 0 && (a?.country === "KR" || a?.country === "JP")) { out.push({ ...r, verdict: "promote", mbid: m.mbid, mb: `${a?.name} [${a?.country}] RG ${n}` }); continue; }
      note = `격리 매핑 의심: ${a?.name} [${a?.country ?? "?"}] RG ${n}`;
    }
    const u = await mb(`url?resource=${encodeURIComponent("https://open.spotify.com/artist/" + r.sid)}&inc=artist-rels&fmt=json`);
    const linked = (u?.relations ?? []).map((x: any) => x.artist).filter(Boolean);
    if (linked.length) { out.push({ ...r, note, verdict: "url", mb: linked.map((a: any) => a.name).join(",") }); continue; }
    const cands: any[] = [];
    for (const q of [r.label, ...r.label.split(/\s+/).filter(w => /[가-힣ぁ-んァ-ン一-龯]/.test(w))].filter((v, i, a) => a.indexOf(v) === i).slice(0, 2)) {
      const s = await mb(`artist/?query=${encodeURIComponent(q.replace(/[\/!():^"~*?+\-\[\]{}]/g, " "))}&fmt=json&limit=5`);
      for (const a of s?.artists ?? []) if (a.score >= 90 && !cands.some(c => c.id === a.id)) cands.push(a);
    }
    const scored: any[] = [];
    for (const a of cands.filter(a => a.country === "KR" || a.country === "JP" || !a.country).slice(0, 4)) scored.push({ ...a, rgs: await rgCount(a.id) });
    scored.sort((x, y) => y.rgs - x.rgs);
    const best = scored.find(a => a.rgs > 0);
    out.push({ ...r, note, verdict: best ? "pick" : "none", mbid: best?.id, mb: best ? `${best.name} [${best.country ?? "?"}] ${best.disambiguation ?? ""} RG ${best.rgs}` : undefined,
      others: scored.filter(a => a !== best).map(a => `${a.name}[${a.country ?? "?"}]RG${a.rgs}`).join(" | ") || undefined });
  }
  writeFileSync(file.replace(/\.txt$/, ".verdict.json"), JSON.stringify(out, null, 1));
  for (const o of out) console.log(`${o.verdict.padEnd(8)} ${o.label} ${o.mb ?? ""}${o.note ? "  ※" + o.note : ""}${o.others ? "  (기타: " + o.others + ")" : ""}`);

  if (mode !== "apply") return;
  const now = new Date().toISOString();
  const manual = out.filter(o => o.verdict === "pick" || o.verdict === "promote");
  if (manual.length) {
    let e = (await sb.from("mb_spotify_map").upsert(manual.map(o => ({ spotify_id: o.sid, entity: "artist", mbid: o.mbid, confidence: "manual" })), { onConflict: "spotify_id" })).error; if (e) throw e;
    e = (await sb.from("mb_artist").update({ updated_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }).in("mbid", manual.map(o => o.mbid))).error; if (e) throw e;
  }
  const q = out.filter(o => ["pick", "promote", "url"].includes(o.verdict));
  if (q.length) { const e = (await sb.from("mb_resolve_queue").upsert(q.map(o => ({ spotify_id: o.sid, entity: "artist", hint: o.label, attempts: 0, created_at: now })), { onConflict: "spotify_id" })).error; if (e) throw e; }
  console.log(`반영: manual ${manual.length} · 큐 ${q.length}`);
}
main().catch(e => { console.error(e); process.exit(1); });
