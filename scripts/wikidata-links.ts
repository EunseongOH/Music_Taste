// Wikidata(CC0) 로 Spotify 아티스트 ID <-> MusicBrainz 아티스트 ID 를 직접 확인한다. Spotify 호출 0회.
//
// 왜: 이름만 같아서 잡힌 연결(confidence='name')은 실측 정확도가 57% 라 쓰지 않는다.
//     그런데 Wikidata 는 한 항목에 Spotify 아티스트 ID(P1902)와 MusicBrainz 아티스트 ID(P434)를
//     함께 갖고 있다. 둘을 잇는 근거로 이보다 확실한 공개 데이터가 없다. 전부 CC0 다.
//
// 하는 일:
//   - 이름만 연결됐거나 아예 연결이 없는 아티스트를 Wikidata 에 물어본다.
//   - 우리 연결과 같으면 confidence='wikidata' 로 올린다 (신뢰 목록에 든다).
//   - 다르면 Wikidata 쪽으로 고친다 (이름 매칭이 틀린 경우다).
//   - 없던 연결이면 새로 넣는다.
//
// 사용: npx tsx --env-file=.env.local scripts/wikidata-links.ts [--go] [--all]
//       --go 없이 돌리면 무엇이 바뀔지만 보여준다. --all 은 url_rel 연결까지 대조한다(검산용).

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const UA = "Sortify/1.0 ( https://sortify.kr )";
const CHUNK = 150;
const GAP_MS = 1200;                       // Wikidata 에 예의를 지킨다
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

let calls = 0;
/** Spotify 아티스트 ID 묶음 -> Wikidata 가 아는 MusicBrainz ID */
async function ask(ids: string[]): Promise<Map<string, string>> {
  const values = ids.map((i) => `"${i}"`).join(" ");
  const query = `SELECT ?spotify ?mbid WHERE { VALUES ?spotify { ${values} } ?item wdt:P1902 ?spotify ; wdt:P434 ?mbid . }`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(GAP_MS);
    calls++;
    try {
      const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(query), {
        headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) { await sleep(3000 * (attempt + 1)); continue; }
      const j = await r.json();
      const out = new Map<string, string>();
      for (const b of j?.results?.bindings ?? []) out.set(b.spotify.value, b.mbid.value);
      return out;
    } catch { await sleep(3000 * (attempt + 1)); }
  }
  return new Map();
}

async function main() {
  const go = process.argv.includes("--go");
  const all = process.argv.includes("--all");

  const maps = await fetchAll<any>((f, t) => sb.from("mb_spotify_map")
    .select("spotify_id, mbid, confidence").eq("entity", "artist").order("spotify_id").range(f, t));
  const have = new Map(maps.map((m) => [m.spotify_id, m]));

  // 우리가 아는 모든 아티스트 (연결이 없는 쪽도 포함한다)
  const known = new Set<string>([
    ...maps.map((m) => m.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id").order("id").range(f, t))).map((r) => r.id),
  ].filter(Boolean));

  const targets = [...known].filter((id) => {
    const m = have.get(id);
    return all || !m || !["url_rel", "manual", "wikidata"].includes(m.confidence);
  });
  console.log(`대상 ${targets.length}명 / 아는 아티스트 ${known.size}명${go ? "" : " — 확인만 한다 (--go 로 반영)"}`);

  let confirmed = 0, fixed = 0, added = 0, miss = 0, agree = 0;
  const upserts: any[] = [];
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const found = await ask(chunk);
    for (const id of chunk) {
      const wd = found.get(id);
      if (!wd) { miss++; continue; }
      const m = have.get(id);
      if (!m) { added++; upserts.push({ spotify_id: id, entity: "artist", mbid: wd, confidence: "wikidata" }); }
      else if (m.mbid === wd) {
        if (["url_rel", "manual"].includes(m.confidence)) { agree++; continue; }   // 이미 믿는 연결
        confirmed++; upserts.push({ spotify_id: id, entity: "artist", mbid: wd, confidence: "wikidata" });
      } else {
        fixed++;
        console.log(`  [교정] ${id} ${m.mbid} -> ${wd} (기존 ${m.confidence})`);
        if (m.confidence !== "url_rel") upserts.push({ spotify_id: id, entity: "artist", mbid: wd, confidence: "wikidata" });
      }
    }
    console.log(`  ${Math.min(i + CHUNK, targets.length)}/${targets.length} 확인 ${confirmed} · 교정 ${fixed} · 신규 ${added} · 없음 ${miss} · 질의 ${calls}`);
  }

  if (go && upserts.length) {
    for (let i = 0; i < upserts.length; i += 200) {
      const { error } = await sb.from("mb_spotify_map").upsert(upserts.slice(i, i + 200), { onConflict: "spotify_id" });
      if (error) throw new Error(error.message);
    }
  }
  console.log(`\n완료 · 확인 ${confirmed} · 교정 ${fixed} · 신규 ${added} · Wikidata 에 없음 ${miss} · 이미 일치 ${agree}`);
  console.log(go ? `mb_spotify_map ${upserts.length}행 반영했다.` : `--go 로 돌리면 ${upserts.length}행이 바뀐다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
