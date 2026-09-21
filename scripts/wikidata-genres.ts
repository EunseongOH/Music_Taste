// Wikidata(CC0) 로 아티스트 장르를 채운다. Spotify 호출 0회.
//
// 왜: 탐색 화면의 장르 피드가 Spotify 검색에 매달려 있다. 우리 DB 는 2,452팀을 아는데
//     장르 라벨이 0건이라 피드를 채울 수가 없다 (캐시에 장르가 있는 건 287팀뿐이고,
//     그것도 우리가 손으로 고른 explore_genre_picks 308건이 전부다).
//     MusicBrainz 의 tags/genres 는 CC-BY-NC-SA 라 광고를 붙이면 못 쓴다.
//     Wikidata P136(genre) 은 CC0 라 제약이 없다.
//
// 하는 일: mb_artist.mbid -> Wikidata P434 로 항목을 찾고 P136 장르 라벨을 받아
//          sortify 의 16종 체계로 옮겨 mb_artist.genres 에 넣는다. genre_src='wikidata'.
//
// 사용: npx tsx --env-file=.env.local scripts/wikidata-genres.ts [--go] [최대명수]
//       --go 없이 돌리면 무엇이 붙을지만 보여준다.

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const UA = "Sortify/1.0 ( https://sortify.kr )";
const CHUNK = 150;
const GAP_MS = 1200;                       // Wikidata 에 예의를 지킨다
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikidata 장르 라벨 -> sortify 16종.
 * 앞에서부터 보고 처음 맞는 것을 쓴다. 그래서 "korean hip hop" 처럼 좁은 것을 위에 둔다.
 * 나라 정보(country)로 한국 아티스트면 korean 계열로 올린다.
 */
const RULES: [RegExp, string][] = [
  [/k-?pop|korean pop/i, "k-pop"],
  [/trot|teuroteu/i, "trot"],
  [/j-?pop|japanese pop|anime|vocaloid|city pop/i, "j-pop"],
  [/classical|baroque|romantic music|opera|orchestr|symphon|chamber music/i, "classical"],
  [/jazz|bossa|swing|bebop/i, "jazz"],
  [/hip ?hop|rap|trap|boom bap/i, "hip hop"],
  [/r&b|rhythm and blues|soul|funk|neo soul/i, "r&b"],
  [/electronic|edm|house|techno|trance|dubstep|synth-?pop|ambient|drum and bass/i, "electronic"],
  [/indie|lo-?fi|shoegaz|dream pop|bedroom pop/i, "indie"],
  [/rock|metal|punk|grunge|hardcore|emo|alternative/i, "rock"],
  [/ballad/i, "ballad"],
  [/pop/i, "pop"],                         // 제일 넓으므로 맨 끝
];
const KOREAN_OF: Record<string, string> = {
  "hip hop": "korean hip hop", "indie": "korean indie", "rock": "korean rock", "r&b": "korean r&b",
};

let calls = 0;
/** MBID 묶음 -> Wikidata 가 아는 장르 라벨들 */
async function ask(mbids: string[]): Promise<Map<string, string[]>> {
  const values = mbids.map((i) => `"${i}"`).join(" ");
  const query = `SELECT ?mbid ?genreLabel WHERE {
    VALUES ?mbid { ${values} }
    ?item wdt:P434 ?mbid ; wdt:P136 ?genre .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
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
      const out = new Map<string, string[]>();
      for (const b of j?.results?.bindings ?? []) {
        const k = b.mbid.value;
        out.set(k, [...(out.get(k) ?? []), b.genreLabel?.value ?? ""]);
      }
      return out;
    } catch { await sleep(3000 * (attempt + 1)); }
  }
  return new Map();
}

/** Wikidata 라벨들을 우리 16종으로. 못 알아들으면 빈 배열 */
export function toOurGenres(labels: string[], country?: string | null): string[] {
  const out = new Set<string>();
  for (const raw of labels) {
    for (const [re, g] of RULES) {
      if (!re.test(raw)) continue;
      const ko = country === "KR" ? KOREAN_OF[g] : undefined;
      out.add(ko ?? g);
      break;                                // 라벨 하나당 하나만
    }
  }
  return [...out].slice(0, 3);              // 너무 많이 붙이면 피드가 뭉개진다
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
  const go = process.argv.includes("--go");
  const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100000);

  const rows = (await fetchAll<any>((f, t) => sb.from("mb_artist")
    .select("mbid, name, country, genres").order("mbid").range(f, t)))
    .filter((r) => !r.genres?.length).slice(0, limit);
  console.log(`장르 없는 아티스트 ${rows.length}명${go ? "" : " — 확인만 한다 (--go 로 실제 반영)"}`);

  const countryOf = new Map(rows.map((r) => [r.mbid, r.country]));
  const nameOf = new Map(rows.map((r) => [r.mbid, r.name]));
  let hit = 0, miss = 0, unknown = 0;
  const tally = new Map<string, number>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => r.mbid);
    const got = await ask(chunk);
    const updates: { mbid: string; genres: string[] }[] = [];
    for (const mbid of chunk) {
      const labels = got.get(mbid);
      if (!labels?.length) { miss++; continue; }
      const genres = toOurGenres(labels, countryOf.get(mbid));
      if (!genres.length) { unknown++; continue; }
      hit++;
      for (const g of genres) tally.set(g, (tally.get(g) ?? 0) + 1);
      updates.push({ mbid, genres });
      if (hit <= 8) console.log(`  ${nameOf.get(mbid)} <- ${labels.slice(0, 3).join(", ")} => ${genres.join(", ")}`);
    }
    if (go && updates.length) {
      for (const u of updates) {
        const { error } = await sb.from("mb_artist")
          .update({ genres: u.genres, genre_src: "wikidata" }).eq("mbid", u.mbid);
        if (error) throw new Error(error.message);
      }
    }
    console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length} 붙음 ${hit} · Wikidata 없음 ${miss} · 장르 못 알아봄 ${unknown} · 질의 ${calls}`);
  }

  console.log(`\n완료 · 붙${go ? "인" : "일 수 있는"} 아티스트 ${hit} · Wikidata 에 없음 ${miss} · 장르를 못 알아봄 ${unknown}`);
  console.log([...tally.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(" · "));
}

main().catch((e) => { console.error(e); process.exit(1); });
