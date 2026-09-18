// K-Pop 아이돌 확보 현황. Spotify 호출 0회.
//
// "아이돌" 기준: 아이돌 그룹과 그 멤버의 솔로 활동. 우리 DB 가 아는 아티스트 중에서만 고른다
// (prelaunch_targets 의 idol·kfandom·curated·chart 목록 + 전곡 모드 첫 화면 k-pop 선정).
// Spotify·MusicBrainz 어디에도 "아이돌" 이라는 분류가 없어서 이름으로 가린다.
//
// 나누는 기준은 지금 화면에 실제로 낼 수 있는 것(artist_serve_coverage):
//   트랙리스트 확보 — 곡까지 있다. Spotify 없이 소트를 끝까지 할 수 있다.
//   앨범 목록만     — 앨범 이름은 아는데 곡이 없다. 앨범을 누르면 Spotify 를 불러야 한다.
//   미확보          — 앨범 목록도 없다.
//
// 사용: npx tsx --env-file=.env.local scripts/export-idols.ts [출력 폴더]

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const today = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `C:/Users/User/sortify-exports/아이돌확보-${today}`;

/** 아이돌 그룹 + 아이돌 멤버 솔로. 우리 DB 에 있는 이름으로 적는다. */
const IDOLS = [
  // 전곡 모드 첫 화면 k-pop 선정
  "뉴진스", "동방신기", "레드벨벳", "르세라핌", "몬스타엑스", "방탄소년단", "블랙핑크", "빅뱅",
  "샤이니", "세븐틴", "소녀시대", "슈퍼주니어", "스트레이 키즈", "아이브", "에스파", "에이티즈",
  "엑소", "엔하이픈", "있지", "투모로우바이투게더", "투피엠", "트와이스",
  // 같은 팀의 영문 표기
  "aespa", "BLACKPINK", "BTS", "ENHYPEN", "ITZY", "IVE", "LE SSERAFIM", "NewJeans",
  "Red Velvet", "SEVENTEEN", "Stray Kids", "TOMORROW X TOGETHER", "TWICE",
  // 아이돌 목록 (사용자 제공 100팀 중 DB 반영분)
  "8TURN", "A.C.E", "After School", "April", "ATBO", "Boyfriend", "Candy Shop", "Cherry Bullet",
  "CLC", "Crayon Pop", "CROSS GENE", "CSR", "Dal Shabet", "DIA", "DKZ", "DXMON", "E'LAST",
  "Fiestar", "Geenius", "Gugudan", "GWSN", "H.O.T.", "HALO", "ILY:1", "IZ*ONE", "JBJ", "KNK",
  "Laboum", "Ladies' Code", "Lovelyz", "LUN8", "mimiirose", "MIRAE", "n.SSign", "NOWADAYS",
  "OMEGA X", "ONE PACT", "OnlyOneOf", "PRISTIN", "Rocket Punch", "SAY MY NAME", "SNUPER",
  "SPICA", "STELLAR", "TEMPEST", "The KingDom", "The Wind", "TIOT", "TRENDZ", "U-KISS",
  "UNICODE", "UP10TION", "VANNER", "VAV", "VCHA", "VERIVERY", "VICTON", "VVUP", "WayV",
  "Weki Meki", "WHIB", "X1", "YOUNITE",
  // 팬덤 목록 중 아이돌 그룹
  "AB6IX", "ASTRO", "BAE173", "cignature", "CIX", "CLASS:y", "DKB", "DRIPPIN", "f(x)", "GHOST9",
  "Golden Child", "LIGHTSUM", "MCND", "ONF", "PENTAGON", "SECRET NUMBER", "SF9", "Weeekly", "WEi",
  "씨야", "SS501", "모모랜드", "보이넥스트도어", "아이오아이", "NMIXX", "부석순", "엑소-첸백시",
  "GD&TOP", "HUNTR/X", "Saja Boys", "DAY6", "FTISLAND", "CNBLUE",
  // 아이돌 멤버의 솔로
  "규현", "문별", "민호", "보아", "비", "소유", "솔라", "슬기", "온유", "유주", "이채연",
  "정은지", "조유리", "조이", "첸", "키", "현아", "휘인", "수지", "이효리", "손담비",
  "전소미", "최예나", "이창섭", "용준형", "도경수", "승리", "권지용", "박지훈", "배진영",
  "ZICO", "Jay Park",
];

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const want = new Set(IDOLS.map(norm));

  const cov = await fetchAll<any>((f, t) => sb.from("artist_serve_coverage")
    .select("spotify_id, name, name_ko, confidence, sp_albums, mb_albums, dz_albums, albums_servable, tracks_servable, release_groups")
    .order("spotify_id").range(f, t));
  const pre = await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id, name, tier").order("spotify_id").range(f, t));
  const picks = await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id, name, genre").order("spotify_id").range(f, t));
  const cache = await fetchAll<any>((f, t) => sb.from("spotify_cache_artists").select("id, name").order("id").range(f, t));

  // spotify_id -> 화면에 쓸 이름 (여러 출처에서 모은다)
  const nameOf = new Map<string, string>();
  for (const r of [...cache.map((c) => ({ spotify_id: c.id, name: c.name })), ...picks, ...pre]) {
    if (r.name && !nameOf.has(r.spotify_id)) nameOf.set(r.spotify_id, r.name);
  }
  for (const c of cov) if (!nameOf.has(c.spotify_id)) nameOf.set(c.spotify_id, c.name_ko || c.name);

  const covOf = new Map(cov.map((c) => [c.spotify_id, c]));
  const tierOf = new Map(pre.map((p) => [p.spotify_id, p.tier]));

  // 이름 -> 그 이름으로 알려진 Spotify ID 들 (영문·한글·MusicBrainz 표기를 모두 본다)
  const idsOfName = new Map<string, Set<string>>();
  const add = (nm: string | null, id: string) => {
    if (!nm) return;
    const k = norm(nm);
    if (!k) return;
    idsOfName.set(k, (idsOfName.get(k) ?? new Set()).add(id));
  };
  for (const [id, nm] of nameOf) add(nm, id);
  for (const c of cov) { add(c.name, c.spotify_id); add(c.name_ko, c.spotify_id); }

  // 아이돌 한 팀당 한 줄. 같은 팀에 Spotify ID 가 여러 개면 가장 많이 확보된 쪽을 쓴다.
  const list0 = IDOLS.map((label) => {
    const ids = [...(idsOfName.get(norm(label)) ?? new Set<string>())];
    if (!ids.length) return null;
    const pick = ids
      .map((id) => ({ id, c: covOf.get(id) }))
      .sort((a, b) => (b.c?.tracks_servable ?? 0) - (a.c?.tracks_servable ?? 0)
                   || (b.c?.albums_servable ?? 0) - (a.c?.albums_servable ?? 0))[0];
    const c = pick.c;
    const tracks = c?.tracks_servable ?? 0;
    const albums = c?.albums_servable ?? 0;
    const rgs = c?.release_groups ?? 0;
    return {
      아티스트: label,
      "DB 표기": c?.name_ko || c?.name || nameOf.get(pick.id) || "",
      상태: tracks > 0 ? "1 트랙리스트 확보" : (rgs > 0 || albums > 0) ? "2 앨범 목록만" : "3 미확보",
      "낼 수 있는 앨범": albums,
      "낼 수 있는 곡": tracks,
      "아는 앨범(발매그룹)": rgs,
      "Spotify 연결 앨범": c?.sp_albums ?? 0,
      "MusicBrainz 단독": c?.mb_albums ?? 0,
      Deezer: c?.dz_albums ?? 0,
      연결근거: c?.confidence ?? "연결없음",
      홍보등급: ids.map((i) => tierOf.get(i)).find(Boolean) ?? "",
      "Spotify ID 중복": ids.length > 1 ? `${ids.length}개` : "",
      spotify_id: pick.id,
      // 이 팀 이름으로 알려진 ID 중 DB 가 아무것도 못 내는 것들 (이용자가 이 ID 로 들어오면 빈 화면이 된다)
      빈ID: ids.filter((i) => (covOf.get(i)?.tracks_servable ?? 0) === 0 && i !== pick.id),
    };
  }).filter(Boolean) as any[];

  // 같은 팀이 한글·영문 두 이름으로 잡히면 한 줄로 합친다 (트와이스 / TWICE)
  const merged = new Map<string, any>();
  for (const r of list0) {
    const key = covOf.get(r.spotify_id)?.mbid ?? r.spotify_id;
    const cur = merged.get(key);
    if (!cur) { merged.set(key, r); continue; }
    if (!cur.아티스트.includes(r.아티스트)) cur.아티스트 = `${cur.아티스트} (${r.아티스트})`;
  }
  const list = [...merged.values()].sort((a: any, b: any) =>
    a.상태.localeCompare(b.상태) || b["낼 수 있는 곡"] - a["낼 수 있는 곡"] || a.아티스트.localeCompare(b.아티스트));

  const risky = list.filter((r: any) => r.빈ID.length && r["낼 수 있는 곡"] > 0);
  for (const r of list) delete r.빈ID;
  const cols = Object.keys(list[0]);
  const csv = (l: any[]) => "\ufeff" + [cols.join(","), ...l.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
  const g1 = list.filter((r) => r.상태.startsWith("1"));
  const g2 = list.filter((r) => r.상태.startsWith("2"));
  const g3 = list.filter((r) => r.상태.startsWith("3"));
  writeFileSync(`${OUT}/1_트랙리스트_확보_아이돌.csv`, csv(g1), "utf8");
  writeFileSync(`${OUT}/2_앨범목록만_아이돌.csv`, csv(g2), "utf8");
  // 미확보가 없으면 이전 실행 때 남은 파일을 지운다 (오래된 명단이 남아 헷갈리지 않게)
  if (g3.length) writeFileSync(`${OUT}/3_미확보_아이돌.csv`, csv(g3), "utf8");
  else rmSync(`${OUT}/3_미확보_아이돌.csv`, { force: true });

  const line = (r: any) => `  ${r.아티스트.padEnd(20)} 앨범 ${String(r["낼 수 있는 앨범"]).padStart(3)} · 곡 ${String(r["낼 수 있는 곡"]).padStart(4)}`;
  const lines = [
    `K-Pop 아이돌 확보 현황 · ${new Date().toLocaleString("ko-KR")}`,
    `아이돌 기준: 아이돌 그룹과 그 멤버의 솔로. 우리 DB 가 아는 ${list.length}팀.`, "",
    `[1] 트랙리스트까지 확보 — ${g1.length}팀 (Spotify 없이 소트를 끝까지 할 수 있다)`,
    ...g1.map(line), "",
    `[2] 앨범 목록까지만 — ${g2.length}팀 (앨범을 누르면 Spotify 를 불러야 한다)`,
    ...g2.map(line), "",
    ...(g3.length ? [`[3] 아직 아무것도 없음 — ${g3.length}팀`, ...g3.map((r) => `  ${r.아티스트}`), ""] : []),
    `[주의] 같은 팀인데 확보되지 않은 Spotify ID 가 따로 있는 경우 — ${risky.length}팀`,
    "  홍보 목록에 들어간 ID 와 MusicBrainz 가 연결한 ID 가 다르다. 이용자가 다른 쪽 ID 로 들어오면",
    "  DB 가 아무것도 못 낸다. 어느 쪽이 진짜인지 확인해 하나로 합쳐야 한다.",
    ...risky.map((r: any) => `  ${r.아티스트}`),
  ];
  writeFileSync(`${OUT}/0_요약.txt`, "\ufeff" + lines.join("\r\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\n${OUT} 에 저장했다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
