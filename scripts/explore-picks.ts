// 전곡 모드 첫 화면용 장르별 아티스트 선정 (Spotify 0회)
//
// 운영(main)의 searchArtistsByGenres 는 spotify_cache_artists 에서 genres 에 장르 ID 가 들어 있는 행을
// 장르당 17개(limit 50 / 3장르) 읽고, 모자라면 Spotify 검색을 부른다. 2026-02 이후 Spotify 가 장르를 주지 않아
// 태그가 비어 있어서 지금은 매번 검색을 부른다. 여기서 장르별로 "DB 트랙리스트까지 확보한 정식 매핑 아티스트"를
// 골라 explore_genre_picks 에 저장한다. 태그 반영은 DB 함수 apply_explore_genre_tags() 가 한다.
//
// 사용: npx tsx --env-file=.env.local scripts/explore-picks.ts [--save]

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const PER_GENRE = 22; // 운영이 읽는 17개 + 여유
const norm = (s: string) => (s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

type Cand = { genre: string; names: string[] };

// 운영 main 의 큐레이션 목록 (첫 화면에 이미 고정 노출되는 아티스트) — 장르별로 먼저 채운다
function curated(): { genre: string; id: string; name: string }[] {
  const src = execSync("git show origin/main:src/utils/curatedArtists.ts", { encoding: "utf8" });
  const out: { genre: string; id: string; name: string }[] = [];
  let genre = "";
  for (const line of src.split("\n")) {
    const g = line.match(/^\s*"([a-z &-]+)": \[/);
    if (g) { genre = g[1]; continue; }
    const m = line.match(/id: "([0-9A-Za-z]{22})", name: "([^"]+)"/);
    if (m && genre) out.push({ genre, id: m[1], name: m[2] });
  }
  return out;
}

function warmupList(constName: string): string[] {
  const s = readFileSync("scripts/warmup_artists.ts", "utf8");
  const m = s.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

// "NewJeans (뉴진스)" -> ["NewJeans", "뉴진스"]
const variants = (label: string) => {
  const m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? [m[1], ...m[2].split("/").map((x) => x.trim())] : [label];
};

const EXTRA: Cand[] = [
  { genre: "k-pop", names: warmupList("KPOP_ARTISTS") },
  { genre: "pop", names: warmupList("POP_ARTISTS").concat(["Lady Gaga", "Katy Perry", "Sabrina Carpenter", "Charlie Puth", "Lauv", "Shawn Mendes", "Selena Gomez", "Troye Sivan", "Sam Smith", "One Direction", "Benson Boone", "Chappell Roan", "Tate McRae", "Conan Gray"]) },
  { genre: "hip hop", names: ["Nicki Minaj", "Cardi B", "Megan Thee Stallion", "Central Cee", "21 Savage", "Future", "Lil Uzi Vert", "Lil Nas X", "Kid Cudi", "A$AP Rocky", "Childish Gambino", "Jack Harlow", "Metro Boomin", "Mac Miller", "Juice WRLD", "XXXTENTACION", "Logic"] },
  { genre: "r&b", names: ["H.E.R.", "Kehlani", "Summer Walker", "Giveon", "Steve Lacy", "Khalid", "Pink Sweat$", "HONNE", "Brent Faiyaz", "Jorja Smith", "Usher", "Alicia Keys", "John Legend", "Bruno Mars", "Silk Sonic", "Victoria Monét", "Tinashe", "Jhené Aiko"] },
  { genre: "korean hip hop", names: warmupList("HIPHOP_RNB_ARTISTS").concat(["Lee Young Ji (이영지)"]) },
  { genre: "korean r&b", names: ["DPR IAN", "DPR LIVE", "WOODZ (우즈)", "Rad Museum (라드뮤지엄)", "Samuel Seo (서사무엘)", "Miso (미소)", "Sam Kim (샘김)", "Cheeze (치즈)", "Lee Hi (이하이)", "Jukjae (적재)", "Yerin Baek (백예린)", "SAAY (쎄이)", "GSoul (지소울)", "Jung Key (정기고)", "Kim Na Young (김나영)"] },
  { genre: "korean rock", names: ["DAY6 (데이식스)", "Xdinary Heroes (엑스디너리 히어로즈)", "The Rose (더 로즈)", "N.Flying (엔플라잉)", "ONEWE (원위)", "LUCY (루시)", "Nerd Connection (너드커넥션)", "Soran (소란)", "No Brain (노브레인)", "Dickpunks (딕펑스)", "Peppertones (페퍼톤스)", "Galaxy Express (갤럭시 익스프레스)", "Glen Check (글렌체크)", "Daybreak (데이브레이크)", "Thornapple (쏜애플)", "Busker Busker (버스커 버스커)", "Buzz (버즈)", "Nell (넬)", "Silica Gel (실리카겔)", "The Volunteers (더 볼런티어스)", "QWER"] },
  { genre: "rock", names: ["Paramore", "Fall Out Boy", "Twenty One Pilots", "My Chemical Romance", "The 1975", "Bon Jovi", "AC/DC", "Guns N' Roses", "Pixies", "The Killers", "Maneskin", "Måneskin", "Blur", "The Rolling Stones", "Led Zeppelin", "Pink Floyd", "Weezer", "Radiohead", "Oasis", "The Smashing Pumpkins", "Bring Me The Horizon"] },
  { genre: "korean indie", names: warmupList("INDIE_ROCK_KBAND_ARTISTS").concat(["wave to earth (웨이브투어스)", "ADOY (아도이)", "Parannoul (파란노을)", "Kim Sawol (김사월)", "Lang Lee (이랑)"]) },
  { genre: "indie", names: ["Cigarettes After Sex", "Mac DeMarco", "Beach House", "Vampire Weekend", "The Smiths", "Men I Trust", "Joji", "Rex Orange County", "boygenius", "Arcade Fire", "Mitski", "Wallows", "The xx", "Lana Del Rey", "Arctic Monkeys", "Bon Iver", "Faye Webster", "Japanese Breakfast", "beabadoobee", "Hozier", "Florence + The Machine", "Glass Animals"] },
  { genre: "electronic", names: ["Skrillex", "Marshmello", "Martin Garrix", "Zedd", "Kygo", "The Chainsmokers", "Disclosure", "Flume", "Porter Robinson", "ODESZA", "deadmau5", "David Guetta", "Alan Walker", "Tiësto", "Fred again..", "Justice", "Madeon", "KAYTRANADA", "Aphex Twin", "The Chemical Brothers", "Chemical Brothers", "Swedish House Mafia", "Alesso", "Illenium"] },
  { genre: "jazz", names: ["John Coltrane", "Bill Evans", "Chet Baker", "Ella Fitzgerald", "Louis Armstrong", "Duke Ellington", "Thelonious Monk", "Herbie Hancock", "Robert Glasper", "Esperanza Spalding", "Kamasi Washington", "Jon Batiste", "Ezra Collective", "Arturo Sandoval", "Diana Krall", "Gregory Porter", "Nat King Cole", "Frank Sinatra", "Dave Brubeck", "Charles Mingus", "Billie Holiday", "Stan Getz", "Oscar Peterson", "Cory Henry", "Takuya Kuroda"] },
  { genre: "ballad", names: ["MeloMance (멜로망스)", "Urban Zakapa (어반자카파)", "Lee Seung Chul (이승철)", "K.Will (케이윌)", "Davichi (다비치)", "Roy Kim (로이킴)", "Lee Mujin (이무진)", "Kim Na Young (김나영)", "Huh Gak (허각)", "Ailee (에일리)", "4MEN (포맨)", "SG Wannabe (SG워너비)", "Brown Eyed Soul (브라운 아이드 소울)", "Parc Jae Jung (박재정)", "Lim Jae Hyun (임재현)", "Monday Kiz (먼데이 키즈)", "Epitone Project (에피톤 프로젝트)", "Baek Ji Young (백지영)", "Gummy (거미)", "Younha (윤하)", "Kyuhyun (규현)", "Jung Seung Hwan (정승환)", "Ha Hyun Sang (하현상)", "Lee Juck (이적)", "Toy (토이)", "Yoon Jong Shin (윤종신)"] },
  { genre: "trot", names: warmupList("TROT_ARTISTS") },
  { genre: "j-pop", names: warmupList("JPOP_ARTISTS").concat(["Aimer", "Uru", "yama", "Omoinotake", "Saucy Dog", "sumika", "Mr.Children", "Spitz", "back number"]) },
  { genre: "classical", names: ["Frédéric Chopin", "Claude Debussy", "Pyotr Ilyich Tchaikovsky", "Antonio Vivaldi", "Franz Liszt", "Sergei Rachmaninoff", "Franz Schubert", "George Frideric Handel", "Johannes Brahms", "Maurice Ravel", "Erik Satie", "Seong-Jin Cho", "Lang Lang", "Ludovico Einaudi", "Max Richter", "Joe Hisaishi", "Yiruma", "Robert Schumann", "Felix Mendelssohn", "Gustav Mahler", "Antonín Dvořák", "Edvard Grieg", "Gabriel Fauré", "Johann Pachelbel", "Yo-Yo Ma"] },
];

// 후보 명단 출처(야간 워밍 목록)의 장르 분류가 어색한 경우
const EXCLUDE: Record<string, string[]> = {
  "korean hip hop": ["INFINITE (인피니트)"],
  "korean indie": ["FTISLAND (FT아일랜드)", "CNBLUE (씨엔블루)"],
  "trot": ["박지현 (Park Ji Hyun)"], // 동명이인 위험
};
const MIN_PER_GENRE = 17; // 운영이 장르당 읽는 수. 이보다 적으면 그 장르는 Spotify 검색을 부른다

const KR = new Set(["k-pop", "korean hip hop", "korean r&b", "korean rock", "korean indie", "ballad", "trot"]);

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
  const save = process.argv.includes("--save");
  // canonical_coverage 뷰는 느려서 스냅샷 테이블을 읽는다 (refresh_artist_coverage_snapshot())
  await sb.rpc("refresh_artist_coverage_snapshot");
  const cov = await fetchAll<any>((f, t) => sb.from("artist_coverage_snapshot")
    .select("spotify_id, name, name_ko, country, albums_with_tracks, tracks, mbid")
    .in("confidence", ["url_rel", "manual"]).gt("albums_with_tracks", 0).order("spotify_id").range(f, t));
  const aliases = await fetchAll<any>((f, t) => sb.from("mb_artist").select("mbid, aliases").order("mbid").range(f, t));
  const aliasOf = new Map(aliases.map((a) => [a.mbid, (a.aliases ?? []).map((x: any) => x.name)]));
  const byName = new Map<string, any[]>();
  for (const c of cov) {
    for (const n of [c.name, c.name_ko, ...(aliasOf.get(c.mbid) ?? [])]) {
      if (!n) continue;
      const k = norm(n);
      byName.set(k, [...(byName.get(k) ?? []), c]);
    }
  }
  const covById = new Map(cov.map((c) => [c.spotify_id, c]));
  // 트랙리스트 없는 정식 매핑 (모자란 장르 보충용)
  const bare = await fetchAll<any>((f, t) => sb.from("artist_coverage_snapshot")
    .select("spotify_id, name, name_ko, country, albums_with_tracks, tracks, mbid")
    .in("confidence", ["url_rel", "manual"]).eq("albums_with_tracks", 0).order("spotify_id").range(f, t));
  const bareByName = new Map<string, any[]>();
  for (const c of bare) for (const n of [c.name, c.name_ko]) if (n) bareByName.set(norm(n), [...(bareByName.get(norm(n)) ?? []), c]);
  const imgRows = await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id, images").order("id").range(f, t));
  const hasImage = new Set(imgRows.filter((r) => Array.isArray(r.images) && r.images.length).map((r) => r.id));

  const cur = curated();
  const picks: any[] = [];
  const report: string[] = [];
  for (const { genre, names } of EXTRA) {
    const chosen = new Map<string, any>();
    // 1) 큐레이션 (DB 트랙리스트가 있는 경우만)
    for (const c of cur.filter((x) => x.genre === genre)) {
      const row = covById.get(c.id);
      if (row) chosen.set(c.id, { ...row, from: "curated" });
    }
    // 2) 후보 이름 -> 정식 매핑 + 트랙리스트 (한국 장르는 KR, J-Pop 은 JP 우선)
    const found: any[] = [];
    for (const label of names.filter((n) => !(EXCLUDE[genre] ?? []).includes(n))) {
      for (const v of variants(label)) {
        let hits = byName.get(norm(v)) ?? [];
        if (KR.has(genre)) hits = hits.filter((h) => h.country === "KR" || !h.country);
        if (genre === "j-pop") hits = hits.filter((h) => h.country === "JP" || !h.country);
        const best = hits.sort((a, b) => (b.tracks ?? 0) - (a.tracks ?? 0))[0];
        if (best) { found.push({ ...best, from: label }); break; }
      }
    }
    // 곡이 많은 순 = 대체로 인기·커버리지가 높은 순
    for (const f of found.sort((a, b) => (b.tracks ?? 0) - (a.tracks ?? 0))) {
      if (chosen.size >= PER_GENRE) break;
      if (!chosen.has(f.spotify_id)) chosen.set(f.spotify_id, f);
    }
    if (chosen.size < MIN_PER_GENRE) {
      for (const label of names) {
        if (chosen.size >= MIN_PER_GENRE) break;
        for (const v of variants(label)) {
          let hits = bareByName.get(norm(v)) ?? [];
          if (KR.has(genre)) hits = hits.filter((h) => h.country === "KR" || !h.country);
          const h = hits[0];
          if (h && !chosen.has(h.spotify_id)) { chosen.set(h.spotify_id, { ...h, from: label + " *DB트랙리스트없음" }); break; }
        }
      }
    }
    const list = [...chosen.values()];
    list.forEach((p, i) => picks.push({ genre, spotify_id: p.spotify_id, rank: i + 1, name: p.name_ko ?? p.name, has_image: hasImage.has(p.spotify_id) }));
    report.push(`${genre.padEnd(15)} ${String(list.length).padStart(2)}명 (이미지 없음 ${list.filter((p) => !hasImage.has(p.spotify_id)).length}) · ${list.map((p) => `${p.name_ko ?? p.name}${p.from && p.from !== "curated" ? "<" + p.from + ">" : ""}`).join(", ")}`);
  }
  console.log(report.join("\n"));
  console.log(`\n총 ${picks.length}건 · 고유 아티스트 ${new Set(picks.map((p) => p.spotify_id)).size}명`);

  if (save) {
    const { error: delErr } = await sb.rpc("replace_explore_genre_picks", { picks: picks.map(({ has_image, ...p }) => p) });
    if (delErr) throw new Error(delErr.message);
    console.log("저장 완료");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
